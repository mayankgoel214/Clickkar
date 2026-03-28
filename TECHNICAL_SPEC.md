# WhatsAds — Complete Technical Integration Specification

> WhatsApp-only product photography service. Users send product photos via WhatsApp, pay Rs 99, receive
> AI-processed professional photos back. This document covers every technical decision needed to build the
> backend integration layer.

---

## TABLE OF CONTENTS

1. [WhatsApp Business Cloud API](#part-1-whatsapp-business-cloud-api)
2. [Razorpay Payment Integration](#part-2-razorpay-payment-integration)
3. [Voice Note Processing](#part-3-voice-note-processing)
4. [Session Management and State Machine](#part-4-session-management-and-state-machine)
5. [WhatsApp Message Design Constraints](#part-5-whatsapp-message-design-constraints)
6. [Database Schema](#database-schema)
7. [Environment Variables Reference](#environment-variables-reference)

---

## PART 1: WhatsApp Business Cloud API

### 1.1 Account Setup with an Existing Indian Mobile Number

**What you need before you start:**
- A Meta Business Manager account (business.facebook.com) — free, takes 10 minutes
- A phone number that can receive SMS or a voice call (your Indian mobile number)
- GSTIN or other business document for business verification (required for Tier 1+)

**Critical rule about existing numbers:**
A number registered on WhatsApp Messenger or WhatsApp Business App must be deregistered from those
apps before it can be used on the Cloud API. You cannot run both simultaneously.

Migration steps:
1. Open WhatsApp / WhatsApp Business App on the phone.
2. Go to Settings → Account → Delete Account. This removes the number from WhatsApp's consumer
   infrastructure.
3. Wait up to 3 minutes for the number to become available on the platform.
4. In Meta Developer Portal → Your App → WhatsApp → API Setup, click "Add phone number."
5. Select country code (+91 for India), enter the number.
6. Choose OTP delivery method: SMS or Voice Call.
7. Enter the 6-digit OTP. The number is now registered on the Cloud API.

**Recommendation for WhatsAds:** Do NOT use your personal WhatsApp number. Get a dedicated SIM
(Jio/Airtel) for the business number. This number becomes the bot's identity and cannot be used on any
WhatsApp app concurrently.

**Permanent Access Token (critical):**
The default token in the API Setup panel is temporary (expires in 60 days). For production:
1. Meta Business Manager → Settings → System Users → Add a System User (role: Admin).
2. Add your WhatsApp app with `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
3. Generate a token. This token does not expire.
4. Store in `WHATSAPP_ACCESS_TOKEN` env var. Rotate annually as a security practice.

---

### 1.2 Webhook Setup

**What to subscribe to:**
In Meta Developer Portal → WhatsApp → Configuration → Webhook, subscribe to the `messages` field.
This single field delivers: incoming messages (all types), message status updates (sent/delivered/read),
and message errors.

**Webhook verification (GET request from Meta):**

```typescript
// src/app/api/v1/webhooks/whatsapp/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}
```

**WHATSAPP_VERIFY_TOKEN** is a string you invent (e.g., a UUID). Set it in both your env vars and
Meta's webhook configuration panel.

---

### 1.3 Webhook Payload Formats

All webhook payloads are POSTed to your endpoint. Max payload size is 3MB. Always return HTTP 200
immediately (within 20 seconds or Meta retries). Process asynchronously.

**Top-level wrapper (identical for all message types):**

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "9198XXXXXXXX",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{
          "profile": { "name": "Rahul Sharma" },
          "wa_id": "919876543210"
        }],
        "messages": [{ ...message object... }],
        "statuses": [{ ...status object... }]
      },
      "field": "messages"
    }]
  }]
}
```

**Extractor utility:**

```typescript
// src/lib/integrations/whatsapp/webhook.ts
export function extractMessage(body: WhatsAppWebhookBody) {
  const value = body.entry?.[0]?.changes?.[0]?.value;
  return {
    message: value?.messages?.[0] ?? null,
    status: value?.statuses?.[0] ?? null,
    contact: value?.contacts?.[0] ?? null,
    phoneNumberId: value?.metadata?.phone_number_id ?? null,
  };
}
```

**Text message payload:**

```json
{
  "from": "919876543210",
  "id": "wamid.XXXX",
  "timestamp": "1735000000",
  "type": "text",
  "text": { "body": "Hello, I want to edit my product photo" }
}
```

**Image message payload:**

```json
{
  "from": "919876543210",
  "id": "wamid.XXXX",
  "timestamp": "1735000000",
  "type": "image",
  "image": {
    "id": "MEDIA_ID",
    "mime_type": "image/jpeg",
    "sha256": "HASH",
    "caption": "optional caption text"
  }
}
```

**Audio / Voice Note payload:**

```json
{
  "from": "919876543210",
  "id": "wamid.XXXX",
  "timestamp": "1735000000",
  "type": "audio",
  "audio": {
    "id": "MEDIA_ID",
    "mime_type": "audio/ogg; codecs=opus",
    "sha256": "HASH",
    "voice": true
  }
}
```

The `"voice": true` field distinguishes a voice note from an uploaded audio file. Both are handled
identically for download purposes.

**Interactive button reply (user taps a button):**

```json
{
  "from": "919876543210",
  "id": "wamid.XXXX",
  "timestamp": "1735000000",
  "type": "interactive",
  "interactive": {
    "type": "button_reply",
    "button_reply": {
      "id": "btn_confirm_order",
      "title": "Yes, Confirm"
    }
  }
}
```

**Interactive list selection (user picks from a list):**

```json
{
  "from": "919876543210",
  "id": "wamid.XXXX",
  "timestamp": "1735000000",
  "type": "interactive",
  "interactive": {
    "type": "list_reply",
    "list_reply": {
      "id": "style_white_bg",
      "title": "White Background",
      "description": "Clean studio look"
    }
  }
}
```

**Message status update payload:**

```json
{
  "from": "919876543210",
  "id": "wamid.XXXX",
  "timestamp": "1735000000",
  "status": "delivered",
  "conversation": {
    "id": "CONVERSATION_ID",
    "origin": { "type": "utility" }
  },
  "pricing": {
    "billable": true,
    "pricing_model": "CBP",
    "category": "utility"
  }
}
```

Status values: `sent` → `delivered` → `read` → (or `failed` if delivery failed).

---

### 1.4 Sending Messages

**Base client:**

```typescript
// src/lib/integrations/whatsapp/client.ts
const GRAPH_API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

async function sendMessage(phoneNumberId: string, payload: object) {
  const url = `${BASE_URL}/${phoneNumberId}/messages`;
  const start = Date.now();

  let response: Response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 429 || response.status >= 500) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      break;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  const duration = Date.now() - start;
  const data = await response!.json();

  console.log(JSON.stringify({
    level: response!.ok ? "info" : "error",
    service: "whatsapp",
    method: "POST",
    url,
    status: response!.status,
    duration_ms: duration,
    message_id: data?.messages?.[0]?.id,
    error: data?.error,
  }));

  if (!response!.ok) throw new WhatsAppError(data.error);
  return data;
}
```

**Send text:**

```typescript
export async function sendText(to: string, body: string) {
  return sendMessage(process.env.WHATSAPP_PHONE_NUMBER_ID!, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  });
}
```

**Send image (by URL):**

```typescript
export async function sendImage(to: string, imageUrl: string, caption?: string) {
  return sendMessage(process.env.WHATSAPP_PHONE_NUMBER_ID!, {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link: imageUrl, caption },
  });
}
```

**Send interactive buttons (max 3 buttons, max 20 chars per button title):**

```typescript
export async function sendButtons(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  headerText?: string,
  footerText?: string
) {
  return sendMessage(process.env.WHATSAPP_PHONE_NUMBER_ID!, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      ...(headerText && { header: { type: "text", text: headerText } }),
      body: { text: bodyText },
      ...(footerText && { footer: { text: footerText } }),
      action: {
        buttons: buttons.slice(0, 3).map(b => ({
          type: "reply",
          reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}
```

**Send interactive list (max 10 items, max 24 chars per title):**

```typescript
export async function sendList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  items: Array<{ id: string; title: string; description?: string }>
) {
  return sendMessage(process.env.WHATSAPP_PHONE_NUMBER_ID!, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [{
          title: "Choose one",
          rows: items.slice(0, 10).map(item => ({
            id: item.id.slice(0, 200),
            title: item.title.slice(0, 24),
            ...(item.description && { description: item.description.slice(0, 72) }),
          })),
        }],
      },
    },
  });
}
```

**Send template message:**

```typescript
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: object[] = []
) {
  return sendMessage(process.env.WHATSAPP_PHONE_NUMBER_ID!, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  });
}

// Example: send welcome template with user name
// await sendTemplate("919876543210", "whatsads_welcome", "en", [
//   { type: "body", parameters: [{ type: "text", text: "Rahul" }] }
// ]);
```

---

### 1.5 Media Handling: Download Images and Voice Notes

**Two-step process. The media URL expires in approximately 5 minutes. Download immediately.**

```typescript
// src/lib/integrations/whatsapp/media.ts
import { createClient } from "@supabase/supabase-js";

const GRAPH_API_VERSION = "v21.0";

export async function downloadAndStoreMedia(
  mediaId: string,
  folder: "images" | "audio",
  orderId: string
): Promise<string> {
  // Step 1: Get media URL from Graph API
  const metaUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });

  if (!metaRes.ok) {
    throw new Error(`Media metadata fetch failed: ${metaRes.status}`);
  }

  const { url: mediaUrl, mime_type } = await metaRes.json();

  // Step 2: Download binary with auth header (required)
  const fileRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });

  if (!fileRes.ok) {
    throw new Error(`Media download failed: ${fileRes.status}`);
  }

  const buffer = await fileRes.arrayBuffer();
  const ext = mime_type.includes("ogg") ? "ogg" : mime_type.split("/")[1];
  const filename = `${folder}/${orderId}/${mediaId}.${ext}`;

  // Store immediately in Supabase Storage
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.storage
    .from("whatsads-media")
    .upload(filename, buffer, { contentType: mime_type, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  // Return public or signed URL
  const { data } = supabase.storage
    .from("whatsads-media")
    .getPublicUrl(filename);

  return data.publicUrl;
}
```

**Important facts about media:**
- The initial webhook payload contains only the `media_id`, NOT the URL or binary.
- The URL you get from step 1 expires in approximately 5 minutes. Download before that.
- WhatsApp stores media on their servers for 14 days. After that it is gone.
- The download request in step 2 requires the `Authorization: Bearer TOKEN` header. Requests without
  it return 401.
- Max upload file size from users: 100MB (all media types). Practical limit for images: 5MB.

---

### 1.6 Rate Limits and Throttling

**Message throughput (messages per second per phone number):**

| Condition | Throughput |
|---|---|
| Default (all new numbers) | 80 messages/second |
| Coexistence numbers | 20 messages/second (fixed) |
| Upgraded (unlimited tier + green quality) | Up to 1,000 messages/second |

**Messaging limits (unique users per 24 hours) — as of October 2025, applied per Business Portfolio:**

| Tier | Unique users / 24h | How to reach |
|---|---|---|
| Unverified | 250 | Default for new accounts |
| Tier 1 | 1,000 | Business verified + 500 messages sent |
| Tier 2 | 10,000 | Quality rating maintained |
| Tier 3 | 100,000 | Quality rating maintained |
| Unlimited | No limit | Volume + quality threshold |

**WhatsAds implication:** At launch, you are limited to 250 unique users per day. Submit business
verification (GSTIN, company registration) immediately to unlock Tier 1.

**Media upload rate limit:** 25 requests/second per phone number.

**Media retrieval:** No fixed RPS, but if you get 20 errors in a 60-minute window, retrieval is blocked
for 30 minutes. This means: store media in Supabase Storage immediately on receipt; never re-fetch
from Meta URLs more than once per media ID.

**Key error codes and handling:**

| Error Code | Meaning | Action |
|---|---|---|
| 130429 | Throughput limit exceeded | Exponential backoff, queue messages |
| 131026 | Message undeliverable | Log, mark as failed, do not retry |
| 131047 | Re-engagement message — 24h window closed | Send a template instead |
| 131056 | Pair rate limit hit | Back off, slow down per-recipient sends |
| 131051 | Unsupported message type | Check message type before sending |
| 131009 | Parameter missing or invalid | Fix payload, do not retry automatically |
| 0 | Auth exception | Token expired — rotate token immediately |
| 132069 | Flow throttled | Notify ops, do not retry for 1 hour |

---

### 1.7 Conversation Pricing (Post July 2025 Per-Message Model)

Starting July 1, 2025, Meta switched from per-conversation to per-message pricing.

**India rates (per message, in INR approx):**

| Message type | Rate |
|---|---|
| Marketing template | Rs 0.88/message |
| Utility template | Rs 0.125/message |
| Authentication template | Rs 0.125/message |
| Service messages (free-form replies within 24h window) | Free |
| Utility template sent within open customer service window | Free |

**The 24-hour Customer Service Window (CSW):**
- Opens when a user sends you any message.
- Stays open for 24 hours from the user's LAST message.
- While the CSW is open: you can send free-form text, images, interactive messages — no template
  required. These are Service messages and are free.
- Utility templates sent within an open CSW are also free.
- When the CSW closes: you can ONLY send approved template messages (marketing, utility, or
  authentication). You cannot send free-form messages.

**WhatsAds cost model example:**
- User sends photo → CSW opens (free)
- Bot replies with onboarding instructions → free (service message)
- Bot sends payment link → free (utility template within CSW, or free service message)
- Bot sends processed photos → free (within CSW)
- If order takes >24h and bot needs to notify → utility template at Rs 0.125/message
- Bot sends promotional follow-up 3 days later → marketing template at Rs 0.88/message

**First 1,000 conversations per month remain free** under the legacy free-tier policy (Meta may adjust
this; verify on your dashboard).

---

### 1.8 Template Messages: When Required and Approval Process

**When templates are required:**
- Any time you initiate a message to a user AND no CSW is open for that user.
- Any time you want to send a structured interactive message outside the CSW.
- Re-engagement: user did not message in 24h and you need to follow up.

**When templates are NOT required (within open CSW):**
- Text replies
- Image messages
- Interactive button / list messages
- Voice messages

**Template approval process:**
1. Create template in Meta Business Manager → WhatsApp → Message Templates.
2. Choose category: Marketing, Utility, or Authentication.
3. Write template body with `{{1}}`, `{{2}}` placeholders for dynamic content.
4. Optionally add header (image, video, document, or text) and footer.
5. Submit. Meta reviews in 24–48 hours (sometimes 30 minutes for simple templates).
6. From April 9, 2025: Meta can automatically re-categorize your template (e.g., from Utility to
   Marketing). This changes billing. Monitor your approved templates.

**Templates you must create for WhatsAds before launch:**

| Template Name | Category | Purpose |
|---|---|---|
| `whatsads_welcome` | Utility | First contact when user messages for first time |
| `whatsads_payment_reminder` | Utility | Re-engage user who started order but did not pay |
| `whatsads_order_complete` | Utility | Deliver processed photos after >24h |
| `whatsads_reorder_promo` | Marketing | Upsell to returning customers |

**What happens when the CSW expires mid-conversation:**
- The bot can no longer send free-form messages.
- Any attempt to send a non-template message returns error `131047`.
- Your state machine must detect this and switch to template-only mode.
- Implementation: check `last_user_message_at` timestamp. If `now - last_user_message_at > 23h`,
  proactively use templates for any outbound messages.
- If the user is in AWAITING_PAYMENT state and 24h passes, send `whatsads_payment_reminder` template.

---

### 1.9 Sandbox / Test Number Limitations

The Meta developer portal provides a test phone number for development:
- Can only send messages to numbers explicitly added in the "To" field of API Setup panel.
- Maximum 5 recipient numbers can be added in test mode.
- You cannot add just any number — the recipient must verify themselves through Meta's portal.
- Cannot receive incoming messages from arbitrary numbers.
- Template approval is not required in test mode.
- UPI payment links from Razorpay do NOT work in Razorpay test mode (UPI links are live-only).

**Recommendation:** Use the sandbox only for webhook shape validation and message format testing.
For end-to-end payment flow testing, use live mode with a test SIM card.

---

## PART 2: Razorpay Payment Integration

### 2.1 Payment Links API: Create a Rs 99 Payment Link

Payment Links are the correct integration pattern for WhatsApp. The standard Razorpay Checkout (which
requires a browser SDK) cannot run inside WhatsApp. Payment Links open in the system browser, collect
payment, and trigger a webhook to your server.

**Create a standard payment link:**

```typescript
// src/lib/integrations/razorpay/client.ts
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export interface CreatePaymentLinkOptions {
  orderId: string;       // Your internal order ID (for idempotency)
  userPhone: string;     // "919876543210"
  userName: string;
  expiresInMinutes?: number; // Default 30 minutes for WhatsAds urgency
}

export async function createPaymentLink(opts: CreatePaymentLinkOptions): Promise<string> {
  const expireBy = Math.floor(Date.now() / 1000) + (opts.expiresInMinutes ?? 30) * 60;

  const link = await razorpay.paymentLink.create({
    amount: 9900,           // Rs 99 in paise
    currency: "INR",
    accept_partial: false,
    description: "WhatsAds — Professional Product Photography",
    customer: {
      contact: `+${opts.userPhone}`,
      name: opts.userName,
    },
    notify: {
      sms: false,     // We notify via WhatsApp ourselves
      email: false,
    },
    reminder_enable: false, // We handle reminders via WhatsApp
    reference_id: opts.orderId, // Your internal order ID — used for idempotency lookup
    expire_by: expireBy,
    options: {
      checkout: {
        name: "WhatsAds",
        prefill: { contact: `+${opts.userPhone}` },
        // Make UPI appear first
        method: {
          upi: 1,
          card: 1,
          netbanking: 1,
          wallet: 0,
        },
      },
    },
  });

  return link.short_url; // e.g., "https://rzp.io/i/AbCdEf"
}
```

**Send link in WhatsApp:**

```typescript
const paymentUrl = await createPaymentLink({ orderId, userPhone, userName });
await sendText(
  userPhone,
  `Pay Rs 99 to process your product photos:\n\n${paymentUrl}\n\nLink valid for 30 minutes. Tap to pay via UPI, card, or netbanking.`
);
```

---

### 2.2 UPI Payment Support

**Standard payment links already support UPI.** When the user taps the link on their Android or iOS
device, the Razorpay hosted page detects mobile and shows UPI apps installed on the device (GPay,
PhonePe, Paytm, BHIM, etc.).

**UPI-only payment links** (for a cleaner UPI-focused experience):

```typescript
// UPI-only link — set upi_link: true
const upiLink = await razorpay.paymentLink.create({
  amount: 9900,
  currency: "INR",
  description: "WhatsAds Product Photography",
  upi_link: true,          // Makes this UPI-only
  customer: { contact: `+${userPhone}` },
  reference_id: orderId,
});
```

**CRITICAL WARNING:** UPI Payment Links are NOT available in Razorpay test mode. You must use live
mode (with real credentials) to test the full UPI flow. Use a small amount (Re 1) for development
testing with live credentials.

---

### 2.3 Webhook: `payment_link.paid` Event

**Configure webhook in Razorpay Dashboard:**
Dashboard → Account & Settings → Webhooks → Add New Webhook → URL: `https://yourdomain.com/api/v1/webhooks/razorpay`

Subscribe to events: `payment_link.paid`, `payment_link.cancelled`, `payment.failed`.

**Signature verification (ALWAYS do this first):**

```typescript
// src/app/api/v1/webhooks/razorpay/route.ts
import crypto from "crypto";

function verifyRazorpaySignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)        // MUST be raw body string, not parsed JSON
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
}

export async function POST(req: Request) {
  const rawBody = await req.text(); // Get raw body BEFORE parsing
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  if (!verifyRazorpaySignature(rawBody, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);

  // Store raw payload first for debugging and replay
  await storeWebhookEvent("razorpay", event.event, rawBody);

  switch (event.event) {
    case "payment_link.paid":
      await handlePaymentLinkPaid(event.payload);
      break;
    case "payment.failed":
      await handlePaymentFailed(event.payload);
      break;
  }

  return Response.json({ status: "ok" });
}
```

**`payment_link.paid` payload structure:**

```json
{
  "entity": "event",
  "account_id": "acc_XXXXX",
  "event": "payment_link.paid",
  "contains": ["payment_link", "payment"],
  "payload": {
    "payment_link": {
      "entity": {
        "id": "plink_XXXXX",
        "amount": 9900,
        "currency": "INR",
        "status": "paid",
        "reference_id": "YOUR_INTERNAL_ORDER_ID",
        "short_url": "https://rzp.io/i/AbCdEf",
        "customer": {
          "contact": "+919876543210"
        }
      }
    },
    "payment": {
      "entity": {
        "id": "pay_XXXXX",
        "amount": 9900,
        "currency": "INR",
        "status": "captured",
        "method": "upi",
        "vpa": "user@okaxis",
        "created_at": 1735000000
      }
    }
  }
}
```

**Key fields to extract:**
- `payload.payment_link.entity.reference_id` — your internal order ID
- `payload.payment.entity.id` — Razorpay payment ID (store for refunds)
- `payload.payment.entity.method` — `"upi"`, `"card"`, `"netbanking"`, etc.

---

### 2.4 Idempotency: Handling Duplicate Payments and Webhooks

**Webhook deduplication (webhooks can fire multiple times):**

```typescript
async function handlePaymentLinkPaid(payload: RazorpayPaymentLinkPaidPayload) {
  const orderId = payload.payment_link.entity.reference_id;
  const razorpayPaymentId = payload.payment.entity.id;

  // Idempotency check: has this payment already been processed?
  const existing = await supabase
    .from("payments")
    .select("id")
    .eq("razorpay_payment_id", razorpayPaymentId)
    .single();

  if (existing.data) {
    // Already processed. Return 200 to stop Razorpay retries.
    console.log(`Duplicate webhook for payment ${razorpayPaymentId}, skipping`);
    return;
  }

  // Mark payment as captured in a transaction
  await supabase.rpc("mark_payment_captured", {
    p_order_id: orderId,
    p_razorpay_payment_id: razorpayPaymentId,
    p_amount: payload.payment.entity.amount,
    p_method: payload.payment.entity.method,
  });

  // Transition order state to PROCESSING
  await updateOrderState(orderId, "PROCESSING");

  // Notify user via WhatsApp
  const order = await getOrder(orderId);
  await sendText(
    order.user_phone,
    "Payment received! Your photos are being processed. We'll send them to you within 30 minutes."
  );

  // Trigger photo processing job
  await enqueuePhotoProcessing(orderId);
}
```

**What if the user double-pays (rare but possible if they tap "back" and try again):**
- The payment link has `accept_partial: false` and a fixed amount.
- Razorpay itself prevents double payment on the same payment link — once paid, the link shows "Already Paid."
- However, if you generate TWO links for the same order (bug scenario), both could be paid.
- Guard: use `reference_id` (your order ID) as the deduplication key. If `payments` table already has
  a captured payment for this order ID, issue a refund for the second payment automatically.

---

### 2.5 Polling Fallback When Webhook Is Delayed

Razorpay retries webhooks for up to 24 hours with exponential backoff. But for real-time user experience,
implement a polling fallback:

```typescript
// src/lib/integrations/razorpay/poll.ts
export async function pollPaymentLinkStatus(
  paymentLinkId: string,
  orderId: string,
  maxAttempts = 10
): Promise<"paid" | "pending" | "expired"> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000 * (i + 1))); // 5s, 10s, 15s...

    const link = await razorpay.paymentLink.fetch(paymentLinkId);

    if (link.status === "paid") {
      // Process payment if webhook hasn't fired yet
      const alreadyProcessed = await checkPaymentAlreadyProcessed(orderId);
      if (!alreadyProcessed) {
        await processPaymentFromPoll(link, orderId);
      }
      return "paid";
    }

    if (link.status === "expired" || link.status === "cancelled") {
      return "expired";
    }
  }
  return "pending";
}
```

**Trigger polling** from a Supabase Edge Function or a delayed job that runs 2 minutes after payment
link creation if the order status hasn't changed.

---

### 2.6 Payment Failure and User Retry Flow

```typescript
async function handlePaymentFailed(payload: RazorpayPaymentFailedPayload) {
  const orderId = payload.payment_link.entity.reference_id;
  const order = await getOrder(orderId);

  if (order.payment_attempt_count >= 3) {
    // Too many failures — offer support
    await sendText(
      order.user_phone,
      "We noticed 3 payment attempts failed. Please try a different payment method or contact us at support@whatsads.com"
    );
    return;
  }

  // Increment failure count and generate fresh link
  await incrementPaymentAttempts(orderId);
  const newLink = await createPaymentLink({
    orderId,
    userPhone: order.user_phone,
    userName: order.user_name,
    expiresInMinutes: 20,
  });

  await sendButtons(
    order.user_phone,
    "Your payment didn't go through. Try again?",
    [
      { id: "retry_payment", title: "Pay Rs 99" },
      { id: "cancel_order", title: "Cancel Order" },
    ]
  );
}
```

---

### 2.7 Refunds

```typescript
// src/lib/integrations/razorpay/refund.ts
export async function issueRefund(
  razorpayPaymentId: string,
  amountPaise: number,
  reason: string
): Promise<string> {
  const refund = await razorpay.payments.refund(razorpayPaymentId, {
    amount: amountPaise,
    speed: "optimum",    // "optimum" = instant if possible, else normal (5-7 days)
    notes: { reason },
  });

  // Log and store refund ID
  await supabase.from("refunds").insert({
    razorpay_refund_id: refund.id,
    razorpay_payment_id: razorpayPaymentId,
    amount: amountPaise,
    status: refund.status,
    reason,
  });

  return refund.id;
}
```

---

### 2.8 Razorpay Transaction Economics for Rs 99

| Payment method | Razorpay fee | GST (18%) | Net fee | You receive |
|---|---|---|---|---|
| UPI | 2% | 0.36% | 2.36% | Rs 96.66 |
| Debit card | 2% | 0.36% | 2.36% | Rs 96.66 |
| Credit card | 2% | 0.36% | 2.36% | Rs 96.66 |
| Net banking | 2% | 0.36% | 2.36% | Rs 96.66 |
| Corporate card / Amex | 3% | 0.54% | 3.54% | Rs 96.49 |

At Rs 99, Razorpay charges approximately Rs 2.34 in fees (2% + 18% GST on 2%). You receive ~Rs 96.66
per successful UPI payment.

**No setup fee, no monthly fee** on the standard plan. Fees apply only on successful transactions.

---

### 2.9 Branding and Customization

You can customize the hosted payment page via the `options.checkout` object:
- Set `name` (displayed as merchant name)
- Set brand color via `options.checkout.theme.color`
- Reorder payment methods (put UPI first for India)
- Pre-fill customer contact so they don't have to type their number

You **cannot** fully white-label the Razorpay page on the standard plan. A "Powered by Razorpay" logo
will appear. Full white-labeling requires an enterprise agreement.

---

### 2.10 Alternatives Comparison

| Gateway | UPI | WhatsApp-native | Setup difficulty | Fee |
|---|---|---|---|---|
| Razorpay Payment Links | Yes | No (opens browser) | Low | 2% + GST |
| Cashfree Payment Links | Yes | No (opens browser) | Low | 1.75% + GST |
| PhonePe for Business | Yes (UPI only) | No | Medium | 0% (UPI, mandate-based) |
| Razorpay WhatsApp Pay | Not generally available | Yes, in beta | High (waitlist) | TBD |

**Recommendation:** Razorpay Payment Links is the right choice for WhatsAds. Cashfree is slightly
cheaper (1.75% vs 2%) but Razorpay has better documentation, webhook reliability, and Indian developer
ecosystem support. The difference at Rs 99 is Rs 0.23 per transaction — irrelevant at early scale.

PhonePe Business is 0% MDR for UPI but requires a separate integration, no payment link API as
developer-friendly as Razorpay, and does not support card payments for non-UPI users.

---

## PART 3: Voice Note Processing

### 3.1 WhatsApp Voice Note Technical Format

- **Codec:** Opus
- **Container:** OGG (`.ogg` file extension, MIME type: `audio/ogg; codecs=opus`)
- **Sample rate:** 16kHz (most voice notes) or 48kHz (some devices)
- **Bitrate:** 16–32kbps (variable, depends on WhatsApp client version)
- **Typical file size:** 20–100KB for a 10-second voice note
- **Mono channel** (single channel audio)

Most modern transcription APIs accept OGG/Opus natively. You can skip conversion for Sarvam AI,
Deepgram, and OpenAI Whisper.

**If conversion is needed** (e.g., for APIs requiring WAV or MP3):

```typescript
// Using ffmpeg (install: apt-get install ffmpeg or brew install ffmpeg)
import { execSync } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

export function convertOggToWav(oggBuffer: ArrayBuffer): Buffer {
  const tempOgg = path.join(tmpdir(), `${Date.now()}.ogg`);
  const tempWav = path.join(tmpdir(), `${Date.now()}.wav`);

  writeFileSync(tempOgg, Buffer.from(oggBuffer));
  execSync(`ffmpeg -i ${tempOgg} -ar 16000 -ac 1 ${tempWav} -y -loglevel error`);
  return readFileSync(tempWav);
}
```

For serverless (Vercel/Supabase Edge Functions), use `@ffmpeg/ffmpeg` (WebAssembly) instead of the
native binary. Alternatively, use a Supabase Edge Function with Deno and call a conversion service.

---

### 3.2 Transcription API Comparison for Indian Languages

#### Option A: Sarvam AI (RECOMMENDED for WhatsAds)

**Why:** Built specifically for Indian languages. Only API with all 22 scheduled Indian languages plus
code-switching support. Priced in INR. Understands Indian phone-quality audio.

**Languages:** Hindi, Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Marathi, Punjabi, Odia,
Assamese, and 11 more Indian languages + English (Indian accent).

**Model:** Saaras v3 — auto-detects language, handles Hindi-English code-mixing seamlessly.

**Audio formats accepted:** MP3, WAV, AAC, OGG, Opus, FLAC, M4A, AMR, WMA, WebM — OGG/Opus from
WhatsApp works directly without conversion.

**Pricing:** Per second of audio. Typical WhatsApp voice note (10s) costs a fraction of a rupee.

**API integration:**

```typescript
// src/lib/integrations/sarvam/transcribe.ts
export interface TranscriptionResult {
  text: string;
  language_code: string;
  confidence?: number;
}

export async function transcribeVoiceNote(
  audioBuffer: ArrayBuffer,
  mimeType: string = "audio/ogg"
): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([audioBuffer], { type: mimeType }),
    "voice_note.ogg"
  );
  formData.append("model", "saaras:v3");
  formData.append("language_code", "auto"); // Auto-detect Indian language

  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: {
      "api-subscription-key": process.env.SARVAM_API_KEY!,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Sarvam transcription failed: ${JSON.stringify(err)}`);
  }

  const result = await response.json();
  return {
    text: result.transcript,
    language_code: result.language_code,
  };
}
```

**Handling low-confidence or failed transcriptions:**

```typescript
export async function safeTranscribeVoiceNote(
  audioBuffer: ArrayBuffer,
  userPhone: string
): Promise<string | null> {
  try {
    const result = await transcribeVoiceNote(audioBuffer);

    if (!result.text || result.text.trim().length < 3) {
      // Too short to be meaningful
      await sendText(
        userPhone,
        "I couldn't understand your voice note. Could you type your instructions instead?"
      );
      return null;
    }

    return result.text;
  } catch (err) {
    console.error("Transcription failed", err);
    await sendText(
      userPhone,
      "I had trouble processing your voice note. Please type your instructions and I'll follow them."
    );
    return null;
  }
}
```

---

#### Option B: OpenAI Whisper (via API)

**Strengths:** Excellent multilingual accuracy, strong on code-mixed audio (Hinglish), handles
background noise well (8.6/10 noise score vs Google's 2.8/10).

**Weaknesses:** Pricing in USD, not optimized specifically for Indian languages, 98 languages but
some Indian languages less accurate than Sarvam. No native INR billing.

**Indian language accuracy:** Good for Hindi and commonly used Indian English. Lower accuracy for
less-resourced languages like Odia, Assamese, Maithili.

**Pricing:** ~$0.006/minute via OpenAI API (Whisper model).

```typescript
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeWithWhisper(audioBuffer: ArrayBuffer): Promise<string> {
  const file = new File([audioBuffer], "voice.ogg", { type: "audio/ogg" });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "hi", // hint — or omit for auto-detection
    response_format: "json",
  });

  return transcription.text;
}
```

---

#### Option C: Deepgram Nova-2

**Strengths:** Fast (real-time capable), good Hindi accuracy (41% WER improvement over competitors),
explicitly supports Hindi, Tamil, Telugu, Kannada. Developer-friendly API. $0.0043/minute.

**Weaknesses:** Fewer Indian languages than Sarvam. No code-switching support. Weaker on languages
beyond the 4 explicitly supported Indian ones.

**Best for:** If you need real-time streaming transcription or handle very high volume.

```typescript
import { createClient } from "@deepgram/sdk";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

export async function transcribeWithDeepgram(audioBuffer: ArrayBuffer): Promise<string> {
  const { result } = await deepgram.listen.prerecorded.transcribeFile(
    Buffer.from(audioBuffer),
    {
      model: "nova-2",
      language: "hi",     // or "ta", "te", "kn"
      smart_format: true,
      punctuate: true,
    }
  );

  return result.results.channels[0].alternatives[0].transcript;
}
```

---

#### Option D: Google Cloud Speech-to-Text

**Strengths:** 125+ languages, good dialect support for Indian English.

**Weaknesses:** Very poor noise handling (2.8/10 vs Whisper's 8.6/10). WhatsApp voice notes are
recorded on phones in real-world environments with significant background noise. Google STT degrades
badly in these conditions. Not recommended for WhatsAds use case.

---

#### Option E: Azure Cognitive Services Speech

**Strengths:** Supports Hindi, Tamil, Telugu, Kannada, Marathi, Gujarati, Bengali, Punjabi. Enterprise
SLA available.

**Weaknesses:** Pricing complexity, not optimized for code-switching, USD billing, slower to set up.
Better suited for enterprise call center use cases than a WhatsApp bot.

---

### 3.3 Final Recommendation: Sarvam AI as Primary, Whisper as Fallback

```typescript
// src/lib/integrations/transcription/index.ts
export async function transcribeIndianVoiceNote(
  audioBuffer: ArrayBuffer
): Promise<{ text: string; source: "sarvam" | "whisper" }> {
  // Primary: Sarvam AI
  try {
    const result = await transcribeVoiceNote(audioBuffer);
    if (result.text && result.text.length > 2) {
      return { text: result.text, source: "sarvam" };
    }
  } catch (err) {
    console.warn("Sarvam transcription failed, falling back to Whisper", err);
  }

  // Fallback: OpenAI Whisper
  const text = await transcribeWithWhisper(audioBuffer);
  return { text, source: "whisper" };
}
```

**Handling code-switching (Hinglish):**
Sarvam v3 handles this natively. The model understands "mujhe white background chahiye with shadows
removed" (Hindi-English mix) correctly. No special handling required. Just pass the audio as-is.

**Handling low-quality audio:**
- Sarvam is trained on 8kHz call-center audio. WhatsApp's 16kHz is better than what it's trained on.
- If transcription confidence is low (API returns empty or very short text), fall back to Whisper.
- Always have a text fallback prompt for the user.

---

## PART 4: Session Management and State Machine

### 4.1 Why Server-Side State Is Required

WhatsApp webhooks are stateless HTTP POST requests. When a user sends a message, Meta POSTs a payload
to your endpoint. The payload contains the message content and the sender's phone number but has no
memory of previous messages. You must store all conversation state on your server, keyed by phone number.

### 4.2 State Machine Definition

```
IDLE
  → user sends any message
  → ONBOARDING

ONBOARDING
  → bot sends welcome + asks for product name
  → user replies with product name
  → AWAITING_IMAGES

AWAITING_IMAGES
  → user sends image (can receive multiple, batch them)
  → after 30s of silence since last image, or user taps "Done"
  → AWAITING_VOICE (if voice note option offered)
  → or AWAITING_STYLE (if voice skipped)

AWAITING_VOICE
  → user sends voice note or types instructions
  → AWAITING_STYLE

AWAITING_STYLE
  → bot sends style selection list
  → user picks style
  → CONFIRMING

CONFIRMING
  → bot shows order summary + price
  → user taps Confirm or Cancel
  → if Confirm → AWAITING_PAYMENT
  → if Cancel → IDLE

AWAITING_PAYMENT
  → bot sends payment link
  → webhook fires payment_link.paid → PROCESSING
  → 30-minute timeout with no payment → send reminder template → AWAITING_PAYMENT
  → 24-hour timeout with no payment → expire order → IDLE

PROCESSING
  → photo processing job runs
  → job completes → DELIVERED
  → job fails → send error, retry, or escalate

DELIVERED
  → bot sends processed photos
  → bot asks for feedback / offers edit
  → user asks for edit → AWAITING_EDIT
  → user satisfied → IDLE

AWAITING_EDIT
  → user describes edit (text or voice)
  → EDIT_PROCESSING

EDIT_PROCESSING
  → processing edit
  → complete → DELIVERED (shows revised photos)
```

### 4.3 Database Schema for Sessions

```sql
-- sessions table (one row per phone number)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,     -- "919876543210"
  state text not null default 'IDLE',
  -- order context
  current_order_id uuid references orders(id),
  product_name text,
  style_selection text,
  voice_instructions text,
  image_urls text[] default '{}',
  -- timing
  last_user_message_at timestamptz,
  state_entered_at timestamptz default now(),
  -- 24h window tracking
  csw_expires_at timestamptz,            -- last_user_message_at + 24h
  -- meta
  payment_attempt_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on sessions(phone_number);
create index on sessions(state);
create index on sessions(csw_expires_at);
```

### 4.4 State Machine Implementation

```typescript
// src/lib/state-machine/index.ts
import { createClient } from "@supabase/supabase-js";

type ConversationState =
  | "IDLE"
  | "ONBOARDING"
  | "AWAITING_IMAGES"
  | "AWAITING_VOICE"
  | "AWAITING_STYLE"
  | "CONFIRMING"
  | "AWAITING_PAYMENT"
  | "PROCESSING"
  | "DELIVERED"
  | "AWAITING_EDIT"
  | "EDIT_PROCESSING";

export async function handleIncomingMessage(
  phoneNumber: string,
  message: WhatsAppMessage
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Upsert session — create if first contact
  let { data: session } = await supabase
    .from("sessions")
    .upsert(
      { phone_number: phoneNumber },
      { onConflict: "phone_number", ignoreDuplicates: false }
    )
    .select()
    .single();

  // Update last_user_message_at and CSW expiry
  await supabase
    .from("sessions")
    .update({
      last_user_message_at: new Date().toISOString(),
      csw_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("phone_number", phoneNumber);

  // Route based on current state
  switch (session.state as ConversationState) {
    case "IDLE":
    case "ONBOARDING":
      return handleOnboarding(phoneNumber, message, session, supabase);
    case "AWAITING_IMAGES":
      return handleImages(phoneNumber, message, session, supabase);
    case "AWAITING_VOICE":
      return handleVoice(phoneNumber, message, session, supabase);
    case "AWAITING_STYLE":
      return handleStyle(phoneNumber, message, session, supabase);
    case "CONFIRMING":
      return handleConfirmation(phoneNumber, message, session, supabase);
    case "AWAITING_PAYMENT":
      return handlePaymentState(phoneNumber, message, session, supabase);
    case "PROCESSING":
      return sendText(phoneNumber, "Your photos are being processed. Please wait!");
    case "DELIVERED":
      return handlePostDelivery(phoneNumber, message, session, supabase);
    case "AWAITING_EDIT":
    case "EDIT_PROCESSING":
      return handleEdit(phoneNumber, message, session, supabase);
    default:
      return handleOnboarding(phoneNumber, message, session, supabase);
  }
}

async function transitionTo(
  phoneNumber: string,
  newState: ConversationState,
  supabase: ReturnType<typeof createClient>,
  extraFields: Record<string, unknown> = {}
) {
  await supabase
    .from("sessions")
    .update({
      state: newState,
      state_entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...extraFields,
    })
    .eq("phone_number", phoneNumber);
}
```

### 4.5 Handling Out-of-Order Messages

**Problem:** User is in AWAITING_PAYMENT but sends another photo.

**Rule:** Never silently drop a message. Acknowledge it and gently redirect.

```typescript
// In AWAITING_PAYMENT handler:
if (message.type === "image") {
  await sendText(
    phoneNumber,
    "I see you sent a photo! Once you complete the payment for your current order, you can start a new order. Your payment link is still active."
  );
  return;
}
```

**Rule:** Never auto-reset state when the user sends something unexpected. Log it, acknowledge it,
and preserve the current state.

### 4.6 Multi-Image Batching

Users often send photos one after another. Batch them into one order:

```typescript
// In AWAITING_IMAGES handler:
async function handleImages(phoneNumber, message, session, supabase) {
  if (message.type !== "image") {
    // Could be "done" button or text
    if (isUserDone(message)) {
      if (session.image_urls.length === 0) {
        await sendText(phoneNumber, "Please send at least one product photo first.");
        return;
      }
      await transitionTo(phoneNumber, "AWAITING_VOICE", supabase);
      await sendVoicePrompt(phoneNumber);
      return;
    }
    await sendText(phoneNumber, "Send your product photos, then tap Done when finished.");
    return;
  }

  // Download and store this image
  const imageUrl = await downloadAndStoreMedia(message.image.id, "images", session.current_order_id);

  // Append to image_urls array
  await supabase
    .from("sessions")
    .update({ image_urls: [...session.image_urls, imageUrl] })
    .eq("phone_number", phoneNumber);

  const count = session.image_urls.length + 1;

  if (count === 1) {
    // First image — show Done button
    await sendButtons(
      phoneNumber,
      `Got your photo (1 received). Send more or tap Done when finished.`,
      [{ id: "images_done", title: "Done, Next Step" }]
    );
  } else {
    // Subsequent images — update count
    await sendButtons(
      phoneNumber,
      `Got it! ${count} photos received. Send more or tap Done.`,
      [{ id: "images_done", title: "Done, Next Step" }]
    );
  }

  // Also set a 2-minute auto-advance timer via a delayed job
  // If user doesn't send more images in 2 minutes, auto-advance to AWAITING_VOICE
  await scheduleImageTimeout(phoneNumber, session.current_order_id);
}
```

### 4.7 Session Timeout Handling

Use a Supabase Edge Function or a cron job to detect stale sessions:

```typescript
// Runs every 5 minutes via Supabase Edge Function with pg_cron
// SELECT cron.schedule('check-stale-sessions', '*/5 * * * *', $$
//   SELECT net.http_post('https://yourproject.supabase.co/functions/v1/session-cleanup');
// $$);

export async function handleStaleSessionCleanup() {
  const supabase = createClient(...);

  // Find sessions that have been in AWAITING_PAYMENT for >30min → send reminder
  const { data: pendingPayment } = await supabase
    .from("sessions")
    .select("*, orders(*)")
    .eq("state", "AWAITING_PAYMENT")
    .lt("state_entered_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

  for (const session of pendingPayment ?? []) {
    const withinCSW = new Date(session.csw_expires_at) > new Date();

    if (withinCSW) {
      await sendText(session.phone_number, "Your payment link is still active. Tap it to complete your Rs 99 payment.");
    } else {
      // CSW expired — must use template
      await sendTemplate(session.phone_number, "whatsads_payment_reminder", "en", [
        { type: "body", parameters: [{ type: "text", text: session.orders.order_id }] }
      ]);
    }
  }

  // Find sessions stale for >1h (user abandoned mid-flow before payment)
  const { data: staleSessions } = await supabase
    .from("sessions")
    .select("*")
    .not("state", "in", '("IDLE","DELIVERED")')
    .lt("last_user_message_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  for (const session of staleSessions ?? []) {
    // Mark order as abandoned
    if (session.current_order_id) {
      await supabase
        .from("orders")
        .update({ status: "abandoned" })
        .eq("id", session.current_order_id);
    }
    // Reset to IDLE
    await transitionTo(session.phone_number, "IDLE", supabase, { current_order_id: null });
  }
}
```

### 4.8 Concurrent Message Handling

If a user sends two messages very rapidly (common on mobile — double-tap), two webhooks may arrive
simultaneously and both read the same session state, creating a race condition.

**Solution: Optimistic locking via Supabase row-level lock:**

```typescript
// Use a Postgres advisory lock keyed by phone number hash
async function handleWithLock(phoneNumber: string, handler: () => Promise<void>) {
  const lockId = hashPhoneNumber(phoneNumber); // deterministic integer from phone

  await supabase.rpc("acquire_session_lock", { lock_id: lockId });
  try {
    await handler();
  } finally {
    await supabase.rpc("release_session_lock", { lock_id: lockId });
  }
}

// In Postgres (migration):
// CREATE OR REPLACE FUNCTION acquire_session_lock(lock_id bigint)
// RETURNS void AS $$
// BEGIN
//   PERFORM pg_advisory_lock(lock_id);
// END;
// $$ LANGUAGE plpgsql;
```

Alternatively, use Redis with `SET NX EX` for distributed locking if running multiple server instances.

---

## PART 5: WhatsApp Message Design Constraints

### 5.1 Interactive Button Messages

| Property | Limit |
|---|---|
| Max buttons per message | 3 |
| Button title (display text) | Max 20 characters |
| Button ID (your internal identifier) | Max 256 characters |
| Body text | Max 1,024 characters |
| Header text (optional) | Max 60 characters |
| Footer text (optional) | Max 60 characters |

**Important:** Buttons disappear once the user taps one. You cannot re-use the same message; send
a new interactive message if you need to offer choices again.

### 5.2 Interactive List Messages

| Property | Limit |
|---|---|
| Max items per list (across all sections) | 10 |
| Item title | Max 24 characters |
| Item description (optional) | Max 72 characters |
| Item ID | Max 200 characters |
| Section title | Max 24 characters |
| Button label (text on the button to open list) | Max 20 characters |
| Body text | Max 1,024 characters |

### 5.3 Quick Reply Buttons (Template messages only)

| Property | Limit |
|---|---|
| Max quick reply buttons | 3 |
| Button text | Max 20 characters |

### 5.4 Image Messages

| Property | Limit |
|---|---|
| Max file size (send or receive) | 5MB (recommended under 1MB for weak connections) |
| Supported formats | JPEG, PNG only |
| Caption | Max 1,024 characters |
| Carousel (multiple images in one message) | NOT natively supported in standard messages |

**Carousel:** WhatsApp does not support a native image carousel in standard messages. You can send
multiple image messages sequentially. Carousel templates exist but are available only through certain
BSPs (Business Solution Providers) like 360dialog or MessageBird and require special approval. For
WhatsAds, send processed photos as separate image messages (3 variants = 3 separate messages).

### 5.5 Text Message Limits

| Property | Limit |
|---|---|
| Body text | Max 4,096 characters |
| Rich formatting | Bold: `*text*`, Italic: `_text_`, Strikethrough: `~text~`, Monospace: ` ```text``` ` |

### 5.6 Audio Message Limits

| Property | Limit |
|---|---|
| Max file size | 16MB |
| Supported formats (send) | AAC, MP4, MPEG, AMR, OGG |
| Supported formats (receive from users) | OGG/Opus (voice notes), AAC, M4A |

### 5.7 Template Message Requirements

Templates must:
- Be written in English (or the target language — Meta supports multiple languages).
- Use `{{1}}`, `{{2}}` for dynamic content placeholders (1-indexed).
- Include an opt-out mechanism if the template is in the Marketing category.
- Not contain URLs in Utility templates (flagged as Marketing by Meta's auto-categorization).
- Be 24–48 hours to approve. Rejected templates can be edited and resubmitted.

**Template variables:** All `{{N}}` parameters are positional. If your template body has `{{1}}` and
`{{2}}`, your API call must provide exactly 2 parameters in order.

**Template quality:** Meta monitors recipient feedback (blocks/reports). If your marketing template
gets too many reports, it gets paused or permanently disabled. Keep marketing message frequency low
and content highly relevant.

### 5.8 Message Body Text Encoding

WhatsApp handles Unicode (emoji, Devanagari, Tamil script, etc.) correctly. You can send messages
in Hindi script, Tamil script, etc. — users see them in the correct font on their devices.

For Sarvam AI transcriptions returned in Hindi/Tamil/Telugu script, you can include them verbatim in
WhatsApp messages without encoding conversion.

---

## DATABASE SCHEMA

```sql
-- Full schema for WhatsAds

-- Sessions (conversation state per phone number)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,
  state text not null default 'IDLE',
  current_order_id uuid,
  product_name text,
  style_selection text,
  voice_instructions text,
  image_urls text[] default '{}',
  last_user_message_at timestamptz,
  state_entered_at timestamptz default now(),
  csw_expires_at timestamptz,
  payment_attempt_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Orders
create table orders (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  user_name text,
  product_name text,
  style text,
  voice_instructions text,
  input_image_urls text[] default '{}',
  output_image_urls text[] default '{}',
  status text not null default 'created',
  -- 'created' | 'awaiting_payment' | 'paid' | 'processing' | 'delivered' | 'abandoned'
  razorpay_payment_link_id text,
  razorpay_payment_link_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Payments
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) not null,
  razorpay_payment_id text unique not null,
  razorpay_payment_link_id text,
  amount integer not null,           -- in paise
  currency text default 'INR',
  method text,                       -- 'upi', 'card', etc.
  status text not null default 'pending',
  -- 'pending' | 'captured' | 'refunded'
  captured_at timestamptz,
  created_at timestamptz default now()
);

-- Refunds
create table refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references payments(id),
  razorpay_refund_id text unique not null,
  amount integer not null,
  status text,
  reason text,
  created_at timestamptz default now()
);

-- Webhook events (raw storage for debugging and replay)
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,              -- 'whatsapp' | 'razorpay'
  event_type text,
  raw_payload jsonb not null,
  processed boolean default false,
  created_at timestamptz default now()
);

create index on webhook_events(source, event_type);
create index on webhook_events(created_at);

-- Sessions foreign key (add after orders table exists)
alter table sessions
  add constraint sessions_current_order_id_fkey
  foreign key (current_order_id) references orders(id);
```

---

## ENVIRONMENT VARIABLES REFERENCE

```bash
# WhatsApp Cloud API
WHATSAPP_ACCESS_TOKEN=          # System User permanent token from Meta
WHATSAPP_PHONE_NUMBER_ID=       # Phone number ID from Meta API Setup panel
WHATSAPP_BUSINESS_ACCOUNT_ID=   # WABA ID from Meta Business Manager
WHATSAPP_VERIFY_TOKEN=          # Your custom string for webhook verification (UUID recommended)

# Razorpay
RAZORPAY_KEY_ID=                # rzp_live_XXXX (use rzp_test_XXXX for development)
RAZORPAY_KEY_SECRET=            # Secret key from Razorpay Dashboard
RAZORPAY_WEBHOOK_SECRET=        # Webhook secret set in Razorpay Dashboard

# Transcription
SARVAM_API_KEY=                 # From console.sarvam.ai
OPENAI_API_KEY=                 # Fallback transcription via Whisper

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # For server-side operations (never expose to client)
```

---

## FILE STRUCTURE

```
src/
  app/
    api/
      v1/
        webhooks/
          whatsapp/
            route.ts            # GET (verify) + POST (incoming messages)
          razorpay/
            route.ts            # POST (payment events)
  lib/
    integrations/
      whatsapp/
        client.ts               # sendText, sendImage, sendButtons, sendList, sendTemplate
        media.ts                # downloadAndStoreMedia
        types.ts                # WhatsApp payload TypeScript types
        webhook.ts              # extractMessage, extractStatus
      razorpay/
        client.ts               # createPaymentLink, issueRefund
        webhook.ts              # verifyRazorpaySignature, handlePaymentLinkPaid
        poll.ts                 # pollPaymentLinkStatus
        types.ts                # Razorpay payload TypeScript types
      sarvam/
        transcribe.ts           # transcribeVoiceNote, safeTranscribeVoiceNote
      transcription/
        index.ts                # transcribeIndianVoiceNote (Sarvam + Whisper fallback)
    state-machine/
      index.ts                  # handleIncomingMessage, transitionTo
      handlers/
        onboarding.ts
        images.ts
        voice.ts
        style.ts
        confirmation.ts
        payment.ts
        delivery.ts
        edit.ts
    db/
      sessions.ts               # Session CRUD helpers
      orders.ts                 # Order CRUD helpers
      webhook-events.ts         # storeWebhookEvent
```

---

## KNOWN GOTCHAS AND PRODUCTION CHECKLIST

1. **Media URL expiry is 5 minutes, not 14 days.** The 14-day figure refers to how long WhatsApp
   stores the media on their infrastructure. The URL you receive from the Graph API media endpoint
   expires in ~5 minutes. Download immediately on webhook receipt.

2. **UPI Payment Links require live Razorpay credentials.** You cannot test UPI links in test mode.
   Use live mode with Re 1 test payments during development.

3. **The `reference_id` field on payment links is your deduplication key.** Always set it to your
   internal order ID. This is how you match the webhook event back to your database record.

4. **Signature verification must use the raw request body.** Parsing the JSON first and then
   re-serializing changes whitespace and breaks the HMAC. Use `req.text()` in Next.js, not `req.json()`.

5. **WhatsApp buttons disappear after one tap.** If you need to re-offer choices, send a new
   interactive message.

6. **Template auto-recategorization (April 2025).** Meta can change your template from Utility to
   Marketing without warning. This changes billing from Rs 0.125 to Rs 0.88/message. Monitor your
   template statuses and check the `pricing` field in status webhooks.

7. **The CSW tracks the user's last INBOUND message.** Your outbound messages do not reset the 24h
   window. Only a message FROM the user resets it.

8. **Sarvam AI returns transcriptions in the language the user spoke.** If a user speaks Tamil,
   you get Tamil script back. Your downstream processing (LLM for intent extraction) must handle
   all Indian scripts.

9. **Session locking is required for concurrent messages.** Mobile users can double-tap send. Without
   locking, two concurrent webhook handlers can both read state AWAITING_IMAGES and both advance to
   AWAITING_VOICE, creating a forked conversation.

10. **Razorpay webhook retry policy:** If your endpoint returns non-2xx, Razorpay retries for 24h
    with exponential backoff. Always return 200 immediately and process asynchronously. If processing
    fails, log the raw payload (stored in `webhook_events`) for manual replay.

11. **Business verification is urgent.** Unverified accounts are capped at 250 unique users/day.
    Submit business verification documents (GSTIN, Udyam certificate, or company registration) within
    the first week of launch to unlock Tier 1 (1,000 users/day).

12. **WhatsApp number cannot be on the personal app concurrently.** Once registered on the Cloud API,
    the number stops working in WhatsApp Messenger. Use a dedicated SIM.

---

Sources:
- [WhatsApp Cloud API Webhooks Setup — Meta for Developers](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/)
- [WhatsApp messages webhook reference — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/)
- [WhatsApp Pricing Updates July 2025 — Meta for Developers](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing/)
- [Razorpay Payment Links API](https://razorpay.com/docs/api/payments/payment-links/)
- [Razorpay Create UPI Payment Link](https://razorpay.com/docs/api/payments/payment-links/create-upi/)
- [Razorpay Payment Links Webhook Events](https://razorpay.com/docs/webhooks/payloads/payment-links/)
- [Razorpay Validate and Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/)
- [Sarvam AI Speech-to-Text API](https://www.sarvam.ai/apis/speech-to-text)
- [Sarvam AI API Reference — Transcribe](https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe)
- [Sarvam AI Pricing](https://www.sarvam.ai/api-pricing)
- [Deepgram Models and Languages](https://developers.deepgram.com/docs/models-languages-overview)
- [WhatsApp API Rate Limits — Fyno](https://www.fyno.io/blog/whatsapp-rate-limits-for-developers-a-guide-to-smooth-sailing-clycvmek2006zuj1oof8uiktv)
- [WhatsApp API Pricing India 2025 — GreenAds](https://www.greenadsglobal.com/post/whatsapp-business-api-pricing-india-new-rules-tricks)
- [Scale WhatsApp Cloud API Throughput 2026](https://www.wuseller.com/whatsapp-business-knowledge-hub/scale-whatsapp-cloud-api-master-throughput-limits-upgrades-2026/)
- [WhatsApp Error Codes — Heltar](https://www.heltar.com/blogs/all-meta-error-codes-explained-along-with-complete-troubleshooting-guide-2025-cm69x5e0k000710xtwup66500)
- [WhatsApp Interactive Messages — Blip](https://help.blip.ai/hc/en-us/articles/4474418203287-Creating-interactive-messages-in-WhatsApp)
- [Openai Whisper vs Google Speech-to-Text 2025](https://diyai.io/ai-tools/speech-to-text/openai-whisper-vs-google-speech-to-text/)
- [WhatsApp Business API India Guide 2025 — Anantya.ai](https://anantya.ai/blog/whatsapp-business-api-india-2025-guide/)

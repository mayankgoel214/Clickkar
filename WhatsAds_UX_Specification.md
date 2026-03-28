# WhatsAds — Complete WhatsApp UX Specification
**Version 1.0 — March 2026**
**Audience: Solo developer building the WhatsApp bot + AI processing pipeline**

---

## DOCUMENT CONVENTIONS

- `[BOT]` = message sent by WhatsAds bot
- `[USER]` = message sent by the user
- `[BUTTON]` = WhatsApp interactive button (max 3 per message, max 20 chars per label)
- `[QUICK REPLY]` = quick reply chip (max 3 per message, max 20 chars)
- `[LIST]` = WhatsApp list message (up to 10 items, shown as scrollable menu)
- `[MEDIA]` = image, audio, or document message
- `[DELAY]` = intentional pause before next bot message (in seconds)
- `H:` = Hindi text  |  `E:` = English text (both provided for every message)
- All prices are in Indian Rupees (Rs / ₹)
- All times are IST

---

## SYSTEM-WIDE PRINCIPLES

1. No message exceeds 3 lines on a 6-inch Android screen (~60 characters per line, ~180 chars total)
2. Never send two messages in a row without a 1–2 second delay between them (feels human)
3. After any user inaction for 10 minutes during an active flow, send one gentle nudge. After 24 hours, close the session.
4. Every message that ends a turn must have a clear next action: a button, a quick reply, or an explicit instruction ("Photo bhejo" / "Send photo")
5. Never use words like "Click", "Dashboard", "Portal", "Interface", "Platform" — these are foreign concepts to this user
6. Preferred vocabulary: "bhejo" (send), "batao" (tell), "milega" (you'll get), "ho jayega" (it'll be done)
7. Default language is Hindi. Switch to English only if user writes in English first.
8. User data stored: phone number, preferred name, business type, language preference, style preference history, order history. Nothing else. DPDP Act 2023 compliant.

---

## FLOW 1 — ONBOARDING

### Trigger
User saves the WhatsApp number and sends any first message — "Hi", "Hello", "Hiii", "Namaste", a sticker, a random photo, anything. This is their first-ever message to this number.

### Design Goal
User must see value (understand exactly what they get) within 3 messages. They must feel welcomed, not processed. By message 5, they should have started their first order.

---

### 1A. First Message Detection

The bot detects: is this phone number new (never messaged before)?

If YES → go to Onboarding Flow 1B.
If NO → go to Returning User Flow (Section 5).

---

### 1B. Welcome Sequence

**[BOT — Message 1]** `[DELAY: 0s]`

```
H: Namaste! 🙏 Main WhatsAds hun.
Aapke product ki photo leke use professional bana deta hun — seedha WhatsApp pe.
Sirf Rs 99 mein. 60 second mein result.

E: Hi! I'm WhatsAds.
Send me your product photo — I'll make it look professional. Rs 99 per image. Result in 60 seconds.
```

`[QUICK REPLY]`
- H: "Hindi mein" / E: "Hindi"
- H: "English mein" / E: "English"

> **Dev note:** Store language preference immediately on button tap. All subsequent messages in this session use chosen language. Default to Hindi if no response within 2 minutes.

---

**[USER taps "Hindi mein"]**

`[DELAY: 1s]`

**[BOT — Message 2]**

```
H: Bahut accha! 😊
Kya aap kuch bechte hain? Jaise jewellery, kapde, khana, skincare — kuch bhi.
Batao, main aapki madad karunga.

E: Great!
Do you sell something? Like jewellery, clothes, food, skincare — anything.
Tell me, I'll help.
```

`[QUICK REPLY]`
- H: "Haan, bechta/bechti hun" / E: "Yes, I sell"
- H: "Sirf dekhne aaya/aayi" / E: "Just looking"

> **Dev note:** "Bechta hun" = male user. "Bechti hun" = female. The bot cannot know gender yet, so use the neutral short form. When user confirms they sell, proceed. If "Just looking", go to 1C (Curious User).

---

**[USER taps "Haan, bechta/bechti hun"]**

`[DELAY: 1s]`

**[BOT — Message 3 — Value Demo Message]**

```
H: Perfect! 🎯
Yeh dekho — ek customer ne apne pickle ki photo bheji thi.
Humne 60 second mein yeh bana diya.
```

`[MEDIA]` — Side-by-side before/after image
(Left: a real-looking dim photo of a pickle jar on a kitchen counter)
(Right: same jar on a clean earthy background, professional lighting, Instagram-ready)

```
H: Aapka product bhi aisa ho sakta hai. Rs 99 mein.
Pehli baar free mein try karo — koi risk nahi.
```

`[BUTTON]`
- "Free mein try karo" (Try for free)

> **Dev note:** This is the activation moment. The "free first image" offer converts cold users into active users. First image is free — charged from image 2 onwards. This decision is a business call but strongly recommended for conversion. If free trial is not approved, replace with "Rs 99 mein try karo" (Try for Rs 99).

---

**[USER taps "Free mein try karo"]**

`[DELAY: 1s]`

**[BOT — Message 4 — Name Collection]**

```
H: Badiya! Pehle — aapka naam kya hai?
Sirf pehla naam kaafi hai. 😊

E: Great! First — what's your name?
Just your first name is fine.
```

> **No buttons here.** User types naturally. This is intentional — it breaks the button pattern and makes them feel heard, not processed.

---

**[USER types: "Sunita"]**

`[DELAY: 1s]`

**[BOT — Message 5 — Business Type]**

```
H: Sunita ji, swagat hai! 🎉
Aap kya bechti hain? Neeche se chuniye.

E: Welcome, Sunita ji!
What do you sell? Pick from the list below.
```

`[LIST]` — "Apna product chuniye" (Select your product type)

List items:
1. Jewellery / Accessories
2. Kapde / Dupatte (Clothes / Dupattas)
3. Ghar ka khana / Achar / Mithai (Food / Pickles / Sweets)
4. Skincare / Beauty
5. Candles / Home Decor
6. Bags / Purses / Wallets
7. Kuch aur (Something else)

> **Dev note:** Store selected category. This is used to auto-suggest appropriate backgrounds later (e.g., jewellery → dark velvet, food → wooden board, skincare → marble surface). Category also used for re-engagement messages ("Diwali jewellery photos ke liye ready hain?").

---

**[USER selects: "Jewellery / Accessories"]**

`[DELAY: 1s]`

**[BOT — Message 6 — Onboarding Complete, Begin Order]**

```
H: Sunita ji, bilkul sahi! 💍
Ab apne jewellery ki ek photo bhejiye.
Koi bhi background ho — table pe, haath mein — sab chalega.

E: Perfect, Sunita ji!
Now send me a photo of your jewellery.
Any background — table, hand — anything works.
```

> **No buttons.** Clear instruction. User sends photo. Go to Core Image Submission Flow (Section 2).

---

### 1C. Curious User (tapped "Sirf dekhne aaya/aayi")

**[BOT]**

```
H: Koi baat nahi! 😊
Ek example dekho — Rs 99 mein kya milta hai.
```

`[MEDIA]` — Same before/after example image

```
H: Pasand aaya? Kabhi bhi photo bhej sakte ho — main hamesha yahan hun.
```

`[BUTTON]`
- "Haan, try karta/karti hun" (I'll try it)
- "Baad mein" (Later)

If "Baad mein" → close session. Re-engage after 48 hours with a single message (see Re-engagement in Section 5).

---

### 1D. Handling Users Who Don't Respond Mid-Onboarding

**Scenario:** Bot sent Message 2 (asking if they sell something). No response for 10 minutes.

**[BOT — Nudge Message]** `[DELAY: 10 minutes after last bot message]`

```
H: Kya aap abhi busy hain? Koi baat nahi.
Jab time ho, sirf "Hi" bhejiye — main yahan hun. 😊

E: Are you busy right now? No problem.
When ready, just send "Hi" — I'm here.
```

> Do not send this nudge again. If user does not respond in 24 hours, mark session as abandoned. They re-enter via Returning User Flow if they message again.

---

### 1E. User Sends Random/Confusing Message During Onboarding

Examples: "Kya rate hai?", "Tumhara number kahan se mila?", random emojis, voice note without context.

**[BOT — Graceful Recovery]**

```
H: Main samajh gaya/gayi. Pehle yeh dekho —

E: Got it. Let me show you this first —
```

Then immediately send the before/after example (Message 3 content). Resume normal onboarding from there. Do not force user back to the exact step they were on. The example image is always the right anchor point.

---

### 1F. User Asks "Yeh kya hai?" (What is this?) Mid-Onboarding

```
H: Main ek photo editing service hun. Aap apne product ki photo bhejte ho —
main use professional bana deta hun. Rs 99 mein, 60 second mein.

E: I'm a photo editing service. You send your product photo —
I make it look professional. Rs 99, in 60 seconds.
```

`[BUTTON]`
- "Example dekho" (See example)
- "Try karo" (Try it)

---

### 1G. DPDP Consent (Required — DPDP Act 2023)

Inserted after name collection (between Message 5 and Message 6), delivered once per user, non-blocking.

**[BOT — Consent Message]**

```
H: Ek zaruri baat — aapki photos sirf editing ke liye use hoti hain.
Hum aapka data kisi aur ko nahi dete. Details: whatsads.in/privacy

E: Quick note — your photos are used only for editing.
We never share your data. Details: whatsads.in/privacy
```

`[QUICK REPLY]`
- "Theek hai, samajh gaya/gayi" (OK, understood)

> **Dev note:** Log consent timestamp + version of privacy policy. Required for DPDP Act 2023 compliance. Do not proceed to order flow until this is tapped. If user ignores this, resend once. If ignored again, stop the session with a message: "Aage badhne ke liye agree karna zaroori hai. Jab ready ho, 'Theek hai' bhejiye."

---

## FLOW 2 — CORE IMAGE SUBMISSION

### Entry Points
- End of Onboarding (first-time user, free image)
- Returning user sends a photo directly
- Returning user taps "Nayi photo" (New photo) from any menu

---

### 2A. User Sends One Photo

**[USER sends 1 photo]**

Bot immediately sends a "received" confirmation (within 2 seconds of receiving the photo).

**[BOT — Message 1 — Received Confirmation]**

```
H: Photo mil gayi! 📸
Ek second — main dekh raha/rahi hun.
```

`[DELAY: 2 seconds]` (simulates human review, builds trust)

**[BOT — Message 2 — Style Selection]**

```
H: Yeh photo ke liye kaisi style chahiye?

E: What style do you want for this photo?
```

`[LIST]` — "Style chuniye" (Choose style)

Items:
1. Saaf white background (Clean white background)
2. Lifestyle — natural scene
3. Dark and minimal — premium look
4. Festival / Tyohar mood
5. Wooden / Earthy texture
6. Gradient — colorful
7. Sunita ji ki pasand se (Auto — based on your product type) [personalized using stored category]

> **Dev note:** Default pre-selection based on category: Jewellery → "Dark and minimal". Food → "Wooden / Earthy". Skincare → "Clean white". Clothes → "Lifestyle". If user selects "Auto", use the category default.

---

**[USER selects: "Dark and minimal — premium look"]**

`[DELAY: 1s]`

**[BOT — Message 3 — Optional Voice Note Prompt]**

```
H: Sundar choice! 🖤
Kuch khaas batana chahti hain? Jaise — product ka naam, platform, mood.
Voice note ya text mein — Hindi mein bhi sahi hai.
Ya phir "Skip karo" dabao.

E: Great choice!
Want to add anything? Like product name, platform, mood.
Voice note or text — Hindi is fine.
Or tap "Skip".
```

`[QUICK REPLY]`
- "Skip karo" (Skip)

> **Dev note:** If user sends a voice note, transcribe using Whisper API (multilingual — handles Hindi, Marathi, Tamil, Telugu, Gujarati, Punjabi). Feed transcription as a style prompt to the image generation model. If transcription fails or is unclear, use category default and log for review. Never fail the order because voice note failed — silently fall back to default.

---

**[USER taps "Skip karo"]**

`[DELAY: 1s]`

**[BOT — Message 4 — Order Summary + Pricing]**

For free first image:
```
H: Bilkul! Yeh rahi aapka pehla order:
📸 1 photo — Dark & minimal style
💰 Pehli photo FREE hai — koi payment nahi
Taiyaar hain? Start karein?

E: Here's your order:
1 photo — Dark & minimal style
First photo is FREE — no payment
Ready to start?
```

`[BUTTON]`
- "Haan, shuru karo!" (Yes, start!)
- "Style badlo" (Change style)

> For paid images (all orders after first), replace pricing line with "Rs 99" — see Payment Flow (Section 3).

---

**[USER taps "Haan, shuru karo!"]**

`[DELAY: 1s]`

**[BOT — Message 5 — Processing]**

```
H: Ho raha hai! ⚙️
60 second mein aapki photo ready ho jayegi.
WhatsApp band mat karo.

E: Working on it!
Your photo will be ready in 60 seconds.
Don't close WhatsApp.
```

> **Dev note:** Trigger AI processing immediately. Target delivery: 45–90 seconds. If processing takes >2 minutes, send an intermediate message at the 90-second mark: "Thoda aur time lag raha hai — 30 second aur. Thank you for waiting!"

`[MEDIA]` — Deliver processed image (see Delivery Flow, Section 4)

---

### 2B. User Sends Multiple Photos (2–5 images)

WhatsApp sends multiple photos as a burst. The bot receives them within a short window (usually within 10–30 seconds of each other).

**Detection logic:** If more than 1 photo arrives within 60 seconds from the same user during an active session, treat as a multi-photo order.

**[BOT — After receiving all photos, confirmed by 30s silence]**

```
H: 3 photos mil gayi! 📸📸📸
Har photo ke liye alag style chahiye, ya sabke liye ek hi?

E: Got 3 photos!
Do you want a different style for each, or same style for all?
```

`[QUICK REPLY]`
- "Sabke liye ek hi" (Same style for all)
- "Alag alag" (Different for each)

**If "Sabke liye ek hi" → go to Style Selection (2A, Message 2) → apply to all → show batch pricing:**

```
H: 3 photos — Dark & minimal style
💰 3 x Rs 99 = Rs 297
Payment karo, teeno photo ek saath milenge.

E: 3 photos — Dark & minimal style
3 x Rs 99 = Rs 297
Pay once, get all 3 photos.
```

`[BUTTON]`
- "Rs 297 pay karo" (Pay Rs 297)
- "Style badlo" (Change style)

**If "Alag alag" → process photos one at a time:**

```
H: Theek hai! Pehle pehli photo ke liye style chuniye.
[Photo 1 thumbnail if possible]

E: OK! First, choose style for photo 1.
```

Then run Style Selection per photo. Collect all styles. Show combined order summary. Single payment for all.

---

### 2C. Handling Bad Photos

**Blurry photo:**
AI pipeline flags if sharpness score < threshold.

**[BOT]**

```
H: Yeh photo thodi dhundli lag rahi hai.
Kya ek aur photo le sakte hain — thoda camera seedha rakhke?
Ya hum isi se try karein?

E: This photo looks a bit blurry.
Can you take another — hold the camera steady?
Or should we try with this one?
```

`[QUICK REPLY]`
- "Nai photo bhejti/bhejta hun" (I'll send another)
- "Isi se karo" (Try with this one)

**Too dark:**

```
H: Yeh photo mein roshni kam hai.
Window ke paas ja ke ek aur try karo — bahut better result milega.
Ya isi se karun?

E: This photo is a bit dark.
Try near a window for much better results.
Or should I use this one?
```

`[QUICK REPLY]`
- "Nai photo bhejti/bhejta hun" (I'll send another)
- "Isi se karo" (Try with this one)

**Product not identifiable (e.g., product is too small, photo is of a room):**

```
H: Is photo mein product clearly nahi dikh raha.
Product ko camera ke paas rakhke photo lo.

E: I can't see the product clearly in this photo.
Please take a photo with the product closer to the camera.
```

`[QUICK REPLY]`
- "Nai photo bhejti/bhejta hun" (I'll send another)

> **Dev note:** Do not charge for rejected photos. Log rejection reason. After 3 failed attempts for the same product, offer a WhatsApp call with support: "Kya support se baat karni hai? Hum help karenge."

---

### 2D. Voice Note Processing

When user sends a voice note at the "optional context" prompt:

```
H: Voice note sun raha/rahi hun... 🎧

E: Listening to your voice note...
```

`[DELAY: Transcription time, usually 3–8 seconds]`

After transcription:

```
H: Main samajh gaya/gayi:
"[Transcription excerpt, max 1 line]"
Yeh style apply kar raha/rahi hun.

E: Got it:
"[Transcription excerpt]"
Applying this style now.
```

`[BUTTON]`
- "Sahi hai" (Correct)
- "Nahi, change karo" (No, change it)

If "Nahi, change karo" → return to style list.

---

## FLOW 3 — PAYMENT

### 3A. Standard Single Image Payment (Rs 99)

**[BOT — Payment Request Message]**

```
H: Aapka order taiyaar hai!
📸 1 photo — Dark & minimal
💰 Rs 99 + GST (18%) = Rs 116.82

Neeche payment karo — UPI, card, sab chalega.
```

`[BUTTON]`
- "Rs 116.82 pay karo" (Tapping this opens Razorpay payment link in phone browser)

> **Dev note:** GST (18%) is mandatory for digital services (SAC 998314). Display inclusive pricing: "Rs 99 + 18% GST = Rs 116.82". Razorpay handles GST invoicing. Store GST invoice reference per transaction for compliance. At Rs 20L turnover, GST registration becomes mandatory — build this from day 1.

> **Dev note on Razorpay Payment Link:** Use Razorpay Payment Links API (not Checkout). Payment Link opens in the user's default browser. On payment success, Razorpay webhook fires → bot detects payment → triggers processing. The user does NOT need to do anything after paying — they come back to WhatsApp and the result arrives automatically.

---

### 3B. Multi-Image Pricing Display

```
H: Aapka order:
📸 3 photos — Dark & minimal
💰 3 x Rs 99 = Rs 297 + GST = Rs 350.46

Ek hi payment mein teeno process ho jaenge.
```

`[BUTTON]`
- "Rs 350.46 pay karo"

---

### 3C. Payment Pending (User Has Opened Link But Not Paid — 5 Minutes)

Razorpay payment link has a status check. If link opened but not completed in 5 minutes:

**[BOT]**

```
H: Kya payment mein koi problem aayi?
UPI se payment karni ho to PhonePe ya GPay bhi chalega.

E: Having trouble with payment?
UPI works fine — PhonePe or GPay both work.
```

`[BUTTON]`
- "Payment link dobara bhejo" (Resend payment link)
- "Cancel karo" (Cancel)

---

### 3D. Payment Abandoned (No Action for 30 Minutes After Link Sent)

**[BOT]**

```
H: Koi baat nahi, Sunita ji! 😊
Jab bhi ready ho — photo bhejiye, hum yahan hain.

E: No worries, Sunita ji!
Whenever you're ready — send your photo, we're here.
```

> Do not send any further messages for 24 hours after abandonment.

---

### 3E. Payment Failure (Card Declined / UPI Timeout)

Razorpay webhook fires with failure status.

**[BOT — within 30 seconds of failure event]**

```
H: Lagta hai payment nahi hua. Koi dikkat nahi!
Ek aur baar try karo.

E: Looks like the payment didn't go through. No problem!
Try once more.
```

`[BUTTON]`
- "Dobara try karo" (Try again — sends fresh payment link)
- "Help chahiye" (Need help)

If "Help chahiye":

```
H: Support ke liye WhatsApp karo: +91-XXXXXXXXXX
(Subah 9 baje se raat 9 baje tak)

E: WhatsApp our support: +91-XXXXXXXXXX
(9 AM to 9 PM daily)
```

---

### 3F. Webhook Delay (Payment Confirmed by Bank but Webhook Not Received)

This is the worst UX scenario — user paid but nothing happened.

**[BOT — if no webhook received within 3 minutes of payment link being opened]**

```
H: Sunita ji, aapka payment confirm ho raha hai — 2 minute aur.
Koi action nahi karna. Main automatic bhej dunga/dungi.

E: Sunita ji, your payment is being confirmed — 2 more minutes.
No action needed. I'll send it automatically.
```

> **Dev note:** Implement Razorpay payment status polling as a fallback. Poll every 30 seconds for up to 10 minutes if webhook is not received. If payment is confirmed via polling, proceed normally. If after 10 minutes the payment cannot be confirmed, send: "Koi dikkat aayi. Please support se baat karo: [number]. Aapka paisa safe hai."

---

### 3G. Payment Confirmation Message

Fires immediately after webhook is received successfully.

**[BOT — within 5 seconds of webhook]**

```
H: Payment mil gayi! ✅
Rs 116.82 receive hua. Processing shuru ho rahi hai.
60 second mein photo aayegi — WhatsApp pe yahan.

E: Payment received!
Rs 116.82 confirmed. Processing started.
Your photo will arrive in 60 seconds — right here on WhatsApp.
```

---

## FLOW 4 — DELIVERY AND EDIT/REVISION

### 4A. Image Delivery — Single Image

**[BOT — Image Delivery]** `[Fires when AI processing complete, targeting 60 seconds after payment]`

`[MEDIA]` — Processed image (1080x1080px, <2MB, JPEG)

```
H: Taiyaar hai, Sunita ji! ✨
Aapke jewellery ki professional photo. Save kar lo aur post kar do!

E: Ready, Sunita ji!
Your jewellery's professional photo. Save it and post!
```

`[DELAY: 2s]`

**[BOT — Reaction Prompt]**

```
H: Kaisi lagi? 😊

E: How do you like it?
```

`[QUICK REPLY]`
- "Bahut badiya!" (Love it!)
- "Kuch badlao" (Make a change)
- "Bilkul alag karo" (Start over)

---

### 4B. User Says "Bahut badiya!" (Love it)

**[BOT]**

```
H: Bahut shukriya, Sunita ji! 🙏
Jab bhi nayi photo chahiye — seedha bhej dena.
Aur haan — doston ko bhi batao! 😊

E: Thank you so much, Sunita ji!
Whenever you need a new photo — just send it.
And tell your friends too!
```

`[BUTTON]`
- "Nayi photo bhejo" (Send new photo)
- "Share karo" (Share WhatsAds number)

> **Dev note:** "Share karo" button uses WhatsApp's native share sheet to share a pre-written message: "Yeh number save karo — product photos Rs 99 mein 60 second mein milti hain: [WhatsAds number]". This is the primary viral growth mechanic.

---

### 4C. User Says "Kuch badlao" (Make a change)

**[BOT]**

```
H: Bilkul! Kya badlana chahti hain?

E: Sure! What would you like to change?
```

`[LIST]` — "Kya badlen?" (What to change?)

Items:
1. Background badlo (Change background)
2. Aur roshan karo (Make it brighter)
3. Thoda dark karo (Make it darker)
4. Style badlo (Change style completely)
5. Product zoom karo (Zoom in on product)
6. Kuch aur (Something else — type or voice note)

---

**[USER selects: "Background badlo"]**

```
H: Nayi background chuniye:

E: Choose a new background:
```

`[LIST]` — Background options (same as style list in 2A, minus currently applied style)

After selection:

```
H: Theek hai! Naya background laga raha/rahi hun.
30 second mein nayi photo aayegi.

E: Got it! Applying the new background.
New photo in 30 seconds.
```

> **Dev note:** Revisions use the original uploaded photo, not the processed one. This preserves image quality across multiple edits. Processing time for revisions should target 30 seconds (not 60) since product segmentation is already done.

`[MEDIA]` — Revised image delivered

```
H: Yeh raha! Kaisa laga?

E: Here you go! How's this?
```

`[QUICK REPLY]`
- "Perfect!" (Perfect!)
- "Aur badlao" (Change more)

---

### 4D. Free Revisions Policy

- **1 free revision** per image (includes background change, brightness, style change)
- **2nd revision onwards**: Rs 29 per revision

When user requests a second revision:

```
H: Ek revision pehle se use ho gayi.
Yeh badlav Rs 29 mein hoga.

E: Your one free revision was already used.
This change will cost Rs 29.
```

`[BUTTON]`
- "Rs 29 pay karo" (Pay Rs 29)
- "Rehne do" (Never mind)

---

### 4E. User Says "Bilkul alag karo" (Start Over)

```
H: Koi baat nahi! Nayi style se shuru karte hain.
Wahi photo use karein ya nayi photo bhejein?

E: No problem! Let's start fresh with a new style.
Use the same photo or send a new one?
```

`[QUICK REPLY]`
- "Wahi photo" (Same photo)
- "Nayi photo bhejti/bhejta hun" (Send new photo)

> **Dev note:** "Start over" is still counted as a revision if within the free revision window. The AI reprocesses the original photo with a completely new style selection. This is NOT a new order — it is a redo.

---

### 4F. User Requests "Kuch aur" (Something else — free text/voice note)

```
H: Batao kya chahiye — text ya voice note mein.
Hindi mein bhi bilkul theek hai.

E: Tell me what you want — text or voice note.
Hindi is perfectly fine.
```

Bot receives free text or voice note → transcribe if voice → parse intent → apply to image → deliver.

If the request is unclear:

```
H: Samajh nahi aaya. Kya aap thoda aur detail mein bata sakti hain?
Jaise: "background green karo" ya "product bada dikhao"

E: I didn't quite understand. Can you explain a bit more?
Like: "make background green" or "show product bigger"
```

---

### 4G. Multiple Image Delivery (Batch Order)

For a 3-image order: deliver images one at a time with a 10-second gap between each.

**[BOT — Image 1]**

`[MEDIA]` — Image 1

```
H: Pehli photo taiyaar! ✨ (1/3)

E: First photo ready! (1/3)
```

`[DELAY: 10s]`

**[BOT — Image 2]**

`[MEDIA]` — Image 2

```
H: Doosri photo! 🌟 (2/3)

E: Second photo! (2/3)
```

`[DELAY: 10s]`

**[BOT — Image 3]**

`[MEDIA]` — Image 3

```
H: Teesri bhi taiyaar! 🎉 (3/3)
Teeno photo save kar lo.

E: All three ready! (3/3)
Save all three photos.
```

`[DELAY: 2s]`

**[BOT — Batch Reaction Prompt]**

```
H: Kaisi lagi teeno? Kisi mein kuch badlana hai?

E: How are all three? Need changes to any?
```

`[LIST]` — "Kaunsi photo mein badlao?"

Items:
1. Pehli photo mein (Photo 1)
2. Doosri photo mein (Photo 2)
3. Teesri photo mein (Photo 3)
4. Sab theek hai! (All good!)

> **Dev note:** Batch revisions are handled per-image, each consuming their own free revision allowance.

---

## FLOW 5 — RETURNING USER

### 5A. User Messages Again (Any Time After First Session)

**Detection:** Phone number exists in database. Check: last order timestamp, order count, preferences.

**[BOT — Returning User Greeting]**

```
H: Wapas aao, Sunita ji! 🙏
Nayi photo bhejni hai?

E: Welcome back, Sunita ji!
Ready to send a new photo?
```

`[QUICK REPLY]`
- "Haan, photo bhejti hun" (Yes, sending photo)
- "Pehle order dekho" (See past orders)
- "Kuch poochna hai" (Have a question)

> **Dev note:** If user sends a photo directly (without any text), skip this greeting entirely and go directly to Style Selection (Flow 2A, Message 2). A returning user sending a photo is the highest-intent signal possible — do not interrupt it with pleasantries.

---

### 5B. Faster Repeat Order (Remembered Preferences)

If user has a previous style preference stored:

**[BOT — after receiving photo]**

```
H: Photo mil gayi!
Pichli baar "Dark & minimal" style pasand thi.
Wahi lagaun ya kuch aur?

E: Got the photo!
Last time you liked "Dark & minimal" style.
Use that again or try something new?
```

`[QUICK REPLY]`
- "Wahi style" (Same style)
- "Nai style chunun" (Choose new style)

> **Dev note:** "Wahi style" tap → skip straight to order summary + payment. This reduces the returning user flow from 6 steps to 3 steps. This is the core retention mechanic — make repeat orders effortless.

---

### 5C. Order History

**[USER taps "Pehle order dekho"]**

```
H: Aapke pichle 3 orders:
📸 25 Mar — Jewellery, Dark style
📸 18 Mar — Jewellery, White background
📸 10 Mar — Jewellery, Festival mood

Koi photo dobara chahiye?

E: Your last 3 orders:
Mar 25 — Jewellery, Dark style
Mar 18 — Jewellery, White background
Mar 10 — Jewellery, Festival mood

Need any photo again?
```

`[BUTTON]`
- "Nayi photo bhejiye" (Send new photo)

> **Dev note:** Do not re-send old images in order history (privacy, storage). Just show text summary. Users who want their old image should save it when it is first delivered.

---

### 5D. Re-engagement Messages

Sent once per user per relevant occasion. Never more than 1 re-engagement message per week.

**Festival Re-engagement (Diwali — sent 10 days before)**

```
H: Sunita ji, Diwali aa rahi hai! 🪔
Is baar festival style mein photos ready karo.
Festive background se sales barhti hain!

E: Sunita ji, Diwali is coming!
Get your products ready with a festive look.
Festival backgrounds drive more sales!
```

`[BUTTON]`
- "Diwali style try karo" (Try Diwali style)
- "Baad mein" (Later)

**Inactivity Re-engagement (User inactive for 14 days)**

```
H: Sunita ji, kaisa chal raha hai business? 😊
Koi nayi product aaya kya? Photo bhejiye — hum taiyaar hain.

E: Sunita ji, how's business going?
Any new products? Send a photo — we're ready.
```

`[BUTTON]`
- "Photo bhejti/bhejta hun" (Sending photo)
- "Abhi nahi" (Not now)

**New Style Available**

```
H: Naya "Studio Dark" style aa gaya hai!
Jewellery ke liye bilkul perfect. Dekhna chahoge?

E: New "Studio Dark" style is here!
Perfect for jewellery. Want to see it?
```

`[BUTTON]`
- "Haan, dekhna hai!" (Yes, show me!)
- "Theek hai, baad mein" (Maybe later)

> **Dev note:** Re-engagement messages are sent only between 9 AM and 7 PM IST. Never send at night. Segment by business category for relevance (don't send Diwali jewellery message to a food seller).

---

## FLOW 6 — ERROR AND EDGE CASES

### 6A. User Sends a Selfie Instead of Product Photo

**Detection:** AI image classification identifies human face as primary subject.

**[BOT]**

```
H: Yeh selfie mast aayi! 😄
Lekin main sirf product photos banata/banati hun.
Apna product ka photo bhejiye — jewellery, kapde, khana — kuch bhi.

E: Nice selfie!
But I only work with product photos.
Send me your product photo — jewellery, clothes, food — anything.
```

> No further action. Wait for user to send correct photo.

---

### 6B. User Sends a Video

**[BOT]**

```
H: Video dekh li! Abhi main sirf photos banata/banati hun.
Apne product ki ek photo bhejiye.

E: Got the video! Right now I only work with photos.
Send me a photo of your product.
```

> **Dev note:** Log video receipt. This is a strong signal for future feature demand (product video enhancement). Track frequency of video submissions — when it crosses a threshold, build video support.

---

### 6C. User Sends a Document or PDF

**[BOT]**

```
H: Yeh ek document hai — main ise nahi padh sakta/sakti.
Sirf product ki photo bhejiye. Camera se khainchi hui.

E: This is a document — I can't process it.
Please send a product photo taken with your camera.
```

---

### 6D. User Sends 20 Photos at Once

**Detection:** More than 8 photos received within a 60-second window.

**[BOT — fires after 60-second collection window]**

```
H: Bahut saari photos aayi! 😊
Main ek baar mein sirf 5 photo process kar sakta/sakti hun.
Pehli 5 photos le raha/rahi hun — baaki baad mein bhejiye.

E: So many photos!
I can process only 5 at a time.
Taking the first 5 — send the rest later.
```

> **Dev note:** Queue only the first 5. Ignore photos 6–20. After those 5 are delivered, the user can send the next batch. This prevents processing queue overload and also limits risk on bad payment UX (Rs 5 x 99 = Rs 495 per batch, manageable).

---

### 6E. User Sends Messages During Processing

**Scenario:** User has paid and processing is underway. They send messages like "kitna time lagega?" (how long?) or "photo aa gayi kya?" (has the photo come?).

**[BOT — Auto-response during active processing]**

```
H: Taiyaar ho raha/rahi hai! Abhi [X] second mein aayegi. Ruk jaiye. 😊

E: It's almost ready! Coming in [X] seconds. Just a moment.
```

> **Dev note:** Calculate X based on processing start timestamp. If processing has been running for >90 seconds, say "Thoda aur time lag raha hai — 1 minute aur." Do not respond to multiple impatient messages with multiple responses — rate limit to 1 auto-response per 30 seconds during processing.

---

### 6F. User Asks About Pricing Before Using

**Scenario:** User messages "rate kya hai?" or "kitna paisa lagta hai?" without having done onboarding or sending a photo.

**[BOT]**

```
H: Sirf Rs 99 per photo! 📸
60 second mein professional photo milti hai.
Ek example dekho:

E: Just Rs 99 per photo!
Professional photo in 60 seconds.
See an example:
```

`[MEDIA]` — Before/after example

```
H: Pehli photo FREE hai — abhi try karo?

E: First photo is FREE — want to try now?
```

`[BUTTON]`
- "Haan, try karta/karti hun" (Yes, I'll try)
- "Baad mein" (Later)

---

### 6G. User Asks for a Refund

**[USER: "paise wapas chahiye" / "refund chahiye"]**

**[BOT]**

```
H: Sunita ji, sorry aapko takleef hui.
Kya hum photo ek baar aur try kar sakte hain?
Agar fir bhi sahi nahi lagi to paise wapas ho jaenge.

E: Sunita ji, sorry for the trouble.
Can we try the photo one more time?
If it's still not right, we'll refund you.
```

`[QUICK REPLY]`
- "Haan, ek baar aur try karo" (Yes, try once more)
- "Nahi, paise chahiye" (No, I want refund)

If "Nahi, paise chahiye":

```
H: Theek hai. Refund 3-5 working days mein aapke account mein aa jayega.
Order number: #[ORDER_ID]
Koi bhi problem ho to: +91-XXXXXXXXXX

E: Understood. Refund will be in your account in 3-5 working days.
Order number: #[ORDER_ID]
Any questions: +91-XXXXXXXXXX
```

> **Dev note:** Mark order as refund-requested. Trigger Razorpay refund API call. Refunds are a business decision — current suggested policy: full refund if image quality is objectively poor. Partial refund if user simply dislikes the result after one revision. Log all refund reasons for AI quality improvement.

---

### 6H. New User Detection (Number Forwarded by a Friend)

**Scenario:** Existing user shares the WhatsAds number to a friend. Friend messages. Bot sees new phone number.

**[BOT]**

Same as standard Onboarding Flow 1B. The system cannot and should not know who referred them. However, add at end of Message 3 (the example message):

```
H: Kisi dost ne bataya? Woh achhe hain! 😄
Pehli photo FREE hai.

E: Did a friend tell you about this? Good friend!
First photo is FREE.
```

> **Dev note:** Add referral tracking later (Phase 2). For MVP, just convert the new user normally.

---

### 6I. User Sends Abusive or Inappropriate Content

**Detection:** Image moderation API (Google Cloud Vision SafeSearch or AWS Rekognition) flags explicit content.

**[BOT]**

```
H: Main is photo ko process nahi kar sakta/sakti.
Sirf product photos accepted hain.

E: I can't process this photo.
Only product photos are accepted.
```

> Do not elaborate. Log the event. If it happens 3 times from the same number, block the number from the service and alert the developer.

---

### 6J. User Messages Outside Business Hours

> **There are no business hours for WhatsAds** — the service is 24/7 automated. However, the support human (developer) is available only 9 AM–9 PM.

If user explicitly asks to speak to a person:

```
H: Main ek automated service hun.
Insaani support ke liye: +91-XXXXXXXXXX
(Subah 9 baje se raat 9 baje tak, Mon–Sat)

E: I'm an automated service.
For human support: +91-XXXXXXXXXX
(9 AM to 9 PM, Mon–Sat)
```

---

### 6K. Service Downtime / AI Processing Error

When the AI pipeline fails to return an image:

**[BOT — fires after processing timeout of 3 minutes]**

```
H: Sunita ji, kuch technical dikkat aayi.
Aapka paisa safe hai — koi kaat nahi.
Hum 15 minute mein dobara try karenge automatically.

E: Sunita ji, a technical issue came up.
Your money is safe — nothing was charged.
We'll automatically try again in 15 minutes.
```

`[DELAY: 15 minutes]`

Auto-retry processing. If successful, deliver image with:

```
H: Sorry for the wait, Sunita ji! Yeh raha aapka photo.
Processing mein thodi der ho gayi.

E: Sorry for the wait, Sunita ji! Here's your photo.
There was a processing delay.
```

If second attempt also fails:

```
H: Maafi chahte hain — aaj processing down hai.
Aapka paisa wapas ho jayega agle 3-5 din mein.
Kal dobara try karo — hum theek ho jaenge.

E: We're sorry — processing is down today.
Your payment will be refunded in 3-5 days.
Please try again tomorrow — we'll be back.
```

---

## APPENDIX A — BUTTON AND QUICK REPLY REFERENCE

### WhatsApp Interactive Message Limits
- Buttons (CTA): Max 3 per message, max 20 characters per label
- Quick Replies: Max 3 per message, max 20 characters per label
- List Messages: Max 10 items, max 24 characters per item title
- List messages cannot be used in reply to another list message

### Complete Button Label Reference (Hindi / English)

| Function | Hindi Label | English Label |
|---|---|---|
| Start free trial | Free mein try karo | Try for free |
| Start paid order | Rs 99 mein try karo | Try for Rs 99 |
| Pay single image | Rs 116.82 pay karo | Pay Rs 116.82 |
| Pay 3 images | Rs 350.46 pay karo | Pay Rs 350.46 |
| Send new photo | Nayi photo bhejo | Send new photo |
| Change style | Style badlo | Change style |
| Confirm order | Haan, shuru karo! | Yes, start! |
| Share WhatsAds | Share karo | Share |
| Resend payment | Payment link dobara | Resend link |
| Cancel | Cancel karo | Cancel |
| See example | Example dekho | See example |
| Try Diwali style | Diwali style try | Try Diwali style |

---

## APPENDIX B — LANGUAGE HANDLING

### Supported Languages (Auto-Detection)
1. Hindi (primary — default)
2. English (switches if user writes in English)
3. Gujarati (voice notes only — Whisper transcription)
4. Marathi (voice notes only)
5. Tamil (voice notes only)
6. Telugu (voice notes only)
7. Punjabi (voice notes only)

### Language Switch Logic
- If user's first typed message is in English → use English for all bot messages
- If user's first typed message is in Hindi/Hinglish → use Hindi
- If user's first typed message is ambiguous (single word like "Hi") → ask (Message 1 quick reply)
- If user switches language mid-conversation → detect and switch bot language too
- Voice notes: transcribe in original language, echo back a 1-line summary to confirm understanding, apply to image generation prompt in English (passed to AI model)

### Hinglish is Acceptable
The bot does not need to be "pure Hindi." Hinglish (Hindi-English mix) is natural for this demographic. Examples:
- "Photo send karo" (not "Chitra bhejiye")
- "Style choose karo" (not "Shaili chuniye")
- "Ready ho jayega" (not "Tyaar ho jaayega")

---

## APPENDIX C — DATA AND PRIVACY (DPDP ACT 2023)

### Data Collected Per User
- Phone number (identifier)
- Name (first name only, self-reported)
- Business category (self-reported)
- Language preference (inferred)
- Order history (timestamps, styles selected, order IDs)
- Product photos (stored for 7 days post-delivery, then deleted)
- Processed images (stored for 7 days post-delivery, then deleted)
- Voice note transcriptions (processed, not stored)
- Consent timestamp and policy version

### Data NOT Collected
- Email address
- Location
- UPI ID or any payment credentials (handled entirely by Razorpay)
- Business name
- Any biometric data

### User Rights (DPDP 2023)
- Right to data deletion: User can message "mera data delete karo" → bot confirms and triggers deletion within 7 days
- Right to access: User can message "mera data batao" → bot sends text summary of stored data (no photo re-sends)
- Data breach: Notify DPBI within 72 hours if any breach occurs

### Privacy Policy URL
Every conversation: `whatsads.in/privacy` (must exist on launch)

---

## APPENDIX D — TECHNICAL INTEGRATION NOTES FOR DEVELOPER

### WhatsApp Business API Setup
- Use WhatsApp Cloud API (Meta) — free tier sufficient for early volumes
- Requires a verified Facebook Business Manager account
- Business verification takes 2–5 business days
- Phone number must be dedicated (not personal WhatsApp)
- Message templates (for outbound messages to users who have not messaged in 24h) must be pre-approved by Meta — submit re-engagement templates during setup

### Message Template Categories (for Meta Approval)
- UTILITY: Order confirmation, payment confirmation, delivery notification, processing status
- MARKETING: Re-engagement messages, new style announcements, festival promotions
- AUTHENTICATION: Not needed (no OTP in this flow)

### Key Webhooks to Build
1. `POST /webhook/whatsapp` — receives all inbound WhatsApp messages
2. `POST /webhook/razorpay` — receives payment confirmation/failure
3. `POST /webhook/ai-complete` — fires when AI processing returns an image (or internal queue polling)

### Session State Machine
Each user has a session state. States:
- `NEW` → `ONBOARDING` → `IDLE`
- `IDLE` → `PHOTO_RECEIVED` → `STYLE_SELECTED` → `AWAITING_PAYMENT` → `PROCESSING` → `DELIVERED` → `IDLE`
- `DELIVERED` → `REVISION_REQUESTED` → `PROCESSING` → `DELIVERED`
- Any state → `ERROR` → `IDLE` (with refund if payment was taken)

### Processing SLA Targets
- Photo received → style prompt ready: < 5 seconds
- Payment confirmed → processing start: < 10 seconds
- Processing start → image delivered: 45–90 seconds (target 60)
- Revision request → revised image: 30–60 seconds

### Rate Limits
- Max 5 photos per user per session (hard limit, per 6F)
- Max 1 re-engagement message per user per week
- Max 3 failure retries per order before triggering refund
- Bot response rate limit: 1 message per 30 seconds per user during processing (per 6E)

---

*Document Version: 1.0*
*Created: March 27, 2026*
*Product: WhatsAds*
*Author: WhatsAds Product Team*

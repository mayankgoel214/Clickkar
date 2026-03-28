# WhatsAds — Pre-Build Checklist (Day 0)
Architecture: Option C Smart Hybrid
Date written: 2026-03-27

---

## HOW TO READ THIS DOCUMENT

Work through sections 1-5 in order.
Items marked [BLOCKING] must be done before a single line of code is written.
Items marked [PARALLEL] can be done at the same time as other tasks.
Items marked [ASYNC] have an approval wait — start them first, then do other things while waiting.

Estimated total setup time: 2-3 days if you start the slow items on Day 0.

---

## 1. ACCOUNTS AND API KEYS NEEDED

---

### 1.1 Meta Business Manager (WhatsApp Cloud API)
[BLOCKING] [ASYNC] — Start this first. Can take 2-7 days for full verification.

Sign up URL: https://business.facebook.com
WhatsApp Cloud API docs: https://developers.facebook.com/docs/whatsapp/cloud-api

Steps in order:
1. Create a personal Facebook account if you do not have one.
2. Go to https://business.facebook.com and create a Meta Business account.
   Use your real business name — this shows up in Business Verification.
3. Go to https://developers.facebook.com and create a Developer account.
4. Create a new App. Choose type "Business". Give it a name like "WhatsAds".
5. Add the "WhatsApp" product to your app from the dashboard.
6. In the WhatsApp setup, you will get a temporary test phone number from Meta.
   This lets you send test messages immediately without your real number.
   USE THIS for development. Do not add your real number yet.
7. From the WhatsApp > API Setup page, copy:
   - Phone Number ID (this is WHATSAPP_PHONE_NUMBER_ID)
   - Temporary access token (expires in 24h — for testing only)
8. To get a permanent token: go to Business Settings > System Users,
   create a System User, assign it the WhatsApp app, generate a token.
   This is your permanent WHATSAPP_ACCESS_TOKEN.
9. For production with your real number, see Section 4 (Phone Number Setup).

Business Verification (required for production messaging):
- Go to Business Settings > Security Center > Start Verification
- You will need: business name, registered address, phone number, website
- Upload: GST certificate OR shop registration OR MSME certificate OR ITR
- Approval time: 2-7 business days. Meta will email you.
- Without this, you are limited to messaging only numbers that have messaged you first.

Free tier limits:
- 1,000 free user-initiated conversations per month per WABA
- Business-initiated messages cost money after the free tier
- Test number sends up to 5 unique numbers per day (plenty for dev)

Keys to store:
  WHATSAPP_ACCESS_TOKEN=
  WHATSAPP_PHONE_NUMBER_ID=
  WHATSAPP_VERIFY_TOKEN=    (you make this up — any random string, used to verify webhook)
  WHATSAPP_WABA_ID=         (WhatsApp Business Account ID, from the dashboard)

---

### 1.2 fal.ai (Bria Product Shot + RMBG 2.0 + Flux Schnell)
[PARALLEL] — Takes 5 minutes. Immediate access.

Sign up URL: https://fal.ai
Billing page: https://fal.ai/dashboard/billing

Steps:
1. Sign up with Google or GitHub.
2. Go to https://fal.ai/dashboard/keys and click "Add Key".
3. Copy the key immediately — it will not be shown again.
4. Add a credit card and deposit at least $5.
   The free tier has no free credits — you pay per call from the start.
   $5 covers roughly 125 Bria Product Shot calls ($0.04 each) for testing.

Pricing for your use case:
- Bria Product Shot: $0.04 per image
- RMBG 2.0 (background removal): ~$0.001 per image
- Flux Schnell (image generation): ~$0.003 per step
- Budget $0.05-0.08 per full pipeline run

Model IDs you will use in code:
- fal-ai/bria-product-shot
- fal-ai/bria-rmbg-v2
- fal-ai/flux/schnell

Keys to store:
  FAL_KEY=

---

### 1.3 Google AI Studio (Gemini 2.5 Flash Lite)
[PARALLEL] — Takes 5 minutes. Immediate access.

Sign up URL: https://aistudio.google.com
API key page: https://aistudio.google.com/app/apikey

Steps:
1. Sign in with your Google account.
2. Click "Get API Key" > "Create API key in new project".
3. Copy the key.
4. No credit card needed for free tier.

Free tier limits (as of early 2026):
- Gemini 2.5 Flash Lite: 1,500 requests/day, 1M tokens/minute on free tier
- This is more than enough for v1 development and early production.
- If you exceed this, pricing is very cheap (~$0.10 per 1M input tokens).

Note: The model ID to use in API calls is "gemini-2.5-flash-lite".
Confirm the exact model ID at https://ai.google.dev/gemini-api/docs/models
before writing your image-understanding module, as Google updates model IDs frequently.

Keys to store:
  GOOGLE_AI_API_KEY=

---

### 1.4 Groq (Whisper Turbo transcription — primary)
[PARALLEL] — Takes 5 minutes. Immediate access.

Sign up URL: https://console.groq.com

Steps:
1. Sign up with Google or email.
2. Go to https://console.groq.com/keys and click "Create API Key".
3. Copy the key.

Free tier limits:
- whisper-large-v3-turbo: 7,200 seconds of audio per day on free tier
- Rate limit: 20 requests/minute, 2,000 requests/day
- This is sufficient for v1. A 30-second voice message costs 30 seconds of quota.
- No credit card needed for free tier.

Model ID: whisper-large-v3-turbo

Keys to store:
  GROQ_API_KEY=

---

### 1.5 Sarvam AI (Indian language transcription — fallback)
[PARALLEL] [ASYNC] — Free tier requires account approval, can take 1-2 days.

Sign up URL: https://www.sarvam.ai
API docs: https://docs.sarvam.ai

Steps:
1. Go to https://app.sarvam.ai and sign up.
2. Request API access — you may need to fill a form with your use case.
3. Once approved, go to the API keys section and generate a key.
4. They support Hindi, Tamil, Telugu, Kannada, Bengali, Gujarati, Marathi, etc.

Free tier limits: Check current limits at https://docs.sarvam.ai/api-reference/limits
As of mid-2025, they had a free research/startup tier with limited monthly calls.

Use case for WhatsAds: Groq Whisper is primary. Sarvam is fallback only when
Groq fails or rate-limits. Sarvam is particularly stronger for regional accents
in Hindi and Dravidian languages.

Keys to store:
  SARVAM_API_KEY=

---

### 1.6 Razorpay (Payment Links)
[BLOCKING] [ASYNC] — KYC can take 2-5 business days. Start this on Day 0.

Sign up URL: https://razorpay.com
Dashboard: https://dashboard.razorpay.com

Steps:
1. Sign up at https://razorpay.com/signup
2. You can access Test mode immediately with no documents.
   Test mode is fully functional — use it for all development.
3. For Live mode (real money), complete KYC under Account > Profile > KYC.

What you need for Razorpay KYC (see Section 2 for full business docs list):
- Business type: choose "Individual" if you are a freelancer/sole proprietor.
  This is the easiest path — no company registration needed.
- PAN card (personal PAN for Individual, business PAN for company)
- Bank account details (account number + IFSC)
- For Individual: Aadhaar for address proof
- Business address proof (utility bill or rental agreement)
- If you have a website: submit your website URL
- GSTIN: optional for Individual below 20L turnover, but add it if you have one

Test mode keys (available immediately, no KYC):
  RAZORPAY_KEY_ID=rzp_test_...
  RAZORPAY_KEY_SECRET=

Live mode keys (available after KYC approval):
  RAZORPAY_KEY_ID=rzp_live_...
  RAZORPAY_KEY_SECRET=
  RAZORPAY_WEBHOOK_SECRET=    (set this when you create a webhook in the dashboard)

Payment Links API: https://razorpay.com/docs/payments/payment-links/apis/
Webhook docs: https://razorpay.com/docs/webhooks/

Free tier: No monthly fee. Razorpay charges 2% per transaction (Indian cards).
No setup fee. Payouts take T+2 business days to your bank.

---

### 1.7 Supabase (Database + File Storage)
[PARALLEL] — Takes 10 minutes. Immediate access.

Sign up URL: https://supabase.com
Dashboard: https://app.supabase.com

Steps:
1. Sign up with GitHub (recommended — easier later for team access if needed).
2. Click "New Project". Choose a region: ap-south-1 (Mumbai) for India latency.
3. Set a strong database password. Save it somewhere — you cannot recover it.
4. Wait 2 minutes for the project to spin up.
5. Go to Settings > API. Copy:
   - Project URL (SUPABASE_URL)
   - anon public key (SUPABASE_ANON_KEY)
   - service_role secret key (SUPABASE_SERVICE_ROLE_KEY) — never expose this client-side

Storage setup (for generated ad images):
6. Go to Storage > New Bucket. Create a bucket named "ads".
   Set it to Public so image URLs work without auth headers.
   WhatsApp requires publicly accessible image URLs to send media messages.

Free tier limits:
- 500 MB database storage
- 1 GB file storage
- 2 GB bandwidth per month
- 50,000 monthly active users
- This is sufficient for at least 6 months of v1 operation.

Keys to store:
  SUPABASE_URL=
  SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=

---

### 1.8 Upstash (Redis for BullMQ queue)
[PARALLEL] — Takes 5 minutes. Immediate access.

Sign up URL: https://upstash.com
Dashboard: https://console.upstash.com

Steps:
1. Sign up with GitHub or Google.
2. Click "Create Database". Choose type: Redis.
3. Name: "whatsads-queue". Region: ap-south-1 (Mumbai).
4. Type: Regional (not Global — cheaper, same region as Railway).
5. Once created, go to the database details page. Copy:
   - Endpoint (the full redis://... URL) — this is UPSTASH_REDIS_URL
   - Password/Token — this is UPSTASH_REDIS_TOKEN

IMPORTANT: Upstash Redis uses a REST API and a Redis-compatible TCP endpoint.
BullMQ requires the TCP Redis endpoint, not the REST URL.
Use the "Redis URL" format shown in the dashboard: rediss://default:PASSWORD@HOST:PORT

Free tier limits:
- 10,000 commands per day
- 256 MB storage
- This is enough for development. Each job consumes roughly 5-10 commands.
- At 100 jobs/day you use ~1,000 commands/day — well within free tier.

Keys to store:
  UPSTASH_REDIS_URL=rediss://default:...@....upstash.io:6379
  UPSTASH_REDIS_TOKEN=    (only needed if you use Upstash REST API — skip for BullMQ)

---

### 1.9 Railway (Hosting)
[PARALLEL] — Takes 10 minutes. Immediate access after GitHub connect.

Sign up URL: https://railway.app
Dashboard: https://railway.app/dashboard

Steps:
1. Sign up with GitHub.
2. Click "New Project" > "Deploy from GitHub repo".
3. Connect your GitHub account and select the WhatsAds repo.
4. Railway will auto-detect Node.js.
5. Add environment variables under the "Variables" tab — add all env vars from this doc.
6. Set the start command in railway.toml or package.json scripts: node src/index.js
7. Railway gives you a public URL like whatsads-production.up.railway.app
   Use this as your webhook URL for Meta and Razorpay during development.

Free tier limits (Hobby plan — $5/month credit):
- Railway gives $5/month free credit on the Hobby plan.
- A Node.js app with low traffic costs roughly $1-3/month.
- Your $5 credit covers it entirely in the beginning.
- No credit card needed for the free Dev plan (but very limited — add card for Hobby).

Railway-specific files you will need to create:
  railway.toml      (build and deploy config)
  Procfile          (optional alternative to railway.toml)

Keys to store:
  RAILWAY_TOKEN=    (only needed if you use Railway CLI — optional)

---

### 1.10 Sentry (Error Tracking)
[PARALLEL] — Takes 5 minutes. Immediate access.

Sign up URL: https://sentry.io
New project: https://sentry.io/organizations/new/

Steps:
1. Sign up with GitHub.
2. Create a new Organization (use your product name).
3. Create a new Project. Choose platform: Node.js.
4. Sentry will show you a DSN URL. Copy it — this is SENTRY_DSN.
5. Install the SDK: npm install @sentry/node
6. Initialize Sentry at the very top of src/index.js before any other imports.

Free tier limits:
- 5,000 errors per month
- 10,000 performance transactions per month
- 1 team member
- This is more than enough for v1.

Keys to store:
  SENTRY_DSN=https://...@....ingest.sentry.io/...

---

### 1.11 Remove.bg (Jewellery background removal — fallback)
[PARALLEL] — Takes 5 minutes. Immediate access.

Sign up URL: https://www.remove.bg/api

Steps:
1. Sign up with email.
2. Go to https://www.remove.bg/dashboard#api-key and copy your API key.

Free tier limits:
- 50 free API calls per month on free tier.
- After that: $0.20 per image (expensive — use only as last resort).
- In practice, fal.ai RMBG 2.0 is your primary BG remover.
  Remove.bg is fallback only for jewellery where RMBG 2.0 fails.

Keys to store:
  REMOVEBG_API_KEY=

---

## 2. BUSINESS REQUIREMENTS

---

### 2.1 For Razorpay Live KYC

Individual / Sole Proprietor (easiest path — recommended for solo developer):
- PAN card (personal)
- Aadhaar card (for identity + address)
- Bank account: savings or current, in your name
- Business address: your home address is fine for Individual
- Website or app description: describe WhatsAds in 2-3 sentences
- GSTIN: not required if turnover is under 20 lakh per year. Add later if needed.

Private Limited Company (if you have one registered):
- Certificate of Incorporation
- MOA / AOA
- Company PAN
- Director's PAN + Aadhaar
- Business current account

Recommendation: Start as Individual. You can upgrade the Razorpay account to a
company account later. KYC is faster for Individual (1-2 days vs 3-5 days for company).

---

### 2.2 For Meta Business Verification

Meta accepts these document types for Indian businesses:
- GST Registration Certificate (easiest — most businesses have this)
- Certificate of Incorporation (for Pvt Ltd)
- Shop and Establishment Act Registration
- MSME / Udyam Registration Certificate
- ITR (Income Tax Return) acknowledgement

If you are operating as an individual with no registration:
- MSME / Udyam registration is free and fast (https://udyamregistration.gov.in)
  You can register online in 1 day with just your Aadhaar.
  This gives you a legitimate business registration document for Meta.
- Recommendation: Register on Udyam today if you have no other business registration.

Meta also requires:
- A functioning website or Facebook Page for the business
- The business name on Meta must match the name on your document exactly

---

### 2.3 For Other Services

All other services (fal.ai, Supabase, Groq, Upstash, Railway, Sentry):
- No business documents needed
- Personal email + credit/debit card is sufficient
- Individual developer accounts work fine

---

## 3. ENVIRONMENT VARIABLES

Create a file called .env at the project root.
Add .env to your .gitignore immediately — never commit this file.
Also create a .env.example with the same keys but empty values — this is safe to commit.

```
# ─── WhatsApp / Meta ──────────────────────────────────────────────────────────
WHATSAPP_ACCESS_TOKEN=           # Permanent system user token from Meta Business
WHATSAPP_PHONE_NUMBER_ID=        # From WhatsApp > API Setup in Meta Developer portal
WHATSAPP_WABA_ID=                # WhatsApp Business Account ID from Meta dashboard
WHATSAPP_VERIFY_TOKEN=           # Random string you make up, used to verify webhook

# ─── AI / ML Services ─────────────────────────────────────────────────────────
FAL_KEY=                         # From fal.ai dashboard > API Keys
GOOGLE_AI_API_KEY=               # From Google AI Studio > Get API Key
GROQ_API_KEY=                    # From Groq console > API Keys
SARVAM_API_KEY=                  # From Sarvam AI dashboard (fallback transcription)

# ─── Image Processing ─────────────────────────────────────────────────────────
REMOVEBG_API_KEY=                # From remove.bg dashboard (jewellery BG fallback)

# ─── Payments ─────────────────────────────────────────────────────────────────
RAZORPAY_KEY_ID=                 # rzp_test_... for dev, rzp_live_... for prod
RAZORPAY_KEY_SECRET=             # From Razorpay dashboard > API Keys
RAZORPAY_WEBHOOK_SECRET=         # Set when creating webhook in Razorpay dashboard

# ─── Database ─────────────────────────────────────────────────────────────────
SUPABASE_URL=                    # From Supabase > Settings > API > Project URL
SUPABASE_ANON_KEY=               # From Supabase > Settings > API > anon public
SUPABASE_SERVICE_ROLE_KEY=       # From Supabase > Settings > API > service_role (secret!)

# ─── Queue / Redis ────────────────────────────────────────────────────────────
UPSTASH_REDIS_URL=               # TCP Redis URL: rediss://default:PASSWORD@HOST:PORT
# UPSTASH_REDIS_TOKEN is only needed for Upstash REST API — skip for BullMQ

# ─── Hosting / Infrastructure ─────────────────────────────────────────────────
PORT=3000                        # Fastify will listen on this port
NODE_ENV=development             # Set to "production" in Railway

# ─── Error Tracking ───────────────────────────────────────────────────────────
SENTRY_DSN=                      # From Sentry project settings

# ─── App Config ───────────────────────────────────────────────────────────────
APP_URL=                         # Your Railway public URL (e.g. https://whatsads.up.railway.app)
                                 # Used to generate payment link callbacks and image URLs
WEBHOOK_BASE_URL=                # Same as APP_URL in most cases
```

Total: 20 environment variables.

Notes on secrets management:
- In Railway: add all these under Project > Variables. Railway injects them at runtime.
- Never log any value that contains "KEY", "SECRET", "TOKEN" or "DSN".
- Rotate WHATSAPP_ACCESS_TOKEN if you ever accidentally push it to GitHub.
  System User tokens do not expire unless you revoke them manually.

---

## 4. PHONE NUMBER SETUP

### What happens to your existing WhatsApp account?

When you register a phone number with WhatsApp Cloud API (Meta):
- That number gets DELETED from WhatsApp consumer app (the regular WhatsApp on your phone).
- You CANNOT use the same number for personal WhatsApp AND the Cloud API at the same time.
- This is a hard constraint enforced by Meta — there is no workaround.

### Your options

Option A — Use a dedicated SIM for the business number (RECOMMENDED):
- Buy a new Jio/BSNL/Airtel SIM. Costs Rs. 99-299.
- Use that new number for WhatsApp Cloud API / WhatsAds.
- Keep your existing personal number untouched.
- This is the right answer. Do not sacrifice your personal number.

Option B — Use Meta's test number for development, add real number later:
- During development, use Meta's test number (provided free in the developer portal).
- The test number cannot receive messages from the public, only from numbers you whitelist.
- Whitelist your own personal number to test the full flow.
- When you go live, add your dedicated business SIM.

Option C — Port your business number away from personal use (only if it is already a business number):
- If you already have a WhatsApp Business App number that nobody uses personally, you can migrate it.
- Still, a dedicated SIM is cleaner.

Recommendation: Use Option B during development (free, immediate) and Option A for production.

---

### Step-by-step to add your real number to WhatsApp Cloud API

Do this AFTER you finish development and are ready for production.

Step 1: Ensure Meta Business Verification is complete (Section 1.1, Step 6).
         You cannot add a real number without Business Verification.

Step 2: In Meta Developer portal > WhatsApp > Phone Numbers > Add Phone Number.

Step 3: Enter your business phone number. Meta will send an OTP via SMS or voice call.

Step 4: Before doing this, make sure the number is NOT registered on any WhatsApp
         (consumer app or WhatsApp Business App).
         To deregister: open WhatsApp on that phone > Settings > Account > Delete Account.
         This deletes the WhatsApp account on that number. Your SIM and calls still work normally.

Step 5: Enter the OTP in Meta Developer portal. The number is now registered.

Step 6: The number will show as "Connected" in the dashboard.
         Your Fastify server's WHATSAPP_PHONE_NUMBER_ID should be updated to the new number's ID.

Step 7: Set up the webhook for the new number:
         WhatsApp > Configuration > Webhook URL: https://your-railway-url/webhook/whatsapp
         Verify Token: the value in your WHATSAPP_VERIFY_TOKEN env var
         Subscribe to: messages

Time required: 30-60 minutes if Business Verification is already done.

---

### Display Name Approval

When you register a business number, Meta requires you to set a Display Name.
This is what users see in WhatsApp instead of the phone number.
Examples: "WhatsAds", "WhatsAds by YourName"

Rules:
- Cannot be generic (e.g. "Ads" will be rejected)
- Must relate to your business name on the Meta Business Manager account
- Approval takes 1-3 business days
- During this time your number works but shows the phone number, not the display name

---

## 5. WHAT TO DO TODAY (Day 0)

Priority order is based on: what blocks everything else, and what takes longest to approve.

---

### HOUR 0-1 (Do these first — they have the longest wait times)

[ ] 1. Create Meta Business Manager account at https://business.facebook.com
        Start Business Verification immediately (upload GST / Udyam certificate).
        This is the single longest bottleneck. Everything WhatsApp depends on it.
        TIME TO APPROVE: 2-7 days.

[ ] 2. If you have no business registration document:
        Register on Udyam at https://udyamregistration.gov.in (takes 1 hour, uses Aadhaar).
        You need this for Meta Business Verification AND optionally for Razorpay.

[ ] 3. Sign up for Razorpay at https://razorpay.com/signup
        Immediately start Live KYC under Account > Profile > KYC.
        Use Test mode keys for development — you get these instantly.
        TIME TO APPROVE: 2-5 business days for Live mode.

---

### HOUR 1-2 (Do these while the above are being submitted)

[ ] 4. Sign up for fal.ai at https://fal.ai
        Add a credit card. Deposit $5. Generate API key. (5 minutes)

[ ] 5. Sign up for Google AI Studio at https://aistudio.google.com
        Generate Gemini API key. (5 minutes)

[ ] 6. Sign up for Groq at https://console.groq.com
        Generate API key. (5 minutes)

[ ] 7. Sign up for Supabase at https://supabase.com
        Create project in ap-south-1 region. Save DB password.
        Create storage bucket named "ads" (set to Public).
        Copy SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. (10 minutes)

[ ] 8. Sign up for Upstash at https://upstash.com
        Create Redis database in ap-south-1. Copy the TCP Redis URL. (5 minutes)

---

### HOUR 2-3 (Do these next)

[ ] 9. Sign up for Railway at https://railway.app
        Connect your GitHub account. Create a new project from the WhatsAds repo.
        Note the auto-generated public URL — you need this for webhook setup.
        Add all environment variables collected so far under the Variables tab. (15 minutes)

[ ] 10. Sign up for Sentry at https://sentry.io
         Create a Node.js project. Copy SENTRY_DSN. (10 minutes)

[ ] 11. Sign up for remove.bg at https://www.remove.bg/api
         Copy API key. (5 minutes)

[ ] 12. Sign up for Sarvam AI at https://app.sarvam.ai
         Submit access request. (5 minutes — but approval may take 1-2 days)

---

### HOUR 3-4 (Project scaffolding — do while waiting for approvals)

[ ] 13. Create .env and .env.example files at the project root.
         Fill in every key you have collected so far.
         Add .env to .gitignore.

[ ] 14. In Meta Developer portal:
         - Create a Developer App (type: Business)
         - Add WhatsApp product
         - Copy the TEST phone number ID and temporary access token into .env
         - Whitelist your personal number so you can receive test messages
         - Set up the webhook URL pointing to your Railway public URL

[ ] 15. Initialize the Node.js project:
         npm init -y
         npm install fastify @fastify/formbody dotenv
         npm install @supabase/supabase-js
         npm install bullmq ioredis
         npm install @fal-ai/client
         npm install @google/generative-ai
         npm install groq-sdk
         npm install razorpay
         npm install @sentry/node
         Create src/index.js with a basic Fastify server.
         Verify Railway deploys successfully.

[ ] 16. Confirm your webhook endpoint is reachable:
         Railway URL + /webhook/whatsapp should return 200 OK.
         Use the Meta Webhook debugger to verify the handshake works.

---

### PARALLEL TRACK (While waiting for Meta and Razorpay approvals)

These do NOT depend on Meta or Razorpay being approved:

[ ] Write the database schema and run migrations in Supabase.
[ ] Build the fal.ai image generation module — test it standalone with a product photo.
[ ] Build the Gemini image-understanding module — test it with a few product images.
[ ] Build the Groq transcription module — test with a Hindi voice note.
[ ] Build the BullMQ worker and queue logic — test job processing end-to-end.
[ ] Build the WhatsApp message sending module using the TEST number.
[ ] Build the Razorpay Payment Link creation using TEST mode keys.

You can complete 80% of the application before Meta Business Verification finishes.
The only thing that requires full approval is: messaging real users who have not messaged you first.

---

### CHECKLIST SUMMARY TABLE

| Service            | Time to Set Up | Approval Wait  | Blocks What          |
|--------------------|----------------|----------------|----------------------|
| Meta Business Mgr  | 1 hour         | 2-7 days       | Production messaging |
| Razorpay Live      | 30 minutes     | 2-5 days       | Real payments        |
| Sarvam AI          | 5 minutes      | 1-2 days       | Hindi fallback only  |
| fal.ai             | 5 minutes      | None           | Image generation     |
| Google AI Studio   | 5 minutes      | None           | Image understanding  |
| Groq               | 5 minutes      | None           | Voice transcription  |
| Supabase           | 10 minutes     | None           | Database, storage    |
| Upstash            | 5 minutes      | None           | Job queue            |
| Railway            | 15 minutes     | None           | Hosting, webhooks    |
| Sentry             | 10 minutes     | None           | Error tracking       |
| Remove.bg          | 5 minutes      | None           | BG removal fallback  |

Total setup time (excluding approval waits): ~2 hours
Total blocking approval wait: 2-7 days (Meta) — start this on Day 0, build everything else while waiting.

---

## APPENDIX: QUICK REFERENCE LINKS

| Service          | Dashboard                                      | API Docs                                                    |
|------------------|------------------------------------------------|-------------------------------------------------------------|
| Meta / WhatsApp  | https://business.facebook.com                  | https://developers.facebook.com/docs/whatsapp/cloud-api     |
| fal.ai           | https://fal.ai/dashboard                       | https://fal.ai/docs                                         |
| Google AI Studio | https://aistudio.google.com                    | https://ai.google.dev/gemini-api/docs                       |
| Groq             | https://console.groq.com                       | https://console.groq.com/docs                               |
| Sarvam AI        | https://app.sarvam.ai                          | https://docs.sarvam.ai                                      |
| Razorpay         | https://dashboard.razorpay.com                 | https://razorpay.com/docs/payments/payment-links/apis/      |
| Supabase         | https://app.supabase.com                       | https://supabase.com/docs                                   |
| Upstash          | https://console.upstash.com                    | https://docs.upstash.com/redis                              |
| Railway          | https://railway.app/dashboard                  | https://docs.railway.app                                    |
| Sentry           | https://sentry.io                              | https://docs.sentry.io/platforms/node/                      |
| Remove.bg        | https://www.remove.bg/dashboard                | https://www.remove.bg/api                                   |
| Udyam (MSME)     | https://udyamregistration.gov.in               | N/A                                                         |

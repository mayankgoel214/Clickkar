# Claude — Read this first when continuing work on Autmn

This is a session-handoff doc. Read it once, then use `CLAUDE.md` (root) and `~/.claude/CLAUDE.md` (Studio Charter) for ongoing reference.

Last updated: **2026-04-28** (after V1.2.1 merged to main, before production deploy)

---

## Where things stand right now

**You just shipped V1.2.1 to `main`.** Merge commit on GitHub is `ca5973b`, PR #19. Founder is switching laptops and is about to add real WhatsApp + Razorpay credentials and deploy.

| Component | Status |
|---|---|
| Production pipeline V1.2.1 | ✅ Merged to main |
| Local dev environment | ✅ Working — admin UI tested |
| Real WhatsApp credentials | ❌ Founder will add post-deploy |
| Real Razorpay credentials | ❌ Founder will add post-deploy |
| Production hosting | ❌ Not deployed yet (recommend Vercel for API, Railway for worker) |
| Webhook configuration | ❌ Pending after deploy |
| First paid customer | ❌ Will happen post-deploy |

---

## What V1.2.1 actually is (tl;dr the architecture)

```
processOrderProduction(photos, styles, category, instructions)
   ↓
[V1.2.1] parsePerStyleInstructions       ← splits Hinglish/Hindi/English per-style (₹0.05)
   ↓
[V1.1+V1.2] generateCreativeBrief        ← per-product LLM brief with specialist personas (₹0.10)
   ↓ (per style, in parallel)
buildBetaPrompt(style, instructions, category, artDirection)
   ↓
TIER 1: gemini-3-pro-image-preview        (₹13.40, temp 0.3, 3× identity anchoring)
   ↓ (raw output)
runDeterministicChecks                    ← blur/blank/aspect/fill/duplication/severe color drift
   ↓ pass            ↓ fail
finalize+upload    TIER 2: gpt-image-2    (₹21)
                       ↓ fail
                   REFUND
```

**Real cost / margin (validated by founder's billing):**
- Happy path: ~₹46.50 / order, ₹52.50 margin (53%) at ₹99 retail
- 1 GPT-2 fallback: ~₹67.50, ₹31.50 margin (32%)
- Break-even: ~322 orders/month at fixed cost ₹16,883/mo

---

## Architecture decisions — DO NOT reverse without strong evidence

These were debated, tested, and locked. Each has a failure history.

| Decision | Why locked |
|---|---|
| Beta prompt (minimal) > SCHEMA prompt (verbose) | V5 SCHEMA fought Pro's priors, made outputs worse. Verified by side-by-side tests. |
| No QA gate that blocks shipping | False positives + over-gen waste. Causes more harm than good. |
| Pro → GPT-2 → refund (no NB2 middle tier) | NB2 shares Gemini's safety backend, refuses on the same content Pro refuses on (~95%). Saved ₹4.50 per failure that almost-never-succeeded. |
| No content-safety preflight | Gemini's built-in filter is enough. Extra LLM call wastes ₹. |
| No multiple Pro candidates + best-of | Doubles cost for marginal quality lift. |
| Per-product Creative Brief LLM (V1.1+) | This is the moat. Same style + different product = different ad direction. |
| Triple identity anchoring (3× primary as ref) | Fixes Monster-style identity drift on rare product variants. |
| Per-style photographer personas in brief LLM | Apple, Tom Ford, Tanishq, Vogue, Aesop, Patagonia aesthetics — pulls Pro toward specialist priors. |
| Preservation reinforcement clause in every prompt | Tells Pro the product itself is sacred — only the scene varies. |
| Severe color drift hard fail at colorDistance > 2.5 | Catches white-Monster → black-Monster identity drift automatically. |
| Indian model default for `style_with_model` | Drops only if user explicitly asks otherwise. |
| 1:1 square aspect locked | Universal across WhatsApp / Insta / Facebook. |
| Only `style_with_model` may include a person | Strict rule in brief LLM prompt. Outdoor/Lifestyle/Festive must be product-only. |
| Old V5 + 5 variants archived at `_archive/` | Excluded from compile via tsconfig. DO NOT import. |
| fal.ai still a dependency but not on image path | Only `removeBackground` reference in `fallback.ts`. Could be removed in cleanup PR. |

---

## Pending work (in priority order)

1. **Deploy to prod** — Vercel for API, Railway for worker. Founder is doing this manually.
2. **First 5 paid orders** — observe real cost, latency, edit rate. Calibrate projections.
3. **V1.3 — Smart edit pipeline** — when user taps "Make a change", pass previous output as input to Pro instead of re-rolling from original photo. Touches `packages/session/src/handlers/delivery.ts` + `edit.ts`.
4. **Bulk mode** — 30/50/100 photos with Gemini Batch API (50% Pro discount). New session states `BULK_COLLECTING_PHOTOS` + `BULK_PROCESSING`. See conversation history for the spec.
5. **Test harness** — `scripts/test-production.ts` runs 15 fixture products through all 9 styles. Regression script. Wait until founder has fixture photos.
6. **fal.ai cleanup** — remove `removeBackground` and the package entirely. Not blocking.
7. **Storage TTL cleanup cron** — delete `raw-images` older than 30 days for DPDP compliance. Not blocking.

---

## Things to watch in production

When the founder says "production is broken" or asks "why did this fail", look for these structured log events:

| Event | Meaning | Action |
|---|---|---|
| `production_instructions_parsed` with `confidence < 0.5` | Parser was uncertain | OK — fallback applies raw to all styles |
| `production_creative_brief` with `briefHit: false` | Brief LLM failed | OK — pipeline falls back to V1 base Beta |
| `production_tier1_defect` with `reason: severe_color_shift:...` | Pro produced wrong-color product | Working as designed — falls to GPT-2 |
| `production_tier1_defect` with `reason: likely_duplication:...` | Pro made multiple copies of product | Working as designed — falls to GPT-2 |
| `production_tier2_failed` | Both Pro AND GPT-2 failed | Refund triggered. Investigate the input photo + safety refusal logs. |
| `Storage upload failed` or `storage_upload_retry` | Supabase blip | Self-heals (3× retry built in). Watch frequency. |

---

## Key file paths

| Path | What's there |
|---|---|
| `packages/ai/src/pipeline/production.ts` | THE V1.2.1 pipeline. Entry: `processOrderProduction`. |
| `packages/ai/src/pipeline/creative-brief.ts` | V1.1+V1.2+V1.2.1 Creative Brief LLM. Has specialist personas + strict rules. |
| `packages/ai/src/pipeline/style-prompts-v5.ts` | `buildBetaPrompt` — final prompt assembled here. |
| `packages/ai/src/pipeline/never-fail-pipeline.ts` | Worker shim. Calls per-style brief + production chain. |
| `packages/ai/src/qa/deterministic-checks.ts` | sharp-based defect checks (blur/blank/aspect/fill/duplication/color). |
| `packages/ai/src/instructions/parse-per-style.ts` | Hinglish-aware per-style instruction parser (V1.2.1). |
| `packages/ai/src/pipeline/_archive/` | Old V5 + 5 variants. Reference only. Excluded from compile. |
| `apps/api/src/routes/admin/test.ts` | Admin UI for testing. Includes parsed-instructions display + Creative Brief panel. |
| `apps/api/src/routes/webhooks/whatsapp.ts` | WhatsApp Cloud API webhook receiver. |
| `apps/worker/src/processors/image-processing.ts` | BullMQ worker that calls `processImageNeverFail` per style. |
| `packages/session/src/machine.ts` | WhatsApp session state machine. |
| `packages/session/src/handlers/` | Per-state handlers (onboarding, images, payment, delivery, etc.) |

---

## Quirks the founder has flagged

| Quirk | Detail |
|---|---|
| Gemini billing dashboard lags 24h | Don't trust the spend chart for live numbers. Use `aistudio.google.com/usage` for fresher signal. |
| Pro response time varies 18-56s | Google-side load. Per-style timeout is 3 min so we ride it out. |
| Real cost is ~₹43-46/order, not ₹40.30 | Headline Pro pricing ($0.134) excludes reference image input tokens. Real per-order cost includes ~₹2-3 of input tokens. |
| Quality is intermittent on multi-piece sets | Jewellery sets sometimes drop earrings on Autmn Special. V1.2 preservation clause + 3× anchoring should reduce this; verify in next test round. |
| The remote URL still says Clickkar | GitHub auto-redirects to Autmn. Founder is aware. Cosmetic. |

---

## How to verify the pipeline is healthy on a new machine

```bash
cd ~/Autmn
git pull
pnpm install
pnpm db:generate
pnpm typecheck         # all 10 packages should pass
pnpm --filter @autmn/ai build   # should be silent (no output = success)
pnpm dev               # starts API on :3001 + worker
```

Then hit `http://localhost:3001/admin/test?key=<ADMIN_SECRET>` and run a generation. If the Creative Brief panel (purple) and Instructions Parsed panel (emerald, when you type instructions) both appear, V1.2.1 is wired correctly.

---

## Common founder requests + how to handle

| Request | Response pattern |
|---|---|
| "Why did X fail?" | Read worker logs for the `production_*` events. Don't guess — find the structured log. |
| "Make it cheaper" | Reference the existing cost table in this doc. Push back if it'd hurt quality. |
| "Make it more creative" | V1.2's specialist personas already push hard on creativity. Beyond this, risk is destabilization. |
| "Why is Pro slow today?" | Google-side latency. Not our pipeline. |
| "Can we use NB2 instead of Pro?" | No. Settled. NB2 quality gap is visible on hard products (humans, brand text, multi-piece). |
| "Why didn't the parser work?" | Check `production_instructions_parsed` log. Confidence < 0.5 means parser was uncertain. Falls back to raw. |
| "Add this style template to all products" | Push back. Per-product Creative Brief replaces template-thinking. Generic templates were V5's failure mode. |

---

## Founder profile (be useful, not generic)

- **Mayank Goel** — solo founder, college student in India
- Pays for Claude Max, nothing else
- Knows software dev well; relies on Claude for cloud/security/DevOps/SRE/finance/compliance/marketing
- India-first, Indian SMBs are the target customer
- Decisive, action-oriented — wants to ship, not over-plan
- Will push back when something feels wrong (e.g. surfaced the Outdoor-with-model bug)
- Doesn't want generic SaaS-y answers — concrete or don't say it

---

## Studio context

Autmn (the studio) ships one product per month, India-first, $0 budget except Claude Max. The Studio Charter + 25 specialist agents + handbook all live in a SECOND GitHub repo: **[mayankgoel214/autmn-dotfiles](https://github.com/mayankgoel214/autmn-dotfiles)** — run its `install.sh` on a new machine to symlink everything into `~/.claude/`. See `~/.claude/CLAUDE.md` for the Studio Charter — load-bearing rules:
- All non-trivial tasks go through `router` agent (not directly)
- No subscriptions until ₹10K MRR
- Mobile-first, WCAG 2.2 AA, GST-compliant invoicing
- No emojis in agent communication (unless founder asks)
- Push back on bad ideas — don't rubber-stamp

---

## When you're done with a session

If you wrap up significant work, update this doc's "Where things stand right now" + "Pending work" sections so the next session starts oriented.

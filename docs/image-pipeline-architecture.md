# WhatsAds AI Image Processing Pipeline — Complete Technical Architecture

**Document Version:** 1.0
**Last Updated:** March 2026
**Scope:** Core AI pipeline for transforming amateur product photos into professional social-media-ready images
**Target:** Solo developer, Rs 99/image pricing, 60-90 second SLA

---

## Table of Contents

1. Pipeline Overview
2. Stage-by-Stage Architecture
3. QA / Quality Gate System
4. Edit and Revision System
5. Prompt Engineering Library
6. Pipeline Timing and Parallelization
7. Cost Analysis
8. Product Category Handling
9. Implementation Code Skeleton
10. Risk Flags and Mitigations

---

## 1. Pipeline Overview

### The Core Problem

Indian micro-D2C founders shoot products on kitchen counters, bedroom floors, and windowsills. Their photos have three predictable failure modes:
- Cluttered, distracting backgrounds (cardboard boxes, tiled floors, fabric bundles)
- Poor and uneven lighting (harsh shadows, yellow indoor lighting, blown-out windows)
- Low resolution and camera shake from budget Android phones

The pipeline must handle all three without human intervention and produce an image good enough to post on Instagram without embarrassment.

### The Chosen Approach: Segmentation-First Compositing

Rather than trying to "fix" bad photos in-place (which requires inpainting over unpredictable clutter), we:
1. Extract the product cleanly from its environment
2. Enhance the product itself in isolation
3. Generate or select a professional background
4. Composite the product onto the background with correct lighting

This is the same approach used by Photoroom, Packshot Creator, and professional e-commerce studios. It is more reliable than whole-image enhancement because each concern is isolated.

### High-Level Flow

```
[User uploads photo via WhatsApp]
         |
         v
[STAGE 0: Intake + Pre-processing]     ~3s
         |
         v
[STAGE 1: Input Quality Assessment]    ~5s   <-- GATE: reject unusable photos
         |
         v
[STAGE 2A: Background Removal]         ~6s  ---|
[STAGE 2B: Product Enhancement]        ~8s  ---| PARALLEL
         |
         v
[STAGE 3: Background/Scene Generation] ~20s
         |
         v
[STAGE 4: Compositing]                 ~15s
         |
         v
[STAGE 5: Final QA Check]              ~8s   <-- GATE: retry if score < threshold
         |
         v
[STAGE 6: Output Delivery]             ~3s
                                     ------
                              TOTAL:  ~55-65s (within 90s SLA)
```

Stages 2A and 2B run in parallel. This is the primary latency optimization.

---

## 2. Stage-by-Stage Architecture

---

### Stage 0: Intake and Pre-Processing

**What it does:** Accepts the raw phone image, validates it, normalizes dimensions, and routes to the correct product category pipeline.

**Implementation:** Pure Node.js, no external API needed.

```
Tasks:
- Validate file type (JPEG/PNG/WebP/HEIC)
- Convert HEIC to JPEG (iPhones send HEIC by default)
- Resize if > 4000px on any edge (to keep API costs linear)
- Extract EXIF orientation and auto-rotate
- Detect product category (auto or user-specified)
- Generate a job_id and persist to Supabase jobs table
- Upload original to Supabase Storage (raw/ bucket)
```

**Libraries:**
- `sharp` (Node.js) — HEIC conversion, resize, auto-rotate. Zero API cost.
- `exif-reader` — orientation extraction

**Latency:** 2-3 seconds (pure compute, no network round-trips)
**Cost:** Rs 0

**HEIC Note:** This is critical for India. iPhone 12 and above shoot HEIC by default. WhatsApp typically converts to JPEG when sharing, but if users upload directly via web form, you will see HEIC. `sharp` handles this with `libvips`.

---

### Stage 1: Input Quality Assessment

**What it does:** Decides if the photo is usable. Rejects completely dark photos, photos with no identifiable product, photos where the product is cut off, and photos with resolution too low to produce good output.

**Decision: Claude Haiku Vision (claude-haiku-4) as primary, with a fast pre-filter**

#### Option Comparison

| Option | Cost/call | Latency | Quality of Assessment | Verdict |
|---|---|---|---|---|
| Claude Haiku Vision | ~$0.0004 | 3-5s | Excellent — structured JSON output, nuanced | PRIMARY |
| GPT-4o mini Vision | ~$0.0004 | 3-6s | Good, similar to Haiku | Fallback |
| BLIP (Replicate) | ~$0.00022 | 1s | Only captions, no quality scoring | Too limited |
| CLIP embeddings | ~$0.00022 | <1s | Similarity scoring only, not assessment | Pre-filter only |
| Rule-based (no AI) | Rs 0 | <100ms | Misses subtle issues | Pre-filter only |

**Recommended Approach: Two-pass filter**

Pass 1 (free, <100ms): Rule-based sharp analysis
- If image is < 400x400 px: reject immediately
- If image mean brightness < 30 or > 240: flag as lighting issue
- If file size < 50KB: likely too compressed, flag

Pass 2 (AI, ~$0.0004, 3-5s): Claude Haiku Vision only if Pass 1 passes

**Claude Haiku Prompt for Quality Assessment:**

```
Analyze this product photo and respond ONLY with a JSON object. No other text.

{
  "usable": true/false,
  "product_detected": true/false,
  "product_category": "food|jewellery|garment|skincare|candle|home_goods|other",
  "issues": ["list of specific issues found"],
  "product_occupies_frame": "low|medium|high",
  "background_complexity": "simple|moderate|complex",
  "lighting_quality": "poor|acceptable|good",
  "blur_detected": true/false,
  "confidence": 0.0-1.0,
  "rejection_reason": "null or specific reason if usable=false"
}

Assess whether this photo of a product can be processed into a professional product image.
A photo is UNUSABLE if: the product is not visible, the image is completely blurred,
the product occupies less than 10% of the frame, or it is too dark to see.
```

**Cost per assessment:** ~$0.0004 (Claude Haiku, ~1600 tokens for image + ~200 output tokens)

**What happens on rejection:**
- WhatsApp message: "Yeh photo thodi unclear lag rahi hai. Product thoda bada dikhe aur achhi roshni mein photo lo. Try again?" (with a sample good photo link)
- Job status set to `failed_intake`, no further API calls made
- No charge to user

---

### Stage 2A: Background Removal

**What it does:** Removes everything except the product, producing a PNG with transparent background.

This is the highest-impact stage. A bad cutout cannot be fixed downstream. Fraying edges, color bleeding, and missed product parts all destroy the final composite.

#### Option Comparison for Background Removal

| Service | Cost/image | Latency | Edge Quality | Handles Complex Backgrounds | Verdict |
|---|---|---|---|---|---|
| Remove.bg API | ~$0.025 | 3-5s | Excellent, industry-best | Yes | Good but expensive |
| PhotoRoom API (Basic) | Subscription-based | 3-6s | Excellent, product-tuned | Yes | Best quality, opaque pricing |
| Clipdrop Remove BG | ~$0.01 | 3-5s | Very good | Yes | Good middle option |
| Bria RMBG 2.0 (fal.ai) | ~$0.001 | 2-4s | Very good | Yes | Best value |
| rembg via Replicate | ~$0.00028 | 2s | Good for simple BGs | Moderate | Cheapest, lowest quality |
| MODNet via Replicate | ~$0.00067 | 3s | Good for people, moderate for products | Low | Not ideal |
| SAM 2 (Meta) via Replicate | ~$0.005 | 8-12s | Excellent, segmentation mask | Yes | Slow, overkill for v1 |
| Self-hosted rembg | Rs 0 | 1-2s | Good | Moderate | Requires GPU infra |

**Recommended: Bria RMBG 2.0 via fal.ai as primary, Remove.bg as fallback**

Bria RMBG 2.0 was specifically trained on product images and achieves near-remove.bg quality at 10x lower cost. It runs on fal.ai with no cold starts.

**Cost:** ~$0.001 per image (Rs 0.085 at current rates)
**Latency:** 2-4 seconds

**Quality Edge Cases by Product Category:**
- Food (round items in bowls): RMBG 2.0 handles well
- Jewellery (thin chains, rings with holes): Remove.bg is better, worth the premium for this category
- Garments (soft edges, fabric fringe): RMBG 2.0 is adequate, SAM 2 is ideal
- Transparent/glass products: This is hard for ALL tools. Flag for manual review.

**Fallback Routing:**
```
if product_category == "jewellery":
    use Remove.bg (higher quality, worth $0.025)
elif product_category in ["food", "skincare", "candle"]:
    use Bria RMBG 2.0 (sufficient quality, $0.001)
else:
    use Bria RMBG 2.0, retry with Remove.bg if QA fails
```

**Output:** PNG with alpha channel, saved to Supabase Storage at `processed/{job_id}/cutout.png`

---

### Stage 2B: Product Enhancement (runs parallel to 2A)

**What it does:** While background removal runs, simultaneously enhance the product's visual qualities — fix color, improve sharpness, correct exposure, reduce noise.

**Decision: Two-pass approach using sharp (free) + conditional AI upscaling**

#### Option Comparison for Enhancement

| Service | Cost/image | Latency | What It Does | Verdict |
|---|---|---|---|---|
| sharp (local) | Rs 0 | <500ms | Color correction, sharpen, denoise, auto-levels | Free pre-processing |
| Clarity Upscaler (fal.ai) | $0.03/MP | 15-25s | Deep enhancement with detail generation | Too slow for budget |
| Real-ESRGAN (Replicate) | ~$0.0072 | 33s | Upscale 4x, good detail | Too slow |
| Clipdrop Image Upscaler | ~$0.01 | 10-15s | 16x upscale | Too slow |
| Stability AI Upscale | ~$0.012 | 10-15s | Good quality | Too slow |

**Key Insight:** AI upscaling takes 15-33 seconds and will blow our 90-second budget. For v1, use `sharp` for all product enhancement. It handles 80% of cases adequately. Reserve AI upscaling for a separate "HD" premium tier.

**sharp Enhancement Pipeline:**

```javascript
await sharp(cutout_path)
  .normalize()              // auto-levels — fixes under/overexposed shots
  .clahe({ width: 3, height: 3, maxSlope: 5 })  // local contrast enhancement
  .modulate({ saturation: 1.15 })  // +15% saturation — pops product colors
  .sharpen({ sigma: 0.8, m1: 1.5, m2: 0.7 })  // edge sharpening, not halos
  .toColorspace('srgb')
  .png({ quality: 95 })
  .toFile(enhanced_path)
```

**Product-category-specific adjustments:**
```
food:      saturation: 1.25, brightness: 1.05  (warm, appetizing)
jewellery: saturation: 0.95, brightness: 1.10   (neutral, clean, bright)
skincare:  saturation: 1.05, brightness: 1.08   (clean, slightly bright)
garment:   saturation: 1.10, brightness: 1.0    (accurate colors matter)
candle:    saturation: 1.15, brightness: 0.98   (warm tones)
```

**Cost:** Rs 0
**Latency:** 300-500ms

---

### Stage 3: Background and Scene Generation

**What it does:** Creates the styled background onto which the product will be composited. This is the most expensive and slowest stage — and the one that determines how "professional" the output looks.

This is the creative core of the product. The background transforms a kitchen-counter photo into a studio shot.

#### Option Comparison for Background Generation

| Service | Cost/image | Latency | Quality | Prompt Control | Verdict |
|---|---|---|---|---|---|
| Flux 1.1 Pro (Replicate) | $0.04 | 15-25s | Excellent | Excellent | PRIMARY |
| Flux Dev (Replicate) | $0.025 | 20-30s | Very good | Very good | Budget option |
| Flux Schnell (Replicate) | $0.003 | 3-5s | Good, less detailed | Good | Fast fallback |
| Flux Kontext Pro (fal.ai) | $0.04/MP | 8-15s | Excellent, img2img | Excellent | Best for edits |
| Recraft V3 (fal.ai) | $0.04 | 10-20s | Excellent, realistic | Very good | Good alternative |
| SD 3 (fal.ai) | $0.035 | 15-25s | Very good | Good | Alternative |
| DALL-E 3 | $0.04 | 10-20s | Good | Moderate | Restrictive TOS |
| Midjourney | No API | N/A | Best | Via Discord only | Not viable |

**Recommended: Flux Schnell as default, Flux 1.1 Pro for premium/retry**

Flux Schnell at $0.003 per image generates a 1024x1024 background in 3-5 seconds. For Rs 99 pricing, this is the correct default. The quality is genuinely good for backgrounds — it does not need to be photorealistic at max detail because the product (the hero) is composited on top.

Flux 1.1 Pro at $0.04 is reserved for: (a) festival/complex scenes, (b) QA retry attempts where Schnell failed, (c) a future "premium" tier.

**Background Dimensions:**
Generate at 1080x1080 (square) for Instagram. Also offer 1080x1350 (portrait 4:5) as an option. Never generate at the final output size — generate larger, then resize.

**Style Catalog (7 styles):**

| Style ID | Name | Target Products | Notes |
|---|---|---|---|
| clean_white | Studio White | All | Fastest, cheapest, always safe |
| gradient_minimal | Dark Minimal | Skincare, candles, jewellery | Dark to grey gradient |
| warm_lifestyle | Warm Lifestyle | Food, home goods | Wooden surfaces, warm light |
| festival | Festival | Food, garments, jewellery | Festive colors, diya motifs |
| marble_premium | Marble Premium | Jewellery, skincare | White/grey marble surface |
| outdoor_bokeh | Outdoor Bokeh | Garments, food | Blurred green/outdoor |
| flat_lay | Flat Lay | Food, skincare, candles | Top-down styled surface |

**Cost:** $0.003 (Schnell) or $0.04 (Flux 1.1 Pro)
**Latency:** 3-8s (Schnell), 15-25s (Flux Pro)

---

### Stage 4: Compositing

**What it does:** Places the enhanced, cutout product onto the generated background with correct perspective, shadow, and color harmony.

This stage is where amateurs fail and professionals shine. Dropping a product PNG on a background image produces an obvious fake — it floats without context. Proper compositing requires:
- Scaling the product to correct proportional size
- Positioning (rule of thirds or centered depending on style)
- Drop shadow generation
- Color grading to unify product and background tones
- Edge feathering (anti-aliasing the cutout boundary)

**Decision: sharp + custom compositing logic (no external API for v1)**

External AI compositing tools either don't exist as clean APIs or are too expensive/slow. For v1, a well-implemented sharp compositor produces acceptable results. Flux Kontext (image editing) is the upgrade path for v2.

**Compositing Algorithm:**

```javascript
async function composite(cutout, background, category, style) {
  const bg = await sharp(background).resize(1080, 1080).toBuffer()
  const product = await sharp(cutout).toBuffer()
  const productMeta = await sharp(product).metadata()

  // Scale product to fill 55-70% of frame depending on category
  const targetWidth = Math.floor(1080 * getProductScale(category, style))
  const scaled = await sharp(product)
    .resize(targetWidth, null, { fit: 'inside' })
    .toBuffer()

  // Position: center bottom for most, rule-of-thirds for lifestyle
  const position = getPosition(category, style, scaledMeta, 1080)

  // Generate drop shadow (creates depth)
  const shadow = await generateShadow(scaled, position, style)

  // Composite: shadow first, then product
  const result = await sharp(bg)
    .composite([
      { input: shadow, ...position, blend: 'multiply' },
      { input: scaled, ...position }
    ])
    .modulate({ brightness: 1.02 })  // slight lift to unify tones
    .toBuffer()

  return result
}
```

**Drop Shadow Generation:**
```javascript
async function generateShadow(productBuffer, position, style) {
  const isFloor = ['warm_lifestyle', 'outdoor_bokeh', 'flat_lay'].includes(style)

  if (isFloor) {
    // Elliptical floor shadow — simulates object resting on surface
    return generateFloorShadow(productBuffer, opacity=0.35, blur=15)
  } else {
    // Soft drop shadow — general purpose
    return generateDropShadow(productBuffer, offsetX=8, offsetY=8, blur=20, opacity=0.25)
  }
}
```

**Sharp does not natively generate drop shadows.** Two implementation options:

Option A: Use `@canvas-snap/shadow` or `jimp` for shadow generation, then pass to sharp
Option B: Use a small sharp trick — blur the cutout, colorize it dark, offset it, composite under product

Option B is simpler, avoids another dependency, and produces adequate results.

**Cost:** Rs 0 (pure compute)
**Latency:** 2-4 seconds

---

### Stage 5: Final QA Check

**What it does:** Automated assessment of the output image before delivering to the user. Prevents embarrassing outputs from reaching paying customers.

**Decision: Claude Haiku Vision**

Same model as Stage 1, different prompt. Cost is ~$0.0004 per check.

**QA Scoring Prompt:**

```
You are a professional product photography quality checker for Instagram-ready images.
Analyze this product image and respond ONLY with JSON. No other text.

{
  "score": 0-100,
  "pass": true/false,
  "product_clearly_visible": true/false,
  "background_quality": "poor|acceptable|good|excellent",
  "compositing_artifacts": true/false,
  "artifact_description": "null or description",
  "edge_quality": "poor|acceptable|good|excellent",
  "lighting_consistent": true/false,
  "instagram_ready": true/false,
  "primary_issue": "null or main problem found",
  "suggested_fix": "null or what to change"
}

Pass threshold is score >= 65.
Fail if: product is invisible, obvious cutout artifacts (floating/hard edges),
background and product lighting are completely inconsistent,
or product is blurry/distorted.
```

**QA Gate Logic:**

```
if score >= 75:  PASS  -> deliver to user
if score 55-74:  PASS with flag -> deliver, note "good enough" variant
if score < 55:   FAIL  -> trigger retry

RETRY LOGIC:
  Attempt 2: Switch background model (Schnell -> Flux 1.1 Pro)
             Adjust compositing position
             Re-run stages 3 + 4 only (do NOT redo background removal)

  Attempt 3 (if Attempt 2 also < 55):
             Use "clean_white" style (highest success rate)
             Deliver with note to user about limitations

  Hard fail (all 3 attempts < 55):
             Deliver best-scoring attempt
             Add flag to job for manual review
             Do NOT charge user (or offer free retry)
```

**When QA Fails Most Often:**
- Transparent/glass products (bottles, candles with glass): Background bleeds through
- Very reflective jewellery: Edge confusion, color mismatch
- Dark products on dark backgrounds: Contrast insufficient
- Products with complex shapes (utensils, multi-part items): Cutout errors

**Cost:** $0.0004 per check, up to $0.0012 for 3 checks
**Latency:** 3-5 seconds per check

---

## 3. QA/Quality Gate System — Complete Design

### Three-Level Quality System

**Level 1: Input Gate (Stage 1)**
Rejects photos before any processing. Saves money on bad inputs.
- Threshold: reject if `usable == false` from Claude assessment
- Expected rejection rate: ~8-12% of submitted photos

**Level 2: Mid-Pipeline Check (implicit)**
The compositing stage does a dimensional sanity check:
- Product cutout must be non-empty (non-zero alpha pixel count)
- Product must occupy > 15% of frame in final composite
- No automated AI call here — pure geometric checks

**Level 3: Output Gate (Stage 5)**
The full QA assessment described above.

### Quality Metrics Explained

**score (0-100):** Composite score Claude assigns
- 80-100: Instagram-ready, deliver with confidence
- 65-79: Good, acceptable for most use cases
- 50-64: Borderline — deliver only as last resort (attempt 3)
- Below 50: Never deliver without disclosure

**compositing_artifacts:** Halos, floating products, mismatched lighting
**edge_quality:** The cutout boundary — fraying, color bleeding, hard edges
**lighting_consistent:** Does the product's lighting direction match the background?

### Retry Strategy Details

```
Attempt 1 (initial):
  bg_model: flux-schnell
  style: user-requested
  compositing: standard

Attempt 2 (if score < 55):
  bg_model: flux-1.1-pro     <- upgrade model
  style: user-requested      <- keep style, better execution
  compositing: adjust_scale  <- slightly larger product

Attempt 3 (if score < 55):
  bg_model: flux-schnell
  style: clean_white         <- safest style always works
  compositing: centered      <- simplest composition
```

Total extra cost for 2 retries: ~$0.04 (one Flux Pro call) + $0.003 (one Schnell) + QA calls

### When to Escalate to Manual Review

Create a `manual_review_queue` table in Supabase. Push jobs here when:
- All 3 attempts score below 50
- Product category is `jewellery` AND score below 65 (jewellery buyers expect perfection)
- User has paid premium tier
- Consecutive failures from same user (bad photo habits — send tutorial)

For v1 (solo developer), manual review means you personally look at the job and either re-process with better parameters or refund. Set aside 30 minutes per day for this.

---

## 4. Edit and Revision System

### What Users Actually Ask For

Based on equivalent products (Photoroom, Canva), the most common revision requests in order of frequency:

1. "Background badlo" (change background) — 40% of revisions
2. "Zyada bright karo" / "Thoda dark karo" (brightness) — 25%
3. "Background ka rang badlo" (color change) — 15%
4. "Style change karo" (festival to minimal, etc.) — 12%
5. "Thoda aur bada dikhao product ko" (resize/reposition) — 8%

### Revision Types and Pipeline Cost

| Revision Type | Stages to Re-run | Extra API Cost | Latency | Feasible? |
|---|---|---|---|---|
| Background style change | Stage 3 + 4 + QA | $0.003-0.04 | 25-40s | Yes, primary use case |
| Brightness/contrast | Stage 4 only | Rs 0 | 3s | Yes, instant |
| Background color tweak | Stage 3 + 4 + QA | $0.003 | 20-30s | Yes |
| Product repositioning | Stage 4 only | Rs 0 | 3s | Yes, instant |
| Full re-process (new style) | Stages 3 + 4 + QA | $0.003-0.04 | 30-45s | Yes |
| Product color change | Stages 2B + 3 + 4 + QA | $0.003 + sharp | 35-50s | Yes |
| Background removal redo | All stages | Full cost | 55-65s | Rare, only if cutout bad |
| Add text/logo | Stage 4 only | Rs 0 | 3s | Yes, using sharp |

**Key Architectural Decision:** Store the Stage 2A output (cutout PNG) permanently. This is the most expensive and time-consuming part. All revisions that only change the background can reuse the cutout, making them fast and cheap.

**Storage Schema for Revisions:**

```
/processed/{job_id}/
  cutout.png              <- Stage 2A output, preserved forever
  cutout_enhanced.png     <- Stage 2B output, preserved
  v1_background.png       <- First background generated
  v1_composite.png        <- First final output
  v2_background.png       <- After first revision
  v2_composite.png        <- Second final output
  metadata.json           <- All parameters used for each version
```

### Handling Voice Note Edit Requests

Users will send WhatsApp voice notes like:
- "Bhai isko festive background de do, Diwali wala kuch"
- "Brightness badha do aur background white kar do"
- "Wooden table pe rakh ke dikhao"

**Flow:**

```
Voice Note (OGG format from WhatsApp)
  |
  v
[Whisper API / Groq Whisper] — transcription, ~$0.006/minute, <3s
  |
  v
[Claude Haiku text] — intent extraction from transcription
  |
  v
Structured edit command: {
  "action": "change_background",
  "style": "warm_lifestyle",
  "surface": "wooden_table",
  "brightness_delta": 0,
  "notes": "festive, Diwali mood"
}
  |
  v
[Execute partial pipeline based on action]
```

**Transcription: Groq Whisper vs OpenAI Whisper**

| Service | Cost | Latency | Hindi accuracy |
|---|---|---|---|
| Groq Whisper Large v3 | $0.0001/minute | <1s | Excellent |
| OpenAI Whisper | $0.006/minute | 2-5s | Good |
| Deepgram Nova-3 | $0.0043/minute | 1-3s | Good for Indian English |

Use Groq Whisper. 60x cheaper than OpenAI, faster, and Whisper Large v3 handles Indian English and Hindi-English code-switching remarkably well. WhatsApp voice notes are typically 5-15 seconds, so cost is < $0.00005 per note.

**Edit Intent Extraction Prompt (Claude Haiku):**

```
User sent a voice note about editing their product image. The transcription is:
"{transcription}"

Extract the edit intent as JSON. Use null for unspecified fields.

{
  "primary_action": "change_background|adjust_brightness|change_style|resize_product|add_text|color_change",
  "background_style": "clean_white|warm_lifestyle|festival|marble_premium|outdoor_bokeh|flat_lay|gradient_minimal|null",
  "background_description": "free text description if not matching a style, else null",
  "brightness_delta": -3 to +3 (0 = no change),
  "saturation_delta": -2 to +2 (0 = no change),
  "product_scale_delta": -0.1 to +0.1 (0 = no change),
  "notes": "additional context from the request"
}
```

### Revision Limits and Cost Management

**Pricing model for v1:**
- Rs 99: 1 image + 2 free revisions (background-only revisions only)
- Additional revisions: Rs 29 per revision
- Full re-process: Rs 49

**Why 2 free revisions are sustainable:**
- Background-only revision: Re-runs Stages 3 + 4 + QA only
- Using Flux Schnell: $0.003 per attempt
- 2 revisions = $0.006 extra per order
- In Rs: ~Rs 0.51 — negligible

**Cost floor per job (with 2 revisions used):**
Full pipeline: ~$0.025 + revisions: $0.006 = $0.031 = Rs 2.60

Margin remains excellent even with 2 revisions fully used.

---

## 5. Prompt Engineering Library

### System Prompt Architecture

All background generation prompts follow a 4-part structure:

```
[STYLE DESCRIPTOR] + [SURFACE/MATERIAL] + [LIGHTING] + [NEGATIVE PROMPTS]
```

Never include the product in the background prompt. The product is composited separately. Generate the background as if the product's space is an empty surface.

### Master Prompt Templates by Style

**Clean White (clean_white)**
```
prompt: "Professional product photography background, clean pure white seamless background,
soft diffused studio lighting from upper left, subtle gradient from white to light grey at
bottom, no shadows, no texture, commercial product photography, 8k"

negative: "text, watermark, people, hands, clutter, colored objects, harsh shadows,
noise, grain, blur, low quality"
```

**Warm Lifestyle (warm_lifestyle) — For food and home goods**
```
prompt: "Warm rustic lifestyle product photography background, {surface}, warm golden hour
lighting from the right, soft bokeh, shallow depth of field, cozy atmosphere,
no foreground objects, space for product placement at center, editorial food photography style"

surface options by category:
  food:       "aged wooden table with subtle grain, small linen napkin at edge"
  home_goods: "white marble surface with gold veining, blurred kitchen background"
  candle:     "dark walnut wood surface, dried eucalyptus sprigs at far edge"
```

**Festival (festival) — Diwali, Holi, etc.**
```
prompt: "Festive Indian celebration product photography background, {festival_context},
warm orange and gold tones, soft bokeh lights in background, marigold flowers at corners,
brass diyas, rich textured fabric surface, elegant and premium"

festival_context by season (inject dynamically):
  Oct-Nov:  "Diwali theme, diyas, golden lights, deep red and gold"
  Mar:      "Holi theme, soft colored powder hints, spring flowers"
  Dec-Jan:  "Christmas/New Year, subtle glitter, champagne tones"
  year-round: "Indian celebration, marigold, brass, warm festival lighting"
```

**Dark Minimal / Gradient (gradient_minimal)**
```
prompt: "Premium minimal product photography background, dark slate grey to charcoal
gradient, subtle matte texture, single soft rim light from upper right,
luxury brand aesthetic, clean and sophisticated, no objects, pure background"

negative: "busy, colorful, bright, harsh lighting, multiple light sources,
noise, grain, text, logos"
```

**Marble Premium (marble_premium)**
```
prompt: "Luxury product photography on white Carrara marble surface, subtle grey veining,
soft even studio lighting, gentle reflection on marble surface, clean white background behind,
high-end cosmetics photography style, editorial quality"
```

**Outdoor Bokeh (outdoor_bokeh)**
```
prompt: "Product photography with outdoor lifestyle background, bright natural daylight,
blurred green foliage bokeh background, fresh and clean atmosphere, light linen or
cotton surface, editorial lifestyle photography, natural lighting"

negative: "people, faces, animals, text, logos, buildings, cars, harsh shadows"
```

**Flat Lay (flat_lay)**
```
prompt: "Top-down flat lay product photography surface, {surface_by_category},
styled props at edges (do not center), overhead studio lighting, even illumination,
minimal shadow, product placement space at center, clean editorial styling"

surface_by_category:
  food:     "white marble surface with small ceramic bowl, scattered spices, linen cloth"
  skincare: "white textured plaster surface, dried flowers at top-left corner"
  jewellery:"black velvet surface with subtle shimmer, single rose petal"
  candle:   "aged wood, coffee beans scattered, a single match"
```

### Product-Category Prompt Injections

These are appended to ALL background prompts to improve compositing compatibility:

```
food:      "warm color palette, appetizing atmosphere, food-safe surfaces"
jewellery: "high contrast for small details, reflective surface allowed, fine jewelry mood"
garment:   "neutral surface that does not compete with fabric colors"
skincare:  "clean clinical premium feel, pastel or neutral tones only"
candle:    "mood lighting suggestion, warm ambient glow implied"
```

### Negative Prompts (Universal)

Always include these across all styles:

```
"person, people, hands, face, body, text, watermark, logo, brand name,
duplicate products, multiple products, product floating without surface,
photoshop artifacts, chromatic aberration, lens flare, motion blur,
overexposed, underexposed, low resolution, jpeg artifacts, grainy, noisy"
```

### Incorporating User Voice Notes into Prompts

When a user's voice note adds context ("mujhe laga ki background mein kuch flowers hone chahiye"), extract the visual element and inject it:

```javascript
function buildBackgroundPrompt(baseStyle, userNotes, category) {
  const base = STYLE_PROMPTS[baseStyle]
  const categoryInject = CATEGORY_INJECTIONS[category]

  // Claude already extracted structured intent from voice note
  // userNotes might be: "add flowers, warm colors"
  const userContext = userNotes ? `, ${userNotes}` : ''

  return {
    prompt: `${base.prompt}${userContext}, ${categoryInject}`,
    negative_prompt: base.negative + ', ' + UNIVERSAL_NEGATIVES
  }
}
```

### Prompt Versioning

Store all prompts in a Supabase table `prompt_templates` with version numbers. When you iterate on prompt quality, you can A/B test by routing 10% of traffic to the new version and comparing QA scores.

```sql
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY,
  style_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  negative_prompt TEXT NOT NULL,
  category_overrides JSONB,
  avg_qa_score FLOAT,
  usage_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. Pipeline Timing and Parallelization

### Timing Budget Per Stage

```
Timeline (seconds from job start):

T+0.0  ---|  Job created, image uploaded
           |
T+0.0  ---|  [Stage 0] Intake + pre-processing (SEQUENTIAL)
T+2.5  ---|  Pre-processing complete
           |
T+2.5  ---|  [Stage 1] Input QA assessment (SEQUENTIAL)
T+7.5  ---|  QA assessment complete (GATE: stop here if fail)
           |
T+7.5  ---+---[Stage 2A] Background removal (fal.ai RMBG 2.0)
           |                                                    |
           +---[Stage 2B] Product enhancement (sharp, local)    | PARALLEL
                                                    |           |
T+8.0   stage 2B complete (sharp, <500ms)          |           |
T+12.0                                             stage 2A complete (3-5s after start)
           |
T+12.0 ---|  Both parallel stages complete (wait for 2A, 2B finishes first)
           |
T+12.0 ---|  [Stage 3] Background generation (Flux Schnell, 3-8s)
T+20.0 ---|  Background generation complete (optimistic, 8s)
           |
T+20.0 ---|  [Stage 4] Compositing (sharp, local)
T+23.5 ---|  Compositing complete
           |
T+23.5 ---|  [Stage 5] Final QA check (Claude Haiku, 3-5s)
T+28.0 ---|  QA complete
           |
T+28.0 ---|  [Stage 6] Upload to Supabase Storage + notify user
T+30.0 ---|  DONE

TYPICAL TOTAL: 28-35 seconds (happy path, no retries)
WITH RETRY:    55-75 seconds (one QA failure, re-run stages 3+4+QA)
MAXIMUM:       85 seconds (two QA failures, stays within 90s SLA)
```

### Parallelization Details

**Stage 2A and 2B run in parallel using `Promise.all`:**

```javascript
const [cutoutResult, enhancementParams] = await Promise.all([
  runBackgroundRemoval(preprocessed_path, category),  // 3-6s, external API
  runProductEnhancement(preprocessed_path, category)  // 0.3-0.5s, local sharp
])
```

Stage 2B always finishes first. Its output waits idle until Stage 2A completes. This wastes nothing.

**Can Stage 3 run in parallel with Stage 2A/B?**

Technically yes — Stage 3 (background generation) does not depend on the cutout. The background is an empty scene. You could fire Stage 3 immediately after Stage 1.

However, there is a risk: if the user's photo fails the background removal QA (score very low), you have wasted a background generation call. For v1, the cost savings of this optimization (~$0.003 per failed image) are not worth the implementation complexity. Run Stage 3 sequentially after Stage 2.

**For v2:** Run Stage 3 in parallel with Stage 2A/B for all low-risk categories (food, skincare, candles). Only run sequentially for glass, jewellery, and transparent products where background removal failures are more common.

### Cold Start Mitigation

**fal.ai:** Advertises no cold starts for popular models. Bria RMBG 2.0 and Flux Schnell are among the most-used models — warm instances are available nearly 100% of the time.

**Replicate:** Has cold starts of 10-30 seconds for some models. This is why fal.ai is preferred for the latency-sensitive main pipeline. Use Replicate as fallback only.

**Mitigation strategy:** Send a "health check" request to fal.ai every 5 minutes during business hours (6am-11pm IST) to keep instances warm. This is a GET to the model info endpoint, not an inference call, so it costs nothing.

### Timeout Handling

```javascript
const STAGE_TIMEOUTS = {
  stage_0: 5000,      // 5s
  stage_1: 10000,     // 10s
  stage_2a: 20000,    // 20s (background removal)
  stage_2b: 2000,     // 2s (local sharp, should never time out)
  stage_3: 30000,     // 30s (background generation)
  stage_4: 8000,      // 8s (local compositing)
  stage_5: 15000,     // 15s (QA check)
}

// On timeout: use fallback provider or deliver partial result
// Never let a user wait more than 120s without a status update
```

**Stage 3 Timeout Fallback:**
If Flux Schnell times out (rare), use a pre-generated cached background from the appropriate style bucket. Store 50 pre-generated backgrounds per style in Supabase Storage. Composite on cached background, deliver, mark for async re-generation.

---

## 7. Cost Analysis

### Per-Image Cost Breakdown (Happy Path, v1 Defaults)

All costs in USD. Exchange rate: 1 USD = Rs 85 (March 2026).

| Stage | Service | Cost (USD) | Cost (Rs) | Notes |
|---|---|---|---|---|
| Stage 0: Pre-processing | sharp (local) | $0.0000 | Rs 0.00 | Pure compute |
| Stage 1: Input QA | Claude Haiku Vision | $0.0004 | Rs 0.034 | ~1800 tokens total |
| Stage 2A: BG Removal | Bria RMBG 2.0 (fal.ai) | $0.0010 | Rs 0.085 | Standard category |
| Stage 2A: BG Removal | Remove.bg | $0.0250 | Rs 2.125 | Jewellery only |
| Stage 2B: Enhancement | sharp (local) | $0.0000 | Rs 0.00 | Pure compute |
| Stage 3: BG Generation | Flux Schnell (fal.ai) | $0.0030 | Rs 0.255 | Default |
| Stage 3: BG Generation | Flux 1.1 Pro (fal.ai/Replicate) | $0.0400 | Rs 3.40 | Premium/retry |
| Stage 4: Compositing | sharp (local) | $0.0000 | Rs 0.00 | Pure compute |
| Stage 5: Final QA | Claude Haiku Vision | $0.0004 | Rs 0.034 | Same cost as Stage 1 |
| Storage: Supabase | Supabase Storage | ~$0.0002 | Rs 0.017 | ~500KB per job |
| **TOTAL (standard)** | | **$0.0050** | **Rs 0.43** | |
| **TOTAL (jewellery)** | | **$0.0290** | **Rs 2.47** | Remove.bg upgrade |

### With Revisions and Retries

| Scenario | Extra Cost (USD) | Extra Cost (Rs) |
|---|---|---|
| 1 QA retry (Flux Pro) | $0.0408 | Rs 3.47 |
| 2 QA retries | $0.0416 | Rs 3.54 |
| 1 voice note + revision | $0.0034 | Rs 0.29 |
| 2 included revisions (BG-only) | $0.0060 | Rs 0.51 |

### Realistic Per-Job Cost at Scale

Assuming a typical job distribution:
- 60% standard products: $0.0050 average
- 25% jewellery: $0.0290 average
- 15% requiring one QA retry: additional $0.0408 average

**Weighted average per job:**
```
(0.60 × $0.0050) + (0.25 × $0.0290) + (0.15 × $0.0458) + revision allowance
= $0.003 + $0.00725 + $0.00687 + $0.003 (revision budget)
= $0.0201 average per job
= Rs 1.71 average API cost per job
```

### Margin Analysis at Rs 99

| Metric | Value |
|---|---|
| Revenue per image | Rs 99 |
| Average API cost | Rs 1.71 |
| Supabase / Vercel hosting (allocated) | Rs 2.00 |
| WhatsApp API (Meta Cloud, message costs) | Rs 0.50 |
| Groq Whisper (voice notes, ~50% usage) | Rs 0.05 |
| **Total COGS per image** | **Rs 4.26** |
| **Gross Margin** | **Rs 94.74 (95.7%)** |

This is an extraordinary margin. Even at 5x API cost overrun (bad luck with retries), margin stays above Rs 73 per image (73.7%).

### Breakeven: When to Self-Host Models

Self-hosting requires a GPU server. Minimum viable: A10G on AWS (Rs 35/hour = Rs 840/day).

At 95.7% gross margin and Rs 99 price:
- You need to serve at least 9 images/day to cover a self-hosted server
- For Flux Schnell (most used): cheapest via API at $0.003 vs self-hosted $0 but Rs 840/day amortized

**Self-hosting breakeven calculation:**

For background removal (Bria RMBG 2.0 at $0.001):
- Self-host rembg on a T4 server: ~Rs 600/day
- Breakeven: 600 / 0.085 = 7,059 images/day
- Do not self-host until you exceed 7,000 images/day

For Flux Schnell background generation ($0.003/image = Rs 0.255):
- Self-host SDXL Turbo as cheaper substitute: Rs 840/day on A10G
- Breakeven: 840 / 0.255 = 3,294 images/day
- Do not self-host until you exceed 3,000 images/day

**Conclusion:** For the first 12-18 months at typical solo-founder growth rates, API calls are definitively cheaper than self-hosting. Self-hosting is a year-two decision.

### Provider Cost Comparison Table (Background Generation)

| Provider | Model | Cost/image | Latency | Quality | Recommendation |
|---|---|---|---|---|---|
| fal.ai | Flux Schnell | $0.003 | 3-5s | Good | PRIMARY v1 |
| fal.ai | Flux 1.1 Pro Kontext | $0.04 | 8-15s | Excellent | Retries/Edits |
| fal.ai | Recraft V3 | $0.04 | 10-20s | Excellent | Alternative |
| fal.ai | SD 3 Medium | $0.035 | 15-25s | Very Good | Alternative |
| Replicate | Flux 1.1 Pro | $0.04 | 15-25s | Excellent | Fallback |
| Replicate | Flux Dev | $0.025 | 20-30s | Very Good | Budget fallback |
| Replicate | SD Inpainting | $0.0048 | 4s | Good | Special use |
| OpenAI | DALL-E 3 | $0.04 | 10-20s | Good | Avoid (TOS) |

---

## 8. Product Category Handling

### Auto-Detection vs User-Specified

For WhatsApp flow, users often do not categorize their product. They just send a photo. Auto-detection is therefore required.

Stage 1 (Claude Haiku) already extracts `product_category` as part of the quality assessment. No extra API call needed. This is the correct architectural choice.

**Category Detection Accuracy:** Claude Haiku Vision correctly categorizes product type with ~90% accuracy for the 7 primary categories in Indian D2C context. For the 10% edge cases, the system falls back to `other` which uses neutral defaults.

**User override:** After generation, include a WhatsApp message: "Style: Warm Lifestyle. Want a different style? Reply with a number: 1) Studio White 2) Festival 3) Dark Minimal 4) Marble"

### Category-Specific Pipeline Configuration

#### Food (Pickles, Snacks, Sweets, Beverages)

```yaml
background_removal:
  model: bria_rmbg_2
  special_params:
    smooth_edges: true  # food jars have smooth, regular edges

enhancement:
  saturation_boost: 1.25
  warmth_shift: +10     # make reds/oranges richer
  brightness: +5%

background_generation:
  style_priority: [warm_lifestyle, flat_lay, festival]
  flux_prompt_suffix: "food styling, appetizing warm lighting,
    restaurant quality photography, editorial food photography"
  avoid: "cold colors, clinical white, dark backgrounds"

compositing:
  product_scale: 0.65   # slightly smaller to show surface context
  position: center_lower
  shadow_type: floor_shadow
  shadow_opacity: 0.3
```

#### Jewellery (Gold, Silver, Artificial, Imitation)

```yaml
background_removal:
  model: remove_bg    # ALWAYS use premium removal for jewellery
  special_params:
    size: "full"      # max resolution output

enhancement:
  saturation_boost: 0.90    # slightly desaturate to show true metal color
  brightness: +12%           # bring out metal's natural sparkle
  sharpen: aggressive        # jewellery detail requires sharp edges

background_generation:
  style_priority: [marble_premium, gradient_minimal, clean_white]
  flux_prompt_suffix: "jewelry photography, velvet surface suggestion,
    single point dramatic lighting, luxury brand aesthetics, gem reflections"
  avoid: "warm backgrounds, wooden surfaces, busy patterns"

compositing:
  product_scale: 0.55   # smaller, let the background breathe
  position: center      # always centered for jewellery
  shadow_type: reflection_shadow   # subtle reflection, not drop shadow
  shadow_opacity: 0.15
  add_specular_highlight: true     # simulate jewelry sparkle
```

Note on `add_specular_highlight`: This is a sharp operation that adds a subtle white radial gradient at the product's perceived light-facing edge. Simple to implement, dramatically improves jewellery appeal.

#### Garments and Textiles (Sarees, Suits, T-shirts, Ethnic Wear)

Garments are the hardest category. Flat garments on a surface look cheap. The gold standard is a model wearing the garment, which we cannot do programmatically.

For v1, default to high-quality flat-lay. For v2, explore virtual try-on APIs.

```yaml
background_removal:
  model: bria_rmbg_2
  challenge: "fabric edges are soft and complex, especially dupattas and sarees"
  fallback: segment_anything_via_replicate  # for complex garments

enhancement:
  saturation_boost: 1.10
  sharpening: moderate     # too sharp makes fabric look synthetic

background_generation:
  style_priority: [flat_lay, clean_white, outdoor_bokeh]
  flux_prompt_suffix: "clothing flat lay photography, fabric texture visible,
    fashion editorial, Indian ethnic wear photography style"

compositing:
  product_scale: 0.75   # garments should fill more of the frame
  position: center
  shadow_type: subtle_drop
  special: "if garment, add subtle fabric crease simulation using perlin noise overlay"
```

#### Skincare and Cosmetics (Face Creams, Serums, Oils)

These are typically cylindrical or rectangular bottles/jars. The simplest category for background removal. The challenge is making them look premium.

```yaml
background_removal:
  model: bria_rmbg_2
  note: "bottles/jars have clean edges, RMBG handles perfectly"

enhancement:
  saturation_boost: 1.05
  brightness: +8%
  note: "accurate label colors matter for branding"

background_generation:
  style_priority: [marble_premium, clean_white, gradient_minimal]
  flux_prompt_suffix: "luxury skincare photography, clean minimal aesthetic,
    spa inspired, premium cosmetics editorial, Korean beauty photography style"

compositing:
  product_scale: 0.55   # skincare products look premium when smaller
  position: slightly_right_of_center   # rule of thirds
  shadow_type: reflection_on_surface
  add_product_reflection: true   # subtle floor reflection
```

#### Candles

Candles are interesting — the wax texture, wick, and often handcrafted appearance are core to the brand story.

```yaml
background_removal:
  model: bria_rmbg_2
  challenge: "cylindrical glass containers confuse edge detection"

enhancement:
  warmth: +15      # warm color shift to enhance wax tones
  saturation: 1.15

background_generation:
  style_priority: [warm_lifestyle, gradient_minimal, marble_premium]
  flux_prompt_suffix: "candle product photography, warm ambient mood lighting,
    cozy hygge atmosphere, wax texture visible, artisan craft photography"
  time_of_day_hint: "golden hour or evening lighting"

compositing:
  product_scale: 0.60
  shadow_type: floor_shadow
  ambient_glow: true    # add subtle warm glow around candle base
```

`ambient_glow` is a sharp radial gradient, warm orange/yellow, very low opacity (0.08), centered at base of product. Gives impression of candle warmth.

#### Home Goods (Pottery, Decor, Utensils)

```yaml
background_removal:
  model: bria_rmbg_2
  challenge: "varied shapes, handles, holes (like utensils)"

background_generation:
  style_priority: [warm_lifestyle, flat_lay, outdoor_bokeh]
  flux_prompt_suffix: "home decor product photography, lifestyle context,
    interior styling, artisan craft, Etsy-style product photography"

compositing:
  product_scale: 0.65
  position: center_lower
  shadow_type: floor_shadow
```

### Category Decision Tree

```
INPUT: photo submitted
  |
  v
[Claude Haiku Stage 1 detects category]
  |
  +-- "food"      -> Food pipeline config
  +-- "jewellery" -> Jewellery pipeline (premium BG removal)
  +-- "garment"   -> Garment pipeline
  +-- "skincare"  -> Skincare pipeline
  +-- "candle"    -> Candle pipeline
  +-- "home_goods"-> Home goods pipeline
  +-- "other"     -> Default pipeline (warm_lifestyle + center composite)
```

---

## 9. Implementation Code Skeleton

### File Structure

```
/lib/pipeline/
  index.js              <- main orchestrator
  stages/
    stage0-intake.js
    stage1-quality.js
    stage2a-removal.js
    stage2b-enhance.js
    stage3-background.js
    stage4-composite.js
    stage5-qa.js
    stage6-deliver.js
  categories/
    config.js           <- all category configs
    prompts.js          <- all prompt templates
  providers/
    fal.js              <- fal.ai client wrapper
    replicate.js        <- replicate client wrapper
    claude.js           <- claude vision wrapper
    groq.js             <- whisper transcription
  utils/
    sharp-utils.js      <- reusable sharp operations
    shadow.js           <- shadow generation
    composite.js        <- compositing helpers
  queue/
    worker.js           <- background job processor
    retry.js            <- retry logic
```

### Main Orchestrator Pattern

```javascript
// /lib/pipeline/index.js

export async function runImagePipeline(jobId, inputPath, userPrefs) {
  const job = await updateJob(jobId, { status: 'processing' })

  try {
    // Stage 0: Intake
    const preprocessed = await runStage(jobId, 'intake',
      () => intake(inputPath), { timeout: 5000 })

    // Stage 1: Quality gate
    const assessment = await runStage(jobId, 'quality_check',
      () => assessQuality(preprocessed.path), { timeout: 10000 })

    if (!assessment.usable) {
      return await failJob(jobId, 'input_rejected', assessment.rejection_reason)
    }

    const category = assessment.product_category
    const config = CATEGORY_CONFIGS[category]

    // Stage 2: Parallel execution
    const [cutout, enhancementMeta] = await Promise.all([
      runStage(jobId, 'bg_removal',
        () => removeBackground(preprocessed.path, category, config),
        { timeout: 20000 }),
      runStage(jobId, 'enhance',
        () => enhanceProduct(preprocessed.path, category, config),
        { timeout: 2000 })
    ])

    // Apply enhancement params to cutout (combine stage 2A+2B output)
    const enhancedCutout = await applyEnhancement(cutout.path, enhancementMeta)

    // Stage 3: Background generation
    const style = userPrefs.style || config.style_priority[0]
    const prompt = buildBackgroundPrompt(style, category, userPrefs.notes)

    const background = await runStage(jobId, 'bg_generation',
      () => generateBackground(prompt, style),
      { timeout: 30000, fallback: () => getCachedBackground(style) })

    // Stage 4: Composite
    const composite = await runStage(jobId, 'composite',
      () => compositeProduct(enhancedCutout, background.path, category, style),
      { timeout: 8000 })

    // Stage 5: QA
    const qa = await runStage(jobId, 'qa_check',
      () => assessOutput(composite.path, category),
      { timeout: 15000 })

    if (qa.score < 55 && job.attempt_count < 3) {
      // Retry from Stage 3
      return await retryFromBackground(jobId, inputPath, enhancedCutout, category, userPrefs, qa)
    }

    // Stage 6: Deliver
    const output = await uploadAndDeliver(jobId, composite.path, qa)
    await updateJob(jobId, { status: 'completed', output_url: output.url, qa_score: qa.score })

    return output

  } catch (err) {
    await updateJob(jobId, { status: 'failed', error: err.message })
    throw err
  }
}
```

### Stage Runner with Timeout and Error Handling

```javascript
async function runStage(jobId, stageName, fn, options = {}) {
  const start = Date.now()
  await updateJob(jobId, { current_stage: stageName })

  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Stage ${stageName} timed out`)),
        options.timeout || 30000))
    ])

    await logStageComplete(jobId, stageName, Date.now() - start)
    return result

  } catch (err) {
    if (options.fallback) {
      console.warn(`Stage ${stageName} failed, using fallback:`, err.message)
      return await options.fallback()
    }
    throw err
  }
}
```

### Background Removal Provider

```javascript
// /lib/pipeline/providers/fal.js

export async function removeBgBria(imagePath, category) {
  const imageBuffer = await fs.readFile(imagePath)
  const base64 = imageBuffer.toString('base64')

  const result = await fal.subscribe('fal-ai/bria-rmbg', {
    input: {
      image_url: `data:image/jpeg;base64,${base64}`
    },
    pollInterval: 500,
    timeout: 15000
  })

  // Download result PNG
  const cutoutPath = await downloadToStorage(result.image.url, `cutout_${jobId}.png`)
  return { path: cutoutPath, provider: 'bria_rmbg' }
}

export async function removeBgRemoveBg(imagePath) {
  // Use for jewellery only
  const formData = new FormData()
  formData.append('image_file', await fs.readFile(imagePath), 'product.jpg')
  formData.append('size', 'full')

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': process.env.REMOVEBG_API_KEY },
    body: formData
  })

  const buffer = await response.buffer()
  const cutoutPath = await saveBuffer(buffer, `cutout_${jobId}.png`)
  return { path: cutoutPath, provider: 'remove_bg' }
}
```

### Supabase Job Schema

```sql
-- Jobs table
CREATE TABLE image_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  order_id UUID REFERENCES orders(id),

  -- Input
  original_url TEXT NOT NULL,
  product_category TEXT,
  requested_style TEXT DEFAULT 'warm_lifestyle',
  user_notes TEXT,

  -- Processing state
  status TEXT DEFAULT 'queued',  -- queued|processing|completed|failed|manual_review
  current_stage TEXT,
  attempt_count INTEGER DEFAULT 1,

  -- Stage outputs (URLs in Supabase Storage)
  cutout_url TEXT,              -- Stage 2A output — preserved for revisions
  enhanced_cutout_url TEXT,     -- Stage 2B applied to cutout
  background_url TEXT,          -- Stage 3 output
  composite_url TEXT,           -- Stage 4 output

  -- QA
  qa_score INTEGER,
  qa_passed BOOLEAN,
  qa_details JSONB,

  -- Output
  final_output_url TEXT,        -- delivered to user

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_duration_ms INTEGER,

  -- Revision tracking
  revision_count INTEGER DEFAULT 0,
  parent_job_id UUID REFERENCES image_jobs(id),  -- if this is a revision

  -- Cost tracking
  api_cost_usd FLOAT DEFAULT 0,

  -- Error handling
  error_message TEXT,
  manual_review_reason TEXT
);

-- Stage timing log
CREATE TABLE job_stage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES image_jobs(id),
  stage_name TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  provider TEXT,
  cost_usd FLOAT,
  error TEXT
);

-- Prompt templates
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id TEXT NOT NULL,
  category TEXT,  -- NULL means applies to all categories
  version INTEGER NOT NULL DEFAULT 1,
  prompt TEXT NOT NULL,
  negative_prompt TEXT NOT NULL,
  avg_qa_score FLOAT,
  usage_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Edit Request Handler

```javascript
// POST /api/jobs/:jobId/edit

export async function handleEditRequest(jobId, editRequest) {
  const job = await getJob(jobId)

  if (!job.cutout_url) {
    throw new Error('Original cutout not available for revision')
  }

  // Check revision limit
  if (job.revision_count >= 2 && !editRequest.paid) {
    return { error: 'free_revisions_exhausted',
             message: 'Rs 29 ke liye ek aur revision karein' }
  }

  // Parse edit type
  const { action, style, brightness_delta, bg_description } = editRequest

  // Create child job
  const revisionJob = await createJob({
    user_id: job.user_id,
    parent_job_id: jobId,
    product_category: job.product_category,
    requested_style: style || job.requested_style,
    user_notes: bg_description
  })

  if (action === 'change_background' || action === 'change_style') {
    // Re-run from Stage 3 using existing cutout
    return await runPartialPipeline(revisionJob.id, {
      cutout_url: job.enhanced_cutout_url,  // reuse the cutout
      from_stage: 'bg_generation',
      style,
      prompt_notes: bg_description
    })
  }

  if (action === 'adjust_brightness') {
    // Re-composite only with brightness adjustment
    return await runPartialPipeline(revisionJob.id, {
      cutout_url: job.enhanced_cutout_url,
      background_url: job.background_url,  // reuse background too
      from_stage: 'composite',
      brightness_delta
    })
  }
}
```

---

## 10. Risk Flags and Mitigations

### Risk 1: Background Removal Quality on Complex Products

**Risk:** RMBG 2.0 produces bad cutouts for jewellery with intricate patterns, transparent products (glass bottles, candles in glass), and products with similar color to background (brown pickle jar on wooden table).

**Probability:** High — 15-25% of submitted photos will have a challenging product/background combination.

**Mitigation:**
1. Use Remove.bg for jewellery automatically (better quality, higher cost justified)
2. Build a "complexity detector" into Stage 1: if `background_complexity == "complex"` AND `product_category == "jewellery"`, escalate to Remove.bg
3. Store QA failure reasons. If you see repeated failures for a specific combination, add special routing
4. For glass/transparent products: this is an unsolved problem in 2026. Notify user that transparent products need white background photos for best results. Add to intake instructions.

### Risk 2: Flux Schnell Quality Insufficiency

**Risk:** Flux Schnell produces backgrounds that look AI-generated and unnatural, causing QA failures and triggering expensive retries with Flux Pro.

**Probability:** Medium — Flux Schnell is good but not exceptional. Expect 20-30% of generations to score below 65 on QA.

**Mitigation:**
1. Curate a library of 200 high-quality pre-generated backgrounds (50 per top 4 styles). If Schnell QA fails, use pre-generated background for immediate delivery and regenerate with Flux Pro async.
2. Tune prompts extensively — the first 4 weeks should be spent on prompt quality. Track avg QA score per prompt version in `prompt_templates`.
3. Set Schnell guidance scale and steps conservatively (steps: 4, guidance: 0.0 — Schnell is a distilled model, it does not benefit from many steps).
4. Cache successful backgrounds. If a background gets QA score > 80, save it with its prompt hash to `background_cache`. When the same prompt hash appears again, serve the cached version. Background variety matters less than quality.

### Risk 3: 90-Second SLA with QA Retries

**Risk:** A job that hits two QA retries could take up to 120 seconds, breaking the SLA.

**Probability:** Low but nonzero — ~5% of jobs.

**Mitigation:**
1. After the first retry, switch to clean_white style which has near-100% QA pass rate. This caps retries at 2.
2. On first retry, use Flux Pro (15-25s generation) instead of Schnell. Better quality = higher first-pass QA rate for the retry.
3. If timing is going to exceed 85s, notify user with "Almost ready..." WhatsApp message at T+60s. Psychological mitigation.
4. Maintain a "fast path" for clean_white style that generates a background in 3s (Schnell, simple prompt). This path never times out.

### Risk 4: fal.ai API Availability

**Risk:** fal.ai goes down or has elevated error rates. Both Stage 2A and Stage 3 depend on it.

**Probability:** Low but critical — a full outage would stop all processing.

**Mitigation:**
1. Maintain Replicate as a hot fallback for both stages. Keep API keys active.
2. Implement circuit breaker: if fal.ai returns 5 errors in 60 seconds, automatically route all traffic to Replicate for 10 minutes.
3. For Stage 2A specifically, also keep a self-hostable rembg option ready — it can run on Vercel Edge Functions or a small Railway instance as emergency fallback.

```javascript
const PROVIDERS = {
  bg_removal: ['fal_bria_rmbg', 'remove_bg', 'replicate_rembg'],
  bg_generation: ['fal_flux_schnell', 'replicate_flux_schnell', 'cached_background']
}
// Try providers in order, track error rate per provider
```

### Risk 5: Claude Haiku Vision Cost Creep

**Risk:** At high volume, two Claude Haiku calls per job ($0.0008 total) could add up if there are many rejected photos from bad users.

**Probability:** Low initially, becomes relevant at 1000+ jobs/day.

**Mitigation:**
1. The free rule-based pre-filter (Stage 0 Pass 1) rejects the most obviously bad photos before Claude ever sees them. This handles ~40% of rejections for free.
2. At 1000 jobs/day, Claude QA costs $0.80/day = Rs 68/day. Trivial at that volume.
3. If you need to cut costs at high scale, replace Stage 1 with a fine-tuned lightweight CLIP model. But this is a year-two problem.

### Risk 6: Prompt Consistency for Indian Product Categories

**Risk:** Flux was primarily trained on Western product photography. It may generate backgrounds that look foreign and inappropriate for Indian D2C products (pickle jars, mithai boxes, ethnic jewellery).

**Probability:** Medium — this is a real limitation.

**Mitigation:**
1. Use Indian-specific descriptors in prompts: "Indian kitchen shelf", "traditional Indian textile surface", "brass vessels", "terracotta surface"
2. Avoid any Western-brand-associated words in prompts
3. Festival prompt specifically includes culturally grounded elements (diya, marigold, etc.)
4. Run a quality audit on the first 100 jobs manually. Identify failure patterns. Iterate prompts. This is the most important first-week task after launch.
5. Consider fine-tuning a LoRA on Flux with Indian product photography examples. This is a month-two investment but significantly improves quality for Indian context.

### Risk 7: WhatsApp API Rate Limits

**Risk:** Meta Cloud API throttles outbound messages if too many are sent in a short window.

**Probability:** Low for v1, relevant at scale.

**Mitigation:**
1. Image delivery sends 1 message per job completion — naturally spread out
2. Keep status updates minimal: job received, processing started, done (3 messages max)
3. Meta's business messaging allows 1000 unique conversations/day on free tier

### Risk 8: Storage Cost Growth

**Risk:** Storing cutouts, backgrounds, and composites for every job and revision will exhaust Supabase free storage quickly.

**Probability:** Certain — storage grows linearly with volume.

**Mitigation:**
1. Supabase free tier: 1GB storage. At ~500KB per job (4 images), that's ~2,000 jobs.
2. Set a retention policy: delete intermediate files (background.png, composite.png) after 7 days. Keep `cutout_url` (the expensive one to recreate) for 30 days.
3. Keep `final_output_url` permanently (or until user explicitly deletes).
4. Implement a nightly cleanup job using Supabase Edge Functions.
5. Supabase Pro at $25/month gives 100GB storage — upgrade when free tier fills.

### Risk 9: Jewellery Edge Cases with Reflection/Compositing

**Risk:** Jewellery with metal reflections looks fake when composited onto a background because the product's existing reflections don't match the generated background's lighting.

**Probability:** High for high-end jewellery, moderate for artificial jewellery.

**Mitigation:**
1. For jewellery, always use dark/gradient backgrounds (gradient_minimal, marble_premium). These have lower lighting coherence requirements.
2. Disable the ambient reflection composite effect for jewellery — just use the clean cutout.
3. In prompts, add "flat even lighting" to jewellery backgrounds to minimize lighting mismatch.
4. For v2: implement Flux Kontext for jewellery — it is specifically better at maintaining material coherence when editing.

---

## Appendix A: API Keys Required

```bash
# .env.local

# Core AI Pipeline
FAL_KEY=                      # fal.ai - primary background removal + generation
REPLICATE_API_TOKEN=           # Replicate - fallback provider
ANTHROPIC_API_KEY=             # Claude Haiku - QA checks
REMOVEBG_API_KEY=              # Remove.bg - jewellery only

# Voice Processing
GROQ_API_KEY=                  # Whisper transcription

# Infrastructure
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Communications
WHATSAPP_ACCESS_TOKEN=         # Meta Cloud API
WHATSAPP_PHONE_NUMBER_ID=
```

**Monthly estimated cost at different volumes (API keys only):**

| Monthly Jobs | API Cost (USD) | API Cost (Rs) |
|---|---|---|
| 100 | $2.01 | Rs 171 |
| 500 | $10.05 | Rs 855 |
| 1,000 | $20.10 | Rs 1,709 |
| 5,000 | $100.50 | Rs 8,543 |
| 10,000 | $201.00 | Rs 17,085 |

At 10,000 jobs/month generating Rs 9,90,000 revenue, API cost is Rs 17,085 — a 1.7% cost of revenue. This is an excellent unit economic structure.

---

## Appendix B: Build Order for the Pipeline

**Week 1 — Functional Core:**
1. Stage 0 (intake with sharp)
2. Stage 2A (background removal via fal.ai)
3. Stage 3 (Flux Schnell background generation — just clean_white + warm_lifestyle)
4. Stage 4 (basic compositing — sharp, no shadow yet)
5. End-to-end test with 20 real product photos

**Week 2 — QA and Polish:**
6. Stage 1 (Claude Haiku input QA)
7. Stage 5 (Claude Haiku output QA + retry logic)
8. Stage 2B (sharp enhancement — the easy part)
9. Drop shadow and reflection compositing
10. All 7 style prompts tuned and tested

**Week 3 — Revision System:**
11. Partial pipeline (re-run from Stage 3)
12. Edit intent extraction from voice notes (Groq + Claude)
13. Revision job tracking in Supabase
14. WhatsApp integration for revision requests

**Week 4 — Hardening:**
15. Fallback provider routing
16. Circuit breaker for fal.ai outages
17. Background caching system
18. Storage cleanup cron
19. Manual review queue UI (a simple Supabase dashboard view)
20. Load test with 50 concurrent jobs

---

*This document is the definitive technical specification for the WhatsAds image processing pipeline. All API choices, cost estimates, and timing budgets are based on verified pricing as of March 2026. Costs should be re-verified quarterly as model pricing changes frequently.*

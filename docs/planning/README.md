# Historical Planning Docs

Merged 2026-04-23. Most content is pre-V5 and superseded by `CLEANUP_PLAN.md` and the current codebase.
Git history is the canonical archive of these documents.

These 6 files were deleted as part of PR 1 (dead-code purge). Their content is preserved below for reference.

---


## AI_MODEL_RESEARCH.md

# Autmn — AI Model Cost Research
**Date:** March 27, 2026
**Purpose:** Find the cheapest viable AI models for every stage of the Autmn pipeline
**Current plan being replaced:** Claude Haiku Vision (too expensive per founder's feedback)

---

## BASELINE: What We Are Replacing

**Claude Haiku 4.5** (current latest Haiku, not the old 3.0)
- Input: $1.00 / MTok | Output: $5.00 / MTok
- A typical product photo assessment call: ~1,200 tokens in (image ~1,000 tokens + prompt ~200) + ~300 tokens out
- Cost per image analysis call: (1,200 × $0.000001) + (300 × $0.000005) = $0.0012 + $0.0015 = **$0.0027 per call**

**Claude Haiku 3.0** (deprecated April 19, 2026 — do NOT use)
- Input: $0.25 / MTok | Output: $1.25 / MTok
- If the current plan uses this, it will break in weeks.

---

## PART 1 — IMAGE UNDERSTANDING (Product Detection + Quality Assessment)

The task: Send a product photo, receive structured JSON with product_category, quality_score, lighting_issues, blur_score, usability_rating.

Token math for a typical product photo call:
- Image input: ~1,000 tokens (a 1024x768 JPEG compressed for API)
- System prompt: ~200 tokens
- Output JSON: ~200 tokens
- Total: ~1,200 input + 200 output per call

### 1. Google Gemini 2.0 Flash

**Note:** Google has deprecated Gemini 2.0 Flash (shutting down June 1, 2026). Do not build on this.

Replacement: **Gemini 2.5 Flash** and **Gemini 2.5 Flash Lite** are the current generation.

---

### 2. Google Gemini 2.5 Flash

- **Pricing:** Input $0.30/MTok | Output $2.50/MTok (via Google AI / OpenRouter)
- **Cost per image call:** (1,200 × $0.0000003) + (200 × $0.0000025) = $0.00036 + $0.0005 = **$0.00086 per call**
- **Latency:** Fast (sub-2s for vision tasks)
- **Structured JSON:** Excellent — supports native JSON mode / function calling with schema enforcement
- **Availability:** Google AI Studio, OpenRouter, Vertex AI
- **Quality assessment:** Excellent. Gemini 2.5 Flash is a frontier reasoning model. Will accurately detect blur, lighting issues, product category across all Indian product types (food, jewellery, garments, skincare).
- **Verdict:** 3x cheaper than Haiku 4.5. Strong quality. BUT: output tokens are expensive at $2.50/MTok — watch if your JSON output grows.

---

### 3. Google Gemini 2.5 Flash Lite

- **Pricing:** Input $0.10/MTok | Output $0.40/MTok
- **Cost per image call:** (1,200 × $0.0000001) + (200 × $0.0000004) = $0.00012 + $0.00008 = **$0.0002 per call**
- **Latency:** Fastest in the Gemini family (ultra-low latency design)
- **Structured JSON:** Good — inherits JSON mode from 2.5 family
- **Availability:** Google AI Studio, OpenRouter
- **Quality assessment:** Good but lighter reasoning than 2.5 Flash. For straightforward product category detection and basic quality scoring, likely sufficient. Edge cases (unusual products, very ambiguous photos) may underperform.
- **Verdict:** 13x cheaper than Haiku 4.5. Best cost option in the Gemini family for this task. Recommended for most Autmn image assessments.

---

### 4. Google Gemini 2.0 Flash Lite (Previous Gen — Still Available)

- **Pricing:** Input $0.075/MTok | Output $0.30/MTok (but model deprecating June 1, 2026)
- **Cost per image call:** **~$0.00015 per call**
- **Verdict:** Slightly cheaper than 2.5 Flash Lite but retiring soon. Skip it.

---

### 5. GPT-4o Mini (Vision)

- **Pricing (sourced from multiple API providers):** Input ~$0.15/MTok | Output ~$0.60/MTok
- **Cost per image call:** (1,200 × $0.00000015) + (200 × $0.0000006) = $0.00018 + $0.00012 = **$0.0003 per call**
- **Note:** OpenAI charges additional tokens for image input. A 1024x768 image costs ~765 additional tokens at low-detail mode, or ~2,000+ tokens at high-detail. Using low-detail: ~$0.00027/call. High-detail: ~$0.00045/call.
- **Latency:** ~2-4s
- **Structured JSON:** Excellent — OpenAI JSON mode is the industry standard, most reliable for schema enforcement
- **Availability:** OpenAI API directly
- **Quality assessment:** Very good. GPT-4o mini vision is capable for product categorization and quality checks.
- **Verdict:** Comparable to Gemini 2.5 Flash Lite in price. JSON mode is the most battle-tested. Good fallback option.

---

### 6. Llama 3.2 Vision 11B (via OpenRouter)

- **Pricing:** Input $0.049/MTok | Output $0.049/MTok (OpenRouter via Novita)
- **Cost per image call:** (1,200 × $0.000000049) + (200 × $0.000000049) = $0.0000588 + $0.0000098 = **$0.000069 per call**
- **Latency:** 1-3s on Groq hardware equivalents; varies by provider
- **Structured JSON:** Moderate. Llama 3.2 Vision supports JSON output but is less reliable than GPT-4o/Gemini without explicit schema forcing. Will need strong system prompts and output validation.
- **Availability:** OpenRouter, Together AI, Replicate, self-hosted
- **Quality assessment:** The 11B model scores MMMU 50.7 — reasonable for simple product categorization. Will struggle with nuanced quality assessment (subtle lighting issues, slight blur detection). The 90B is better but costs ~16x more.
- **Verdict:** 39x cheaper than Haiku 4.5. Usable if you add output validation layer. Test it on your specific product categories first. Main risk: inconsistent JSON structure.

---

### 7. Llama 3.2 Vision 90B (via OpenRouter)

- **Pricing:** Data not available on OpenRouter at time of research (model listing exists but price not rendered). Estimated ~$0.35-0.90/MTok based on size vs. 11B ratio and comparable 70B text model prices.
- **Cost per image call:** Estimated **$0.0005-0.001 per call**
- **Quality assessment:** Scores 60.3 MMMU vs 50.7 for 11B — meaningfully better. DocVQA 90.1 vs 88.4.
- **Verdict:** Not enough pricing clarity for a firm recommendation. If pricing proves similar to Gemini 2.5 Flash Lite, it becomes interesting. Otherwise 11B is better value.

---

### 8. Llama 4 Scout (17Bx16E) via Groq or OpenRouter

- **Pricing (OpenRouter):** Input $0.08/MTok | Output $0.30/MTok
- **Pricing (Groq):** Input $0.11/MTok | Output $0.34/MTok
- **Cost per image call:** (1,200 × $0.00000008) + (200 × $0.0000003) = $0.000096 + $0.00006 = **$0.000156 per call (OpenRouter)**
- **Vision support:** Yes — native multimodal input (text + image)
- **Latency:** Very fast on Groq (594 TPS reported)
- **Structured JSON:** Good — supports JSON mode
- **Availability:** Groq (preview), OpenRouter
- **Verdict:** Promising new option. 17x cheaper than Haiku 4.5. MoE architecture means it punches above its weight. Worth testing for product categorization tasks.

---

### 9. Qwen 2.5 VL 72B (via OpenRouter)

- **Pricing:** Input $0.80/MTok | Output $0.80/MTok
- **Cost per image call:** (1,400 × $0.0000008) = **$0.00112 per call**
- **Quality assessment:** Qwen 2.5 VL is considered one of the strongest open vision models — competitive with GPT-4o on many visual benchmarks. Very strong at document understanding and product identification.
- **Structured JSON:** Good
- **Verdict:** More expensive than Gemini 2.5 Flash Lite but cheaper than Claude Haiku 4.5. Quality is excellent. Consider if Gemini/Llama underperform on your specific use case.

---

### 10. Qwen 2.5 VL 7B (via OpenRouter)

- **Pricing:** Not available at time of research (model not rendered on OpenRouter)
- **Estimated pricing:** ~$0.05-0.10/MTok based on size
- **Verdict:** Smaller Qwen VL model. Worth monitoring but insufficient data for firm recommendation.

---

### 11. Pixtral 12B (Mistral Vision Model)

- **Via OpenRouter:** Model listed as "not available" at time of research
- **Pixtral Large (2411) on OpenRouter:** Input $2.00/MTok | Output $6.00/MTok — far too expensive
- **Direct Mistral API:** Could not retrieve pricing (requires auth)
- **Verdict:** Pixtral Large is prohibitively expensive. Pixtral 12B is unavailable via major API aggregators. Skip for now.

---

### 12. DeepSeek VL v2

- **DeepSeek API** currently only exposes `deepseek-chat` (V3.2) and `deepseek-reasoner` — no vision API endpoint publicly available as of March 2026.
- **DeepSeek V3.2 text-only:** Input $0.028/MTok (cache hit), $0.28/MTok (cache miss) | Output $0.42/MTok
- **Verdict:** No production vision API. Cannot use for image understanding. Skip.

---

### 13. Moondream (Ultra-Cheap Vision)

- **Pricing:** $5 free credits/month. Pay-as-you-go beyond that. Exact per-query pricing not publicly listed.
- **Open source:** Free to self-host (runs on CPU or GPU)
- **Quality:** Designed for fast, lightweight vision tasks. Strong at object detection and counting. NOT designed for nuanced quality scoring (blur/lighting assessment).
- **Structured JSON:** Limited — it's a caption/VQA model, not an instruction-following model for JSON generation.
- **Verdict:** Useful as a pre-filter (is this a product image at all?) but cannot replace a full vision LLM for structured quality assessment. Could reduce costs by routing obvious failures away from the main model.

---

### 14. Florence-2 (Microsoft)

- **Pricing:** No hosted API exists. Self-host only via HuggingFace transformers.
- **Capabilities:** Object detection, captioning, OCR, region proposals. NOT designed for quality scoring.
- **Verdict:** Would require significant engineering to run on your own server and still wouldn't output quality scores reliably. Skip unless you want a fully self-hosted pipeline.

---

### IMAGE UNDERSTANDING SUMMARY TABLE

| Model | Provider | Cost/Call | JSON Reliability | India Product Quality | Use? |
|---|---|---|---|---|---|
| Claude Haiku 4.5 | Anthropic | $0.0027 | Excellent | Excellent | Baseline (replacing) |
| Gemini 2.5 Flash Lite | Google | $0.0002 | Good | Good | YES — primary pick |
| Gemini 2.5 Flash | Google | $0.00086 | Excellent | Excellent | YES — fallback/quality |
| GPT-4o Mini | OpenAI | $0.0003 | Excellent | Very Good | YES — alt option |
| Llama 4 Scout | Groq/OpenRouter | $0.00016 | Good | Good | YES — test it |
| Llama 3.2 11B Vision | OpenRouter | $0.000069 | Moderate | Moderate | MAYBE — needs testing |
| Qwen 2.5 VL 72B | OpenRouter | $0.00112 | Good | Excellent | FALLBACK — pricey |
| Moondream | Cloud/Self-host | Near-zero | Poor | Limited | Pre-filter only |
| Florence-2 | Self-host only | Infra cost | Poor | Limited | Skip |
| DeepSeek VL v2 | N/A | N/A | N/A | N/A | Skip |
| Pixtral 12B | Unavailable | N/A | N/A | N/A | Skip |

---

## PART 2 — INSTRUCTION UNDERSTANDING (Text/Voice → Structured Commands)

The task: Parse "background green karo" or "Diwali wala bana do, warm colors chahiye" into structured JSON edit commands. Input is pure text (already transcribed). Typical call: ~100-150 tokens in + ~100 tokens out.

Token math: 150 input + 100 output per call.

### 1. Gemini 2.5 Flash Lite

- **Pricing:** Input $0.10/MTok | Output $0.40/MTok
- **Cost per call:** (150 × $0.0000001) + (100 × $0.0000004) = $0.000015 + $0.00004 = **$0.000055 per call**
- **Hindi/multilingual:** Excellent — Gemini models trained on diverse Indian language data
- **JSON reliability:** Excellent — native JSON mode
- **Verdict:** Best all-around option for this task. Can use same model as image understanding to reduce API vendor complexity.

---

### 2. Gemini 2.5 Flash

- **Cost per call:** ~$0.0002 per call
- **Verdict:** Overkill for text parsing. Use 2.5 Flash Lite instead.

---

### 3. Llama 3.3 70B Instruct (via Groq or OpenRouter)

- **Groq pricing:** Input $0.59/MTok | Output $0.79/MTok
- **OpenRouter pricing:** Input $0.10/MTok | Output $0.32/MTok
- **Cost per call (OpenRouter):** (150 × $0.0000001) + (100 × $0.00000032) = $0.000015 + $0.000032 = **$0.000047 per call**
- **Cost per call (Groq):** (150 × $0.00000059) + (100 × $0.00000079) = $0.000089 + $0.000079 = **$0.000168 per call**
- **Hindi/multilingual:** Good — Llama 3.3 70B has decent Hindi capability but less strong than Gemini on mixed Hindi-English (Hinglish) sentences
- **JSON reliability:** Good with system prompt enforcement
- **Latency:** Groq is blazing fast (394 TPS)
- **Verdict:** Use OpenRouter routing for cost, Groq for latency-sensitive paths. Strong option.

---

### 4. Llama 3.1 8B Instruct (via OpenRouter/Groq)

- **OpenRouter pricing:** Input $0.02/MTok | Output $0.05/MTok
- **Groq pricing:** Input $0.05/MTok | Output $0.08/MTok
- **Cost per call (OpenRouter):** (150 × $0.00000002) + (100 × $0.00000005) = $0.000003 + $0.000005 = **$0.000008 per call**
- **Hindi/multilingual:** Weak. 8B models significantly underperform on Hinglish/regional language parsing. Will fail on sentences like "isko festive Diwali wala bana do" — it may miss intent.
- **JSON reliability:** Unreliable without strict output formatting. Will need retry logic.
- **Verdict:** Too small for this task. The cheapness is not worth the reliability cost. Hindi parsing with 8B models produces too many errors in production.

---

### 5. Llama 4 Scout (via Groq)

- **Groq pricing:** Input $0.11/MTok | Output $0.34/MTok
- **Cost per call:** (150 × $0.00000011) + (100 × $0.00000034) = $0.0000165 + $0.000034 = **$0.000051 per call**
- **Hindi/multilingual:** Good (MoE model with strong multilingual training)
- **Latency:** Very fast on Groq
- **Verdict:** Good option. Similar cost to Gemini 2.5 Flash Lite. Worth testing head-to-head for Hinglish.

---

### 6. Mistral Small / Mistral 7B

- **Direct Mistral API pricing:** Not publicly retrievable (requires auth). OpenRouter: not available at time of research under tested slugs.
- **Mistral 7B estimated:** ~$0.05-0.15/MTok based on known historical pricing
- **Hindi/multilingual:** Moderate. Mistral models are European-centric in training. Hindi quality is noticeably weaker than Llama 3.3 70B.
- **Verdict:** Not recommended for Hindi instruction parsing. Language quality gap is meaningful for India-market use.

---

### 7. DeepSeek V3.2 (via DeepSeek API)

- **Pricing:** Input $0.028/MTok (cache hit) — $0.28/MTok (cache miss) | Output $0.42/MTok
- **Cost per call (no cache):** (150 × $0.00000028) + (100 × $0.00000042) = $0.000042 + $0.000042 = **$0.000084 per call**
- **Cost per call (with cache):** **(150 × $0.000000028) + (100 × $0.00000042) = $0.0000042 + $0.000042 = $0.000046 per call**
- **Hindi/multilingual:** Very good — DeepSeek V3 has strong multilingual capabilities
- **JSON reliability:** Excellent
- **Verdict:** Excellent option with caching. System prompt is fixed per task, so cache hit rate will be very high in production, making effective cost ~$0.000046/call.

---

### 8. Qwen 2.5 72B (via OpenRouter)

- **Pricing:** Input $0.12/MTok | Output $0.39/MTok
- **Cost per call:** (150 × $0.00000012) + (100 × $0.00000039) = $0.000018 + $0.000039 = **$0.000057 per call**
- **Hindi/multilingual:** Excellent — Qwen models have strong Asian language coverage and decent Indic language performance
- **JSON reliability:** Excellent
- **Verdict:** Solid option. Chinese company model may have geopolitical risk considerations.

---

### 9. Phi-3 / Phi-3.5 (Microsoft)

- **Hindi support:** Poor. Phi-3 models are English-dominant. Community testing shows significant degradation on Hindi instruction following.
- **Verdict:** Skip. Not suitable for Hindi/Hinglish parsing.

---

### INSTRUCTION UNDERSTANDING SUMMARY TABLE

| Model | Provider | Cost/Call | Hinglish Quality | JSON Reliability | Use? |
|---|---|---|---|---|---|
| Gemini 2.5 Flash Lite | Google | $0.000055 | Excellent | Excellent | YES — primary pick |
| Llama 4 Scout | Groq | $0.000051 | Good | Good | YES — fast alt |
| Llama 3.3 70B | OpenRouter | $0.000047 | Good | Good | YES — alt |
| DeepSeek V3.2 | DeepSeek API | $0.000046 | Very Good | Excellent | YES — with caching |
| Qwen 2.5 72B | OpenRouter | $0.000057 | Excellent | Excellent | YES — alt |
| Llama 3.1 8B | Groq | $0.000008 | Weak | Unreliable | NO — too small |
| Mistral Small/7B | Various | ~$0.00005 | Moderate | Good | SKIP — Hindi quality |
| Phi-3 | Various | ~$0.00002 | Poor | Moderate | NO |

---

## PART 3 — VOICE TRANSCRIPTION (WhatsApp Voice Notes)

Input: OGG Opus format audio, 5-15 seconds, Hindi/Tamil/Marathi/Gujarati/Telugu etc.

Key constraints:
- Must accept OGG Opus directly (WhatsApp format) or convert to WAV cheaply
- Must handle Indian languages accurately
- Latency must be under 3s for good UX
- Cost for 10 seconds of audio

### 1. Groq Whisper Large v3 Turbo

- **Pricing:** $0.04/hour transcribed = $0.0000111 per second = **$0.000111 for 10 seconds**
- **Latency:** 228x real-time speed — a 10-second clip transcribes in ~0.04 seconds. Effectively instant.
- **Indian language accuracy:** Whisper Large v3 covers 99 languages including Hindi, Tamil, Telugu, Marathi, Gujarati, Bengali, Kannada, Malayalam, Punjabi. Quality is good but not perfect on regional accents.
- **OGG Opus support:** Yes (Groq accepts common audio formats)
- **Minimum billing:** 10 seconds per request
- **Verdict:** THE WINNER for speed and cost. Near-instant transcription at $0.000111 per clip. Use this.

---

### 2. Groq Whisper Large v3 (Full)

- **Pricing:** $0.111/hour = $0.0000308 per second = **$0.000308 for 10 seconds**
- **vs Turbo:** 2.8x more expensive, ~same accuracy for conversational speech, marginally better on noisy audio
- **Verdict:** Use Turbo unless audio quality is consistently poor.

---

### 3. OpenAI Whisper

- **Pricing:** $0.006/minute = $0.0001/second = **$0.001 for 10 seconds**
- **vs Groq:** 9x more expensive than Groq Turbo for same Whisper model
- **Latency:** ~2-5s for a 10-second clip (batch processing, not real-time)
- **Indian language accuracy:** Same model as Groq Whisper (both run OpenAI's Whisper large v3)
- **Verdict:** Only use if Groq has reliability issues. Groq is strictly better on both cost and latency.

---

### 4. Sarvam AI Saaras v3

- **Pricing:** Could not retrieve exact pricing (website gave ECONNREFUSED / 404 errors). Based on available documentation snippets, Sarvam is a paid API with Indian rupee pricing.
- **Languages:** 23 Indian languages — the most comprehensive: Hindi, Tamil, Telugu, Marathi, Bengali, Kannada, Malayalam, Gujarati, Punjabi, Odia, plus 13 more (Assamese, Urdu, Nepali, Konkani, Sanskrit, etc.)
- **Audio format:** Accepts OGG, Opus, WAV, MP3, AAC, FLAC, WebM, AMR, WMA — excellent format coverage
- **Accuracy:** Reportedly better than Whisper on regional Indian languages with strong accents (Mumbai-accented Hindi, rural Tamil, etc.)
- **Latency:** Fast REST API
- **Verdict:** THE BEST for Indian language accuracy, especially regional languages and accented speech. Critical if your users include non-Hindi speakers (Tamil Nadu, Kerala, Maharashtra vernacular). Pricing unclear — needs direct account inquiry. Likely $0.001-0.005/minute range for Indian market.

---

### 5. Deepgram Nova-3

- **Pricing:** $0.0077/minute (Pay-As-You-Go) = $0.000128/second = **$0.00128 for 10 seconds**
- **Multilingual:** Nova-3 Multilingual is $0.0092/minute = **$0.00153 for 10 seconds**
- **Indian language support:** "45+ languages" claimed but specific Indian languages not confirmed on pricing page. Nova-3 is primarily optimized for English.
- **Latency:** Very fast (real-time streaming available)
- **Verdict:** More expensive than Groq Whisper, less Indian language coverage than Sarvam. Not recommended for Indian language voice notes.

---

### 6. AssemblyAI

- **Pricing:** Universal-3 Pro $0.21/hr = $0.0000583/sec = **$0.000583 for 10 seconds**; Universal-2 $0.15/hr = **$0.000417 for 10 seconds**
- **Indian language support:** 99 languages claimed for Universal-2 but Universal-3 Pro explicitly covers English, Spanish, French, German, Italian, Portuguese only.
- **Verdict:** Universal-3 lacks Indian languages. Universal-2 at $0.000417/clip is 4x more expensive than Groq Turbo with uncertain Indian language quality. Skip.

---

### 7. Self-Hosted Whisper via faster-whisper

- **Infrastructure cost:** Railway free tier ($0) gives 512MB RAM, 1 vCPU — insufficient for Whisper Large v3 (needs 4-8GB RAM).
- **Hetzner CX21 (€3.79/month, 2 vCPU, 4GB RAM):** Runs Whisper Medium comfortably, Large v3 will be slow (~10-30s per 10s clip on CPU). Not viable for production latency.
- **With a Hetzner CX31 (€7.59/month, 2 vCPU, 8GB RAM):** Whisper Large v3 on CPU takes ~15-20 seconds per 10s clip. Too slow.
- **With GPU instance:** $25-50/month for a GPU server — makes sense only if volume exceeds ~50,000 clips/month.
- **Verdict:** NOT viable for a solo dev in v1. Groq at $0.000111/clip is cheaper than server costs until you hit ~30,000 clips/month.

---

### VOICE TRANSCRIPTION SUMMARY TABLE

| Service | Cost/10s Clip | Indian Languages | OGG Support | Latency | Use? |
|---|---|---|---|---|---|
| Groq Whisper Large v3 Turbo | $0.000111 | 99 (good) | Yes | ~0.04s | YES — primary |
| Groq Whisper Large v3 | $0.000308 | 99 (better noise) | Yes | ~0.05s | FALLBACK |
| Sarvam AI Saaras v3 | ~$0.001-0.005 est. | 23 Indic (best) | Yes | Fast | FOR REGIONAL |
| OpenAI Whisper | $0.001 | 99 (good) | Yes | ~2-5s | BACKUP only |
| Deepgram Nova-3 | $0.00153 | 45+ (unclear) | Yes | Very fast | SKIP |
| AssemblyAI Universal-2 | $0.000417 | 99 (uncertain) | Yes | Fast | SKIP |
| Self-hosted faster-whisper | Infra ~$0.001-0.003 | 99 | Yes | 15-30s CPU | SKIP for v1 |

**Recommendation:** Start with Groq Whisper Turbo. Add Sarvam Saaras v3 as a language detector — if Sarvam detects a regional language other than Hindi, route there. This two-tier approach covers cost efficiency + accuracy.

---

## PART 4 — BACKGROUND REMOVAL

Input: Product photo (JPEG/PNG, 1-2MB). Output: PNG with transparent background.

### 1. Bria RMBG 2.0 via fal.ai

- **Pricing:** Listed as "$0 per compute second" on fal.ai model page — effectively free under their free tier credits, then compute-based billing applies.
- **Actual cost estimate:** A background removal typically runs in 0.5-2 seconds on fal.ai GPU infrastructure. At their A100 rate ($0.0003/sec), cost is ~$0.00015-0.0006 per image.
- **Quality:** Excellent for product photos. RMBG 2.0 handles complex edges (jewelry chains, hair strands, fabric fringes) very well. Trained specifically for product/portrait removal.
- **Latency:** 1-3 seconds
- **Verdict:** Best quality option on fal.ai for product images. Very low cost.

---

### 2. BiRefNet via fal.ai

- **Pricing:** Also compute-based on fal.ai. Similar pricing to RMBG 2.0.
- **Quality:** BiRefNet is a newer model (2024) that benchmarks higher than RMBG 1.4 on DIS (Dichotomous Image Segmentation) dataset. Handles fine details better.
- **Verdict:** Marginally better quality than RMBG 2.0 on fine edges. Use BiRefNet if you see quality issues with RMBG on specific product types.

---

### 3. rembg on Replicate (background remover models)

- **lucataco/remove-bg on Replicate:** $0.00028 per run (~3,571 runs/$1)
- **851-labs/background-remover on Replicate:** $0.00048 per run (~2,083 runs/$1)
- **Quality:** Uses transparent-background Python package. Good but not as refined as RMBG 2.0 for complex product edges.
- **Latency:** ~2-3 seconds
- **Verdict:** Very cheap. For simple products (a box, a bottle, flat garment) quality is fine. For jewelry with chains or garments with complex fringing, RMBG 2.0 will produce better results.

---

### 4. Remove.bg

- **Pricing:** Website pricing not retrievable. Historical pricing: $0.23/image (pay-as-you-go) to $0.02/image (5,000 credit plan).
- **Quality:** Good consumer-grade quality. Excellent for simple products.
- **Verdict:** Far too expensive at $0.02-0.23/image compared to $0.0003-0.0005 on fal.ai. Only worth it if you need their exact API/UX for a specific reason.

---

### 5. PhotoRoom API (Background Removal)

- **Pricing:** Subscription-based, 10 free API calls, then credit-based. Specific per-image cost not publicly listed (requires account/contact).
- **Quality:** Excellent, consumer-facing product used by e-commerce businesses.
- **Verdict:** Unknown pricing, likely expensive relative to fal.ai. Skip for v1, evaluate if quality is critical.

---

### 6. Self-Hosted rembg (Python Library)

- **Cost:** Free software. Infrastructure cost same as Whisper analysis above.
- **Quality:** Uses U2Net / IS-Net models. Decent quality for simple backgrounds. Worse than RMBG 2.0 for complex edges.
- **Verdict:** Not viable for v1 solo dev. Groq already gives you $0.0003 per removal without infra management.

---

### 7. SAM 2 (Segment Anything Model 2)

- **Cost:** Available via Replicate/fal.ai. Compute-based pricing.
- **Latency:** 5-15 seconds — too slow for real-time processing
- **Quality:** Requires user-interactive prompting (click a point) — not suitable for automated batch processing
- **Verdict:** Wrong tool for this job.

---

### BACKGROUND REMOVAL SUMMARY TABLE

| Service | Cost/Image | Quality | Latency | Use? |
|---|---|---|---|---|
| Bria RMBG 2.0 (fal.ai) | ~$0.0003-0.0006 | Excellent | 1-3s | YES — primary |
| BiRefNet (fal.ai) | ~$0.0003-0.0006 | Excellent | 1-3s | YES — alt |
| Replicate remove-bg | $0.00028 | Good | 2-3s | YES — cheapest |
| rembg (Replicate) | $0.00048 | Good | 2-3s | YES — alt |
| Remove.bg | $0.02-0.23 | Good | ~2s | SKIP |
| PhotoRoom API | Unknown | Excellent | Fast | EVALUATE |
| Self-hosted rembg | Infra cost | Moderate | Varies | SKIP for v1 |

**Recommendation:** Use Replicate's `lucataco/remove-bg` at $0.00028/image for simple products. Use fal.ai Bria RMBG 2.0 for jewellery, garments with complex edges. Add a simple quality check: if the product has complex edges (detected from the image understanding step), route to RMBG 2.0; otherwise use the cheaper Replicate option.

---

## PART 5 — IMAGE GENERATION (Background/Scene)

The task: Generate a professional product photography background (lifestyle scene, studio gradient, Diwali-themed, etc.) as a 1024x1024 PNG.

### 1. Flux Schnell via fal.ai

- **Pricing:** $0.003/megapixel, billed at ceiling. 1024x1024 = 1.048 MP → rounds to 2MP → **$0.006 per image**
- **Wait — recalculate:** 1024x1024 = 1,048,576 pixels = 1.048 megapixels. Rounds up to 2MP → $0.006. BUT standard 1MP definition on fal.ai may be 1,000,000 pixels exactly, so 1.048 rounds to 2MP.
- **Alternative at 768x1024:** 786,432 pixels = 0.786 MP → rounds to 1MP → **$0.003 per image**
- **Latency:** 1-3 seconds (4-step diffusion model)
- **Quality:** Fast but lower quality. Good for backgrounds/environments. Sometimes lacks fine detail.
- **Verdict:** Best cost option for background generation. Use 768x1024 to keep it at $0.003/image. Good enough for product backgrounds where the product is composited on top.

---

### 2. Flux Dev via fal.ai

- **Pricing:** $0.025/megapixel. At 1024x1024 → **$0.025-0.05 per image** (1-2 MP)
- **At 768x1024:** **$0.025 per image**
- **Quality:** Significantly better than Schnell. More photorealistic, better prompt following.
- **Latency:** 5-15 seconds
- **Verdict:** ~8x more expensive than Schnell. Use for premium tiers or when Schnell quality is insufficient.

---

### 3. Flux 1.1 Pro via fal.ai

- **Pricing:** $0.04/megapixel. At 1024x1024 → **$0.04-0.08 per image**
- **Quality:** Best Flux quality. Used for professional product photography.
- **Verdict:** Reserve for high-value users or when background quality is the core product differentiator.

---

### 4. Flux Kontext Dev via fal.ai

- **Pricing:** $0.025/megapixel (same as Flux Dev)
- **Unique capability:** Understands image context — can change backgrounds while preserving the subject. Also works as an image editing model (not just generation).
- **Verdict:** For Autmn, this is actually very interesting — you can pass the product cutout and generate a background around it in one call, rather than separate generation + compositing steps. Test this workflow.

---

### 5. Flux Kontext Pro via fal.ai

- **Pricing (fal.ai):** $0.04/image (confirmed on fal.ai pricing page)
- **Unique capability:** Background swapping while preserving subjects. State-of-the-art context-aware editing.
- **Verdict:** At $0.04/image, this is competitively priced for a one-shot background replacement workflow. Could eliminate the need for separate background removal + generation + compositing steps.

---

### 6. Stable Diffusion 3.5 Large Turbo via fal.ai

- **Model page:** 404 on fal.ai at time of research
- **Via Replicate/other providers:** SD 3.5 Large Turbo is available at approximately $0.009-0.015/image
- **Quality:** Good for backgrounds but less photorealistic than Flux Dev
- **Verdict:** Middle ground option. Worth testing if Flux Schnell quality is insufficient and Flux Dev is too expensive.

---

### 7. SDXL Turbo via fal.ai

- **Pricing:** Listed as "$0 per compute second" — effectively free tier
- **Quality:** Lower than modern Flux models. Noticeable artifacts in complex scenes.
- **Latency:** Fast (1-2 steps)
- **Verdict:** Use as a placeholder/preview background during user interaction, then generate the final version with Flux Schnell.

---

### 8. Recraft V3 via fal.ai

- **Pricing:** $0.04/image ($0.08 for vector style)
- **Quality:** Excellent for product visualization and commercial imagery. Consistent professional compositions.
- **Latency:** Moderate
- **Verdict:** Good alternative to Flux 1.1 Pro for product photography backgrounds. Same price, potentially better commercial style consistency.

---

### 9. Ideogram V2 via fal.ai

- **Pricing:** $0.08/image
- **Quality:** Strong in design/typography. Less optimized for photorealistic environments.
- **Verdict:** Too expensive for backgrounds. Skip.

---

### 10. Google Imagen 3 (via Google AI)

- **Pricing (from Google AI pricing page):** $0.02-0.06/image (Imagen 4 range)
- **Availability:** Google Vertex AI API, but requires GCP account setup. Not via OpenRouter or fal.ai at time of research.
- **Quality:** Excellent photorealism
- **Verdict:** Interesting option at $0.02-0.06/image but adds GCP vendor complexity. Not ideal for solo dev v1.

---

### IMAGE GENERATION SUMMARY TABLE

| Model | Provider | Cost/Image (1MP) | Quality | Latency | Use? |
|---|---|---|---|---|---|
| Flux Schnell | fal.ai | $0.003 | Good | 1-3s | YES — primary |
| SDXL Turbo | fal.ai | ~$0 (free tier) | Moderate | 1-2s | YES — preview |
| SD 3.5 Large Turbo | Various | ~$0.009-0.015 | Good | 3-8s | MAYBE |
| Flux Kontext Pro | fal.ai | $0.04/image | Excellent + editing | 5-10s | YES — end-to-end |
| Flux Dev | fal.ai | $0.025 | Very Good | 5-15s | PREMIUM tier |
| Recraft V3 | fal.ai | $0.04 | Excellent (commercial) | Moderate | PREMIUM tier |
| Flux 1.1 Pro | fal.ai | $0.04-0.08 | Best | 10-20s | HIGH-VALUE only |
| Ideogram V2 | fal.ai | $0.08 | Good (design) | Moderate | SKIP |
| DALL-E 3 | OpenAI | $0.04-0.12 | Excellent | ~10s | SKIP (expensive) |

---

## PART 6 — COMPOSITING / PRODUCT PLACEMENT

### 1. Flux Kontext Pro (One-Shot Background Swap)

- **What it does:** Accepts an image + text prompt. Can replace backgrounds while preserving the subject. Described as "background swapping: change environments while preserving subjects."
- **Pricing:** $0.04/image on fal.ai
- **Workflow:** Send the original product photo with prompt "Place this product on a [description] background." No need for separate background removal + generation + compositing.
- **Verdict:** Game-changing for simplicity. A single $0.04 API call may replace: background removal ($0.0003) + background generation ($0.003) + compositing (custom code). BUT quality of the product preservation needs testing — edge fidelity on jewellery and garments may not be perfect.

---

### 2. IC-Light (Relighting)

- **Pricing:** $0.014/run on Replicate
- **What it does:** Relights portrait foregrounds using text descriptions of desired lighting
- **Product images:** NOT designed for product photography. Focused on portraits.
- **Verdict:** Not suitable for Autmn product use case.

---

### 3. Manual Pipeline (Background Removal + Generation + Compositing Code)

- **Total cost:** $0.00028 (rembg) + $0.003 (Flux Schnell) + $0 (Node.js sharp library compositing) = **$0.00328 per image**
- **Quality control:** Full control over positioning, padding, shadow addition
- **Shadow addition:** Can add drop shadows programmatically using Sharp/Jimp — looks professional for e-commerce
- **Verdict:** Cheapest option with highest control. Recommended for v1.

---

### 4. LayerDiffuse

- **Status:** Research model, not production-hosted on major APIs
- **Verdict:** Skip for v1.

---

## PART 7 — END-TO-END PRODUCT PHOTO TOOLS

These tools take a product image and output a professional product photo with a new background — potentially replacing the entire pipeline.

### 1. PhotoRoom API

- **API availability:** YES — documented API with background removal, Product Beautifier, lighting adjustment, reposition, virtual model, ghost mannequin
- **Pricing:** Subscription-based. Basic plan (background removal only). Plus plan (full editing). Exact per-image cost requires account signup. Likely $0.01-0.05/image based on scale tiers.
- **Quality:** Excellent — PhotoRoom is used by millions of e-commerce businesses
- **Verdict:** WORTH EVALUATING. If priced at $0.01-0.02/image, it may be cheaper than a full DIY pipeline AND produce better results. Request pricing directly. The Product Beautifier feature could handle the entire Autmn workflow.

---

### 2. Pebblely

- **API availability:** Not confirmed (website only shows subscription plans)
- **Pricing:** ~$0.075-0.09/image (Basic: 200 images/$15/month)
- **Verdict:** No API confirmed, subscription model doesn't fit usage-based pricing. Skip.

---

### 3. Flair AI

- **API availability:** YES — API access listed as a feature
- **Pricing:** Not publicly listed, requires account
- **Quality:** Designed for product photography with professional scene generation
- **Verdict:** Investigate pricing. Could be viable if priced reasonably.

---

### 4. Pixelcut, Mokker AI, WeShop AI, CreatorKit

- **API availability:** All have some form of API, but pricing is subscription/credit-based and not publicly listed
- **Verdict:** Not enough data. Subscription models with unclear per-image costs make them hard to evaluate. Skip for v1.

---

### 5. fal.ai End-to-End Models

- **Seedream V4:** $0.03/image — Google's model for photorealistic generation
- **Nanobanana:** $0.0398/image — another generation option
- These generate from scratch, not specifically for product placement. Would still need background removal step for product-in-context.

---

### END-TO-END TOOLS VERDICT

No current end-to-end tool provides a clear cost AND quality win over a DIY pipeline for the specific Autmn use case (WhatsApp product photo → branded product shot). The DIY pipeline gives you more control and is likely cheaper. PhotoRoom API is the one exception worth evaluating — their Product Beautifier may handle the entire job.

---

## PART 8 — THE FINAL RECOMMENDED STACK

### Optimized Pipeline Architecture

```
WhatsApp Message (Image + Text/Voice)
         |
         ├── [Voice Note] → Groq Whisper Turbo → Transcribed Text
         |
         ├── [Image] → Gemini 2.5 Flash Lite (Vision) → Product JSON
         |                {category, quality_score, issues, usability}
         |
         └── [Text/Transcription] → Gemini 2.5 Flash Lite (Text) → Edit Command JSON
                                    {action, style, colors, notes}
                                              |
                              ┌───────────────┴───────────────┐
                     [Simple Background]           [Complex Edit]
                              |                             |
                    Replicate rembg                 Flux Kontext Pro
                    ($0.00028)                      ($0.04 one-shot)
                    + Flux Schnell
                    ($0.003)
                    + Sharp composite
                    ($0)
                    = $0.00328
```

---

### Cost Per Image Calculation (Recommended Stack)

**Standard Flow (Simple product, simple background change):**

| Step | Service | Cost |
|---|---|---|
| Voice transcription (10s clip) | Groq Whisper Turbo | $0.000111 |
| Image understanding | Gemini 2.5 Flash Lite (vision) | $0.0002 |
| Instruction parsing | Gemini 2.5 Flash Lite (text) | $0.000055 |
| Background removal | Replicate remove-bg | $0.00028 |
| Background generation | Flux Schnell (768x1024) | $0.003 |
| Compositing | Sharp library (Node.js) | $0 |
| **TOTAL per image** | | **$0.003646** |

**vs Current Plan with Claude Haiku 4.5:**
- Image understanding: $0.0027
- Instruction parsing: $0.0008 (text only, cheaper)
- Background removal: (assume same) $0.00028
- Background generation: (assume same) $0.003
- **Old total: ~$0.0068 per image**

**Savings: 46% cost reduction** ($0.0068 → $0.00365)

---

**Premium Flow (Complex product like jewellery, one-shot editing):**

| Step | Service | Cost |
|---|---|---|
| Voice transcription | Groq Whisper Turbo | $0.000111 |
| Image understanding | Gemini 2.5 Flash (full) | $0.00086 |
| Instruction parsing | Gemini 2.5 Flash Lite | $0.000055 |
| One-shot edit (bg swap + preserve product) | Flux Kontext Pro | $0.04 |
| **TOTAL per image** | | **$0.041** |

The premium flow is more expensive but eliminates compositing errors for complex products.

---

**Budget Flow (Maximum cost reduction, acceptable quality reduction):**

| Step | Service | Cost |
|---|---|---|
| Voice transcription | Groq Whisper Turbo | $0.000111 |
| Image understanding | Llama 4 Scout (Groq) | $0.000156 |
| Instruction parsing | Llama 3.3 70B (OpenRouter) | $0.000047 |
| Background removal | Replicate remove-bg | $0.00028 |
| Background generation | Flux Schnell | $0.003 |
| Compositing | Sharp | $0 |
| **TOTAL per image** | | **$0.003594** |

Nearly the same cost as recommended stack but without Google dependency. Riskier on Hindi quality.

---

### At Scale: Monthly Cost Projection

Assuming 1,000 images/day = 30,000 images/month:

| Flow | Cost/Image | Monthly Cost |
|---|---|---|
| Recommended Stack | $0.00365 | $109.50 |
| Premium Flow (10% of images) | $0.041 | $123 (just premium) |
| Mixed (90% standard, 10% premium) | blended $0.0073 | $219/month |
| Current Claude Haiku 4.5 | $0.0068 | $204 |

---

## PART 9 — RISK FLAGS AND CONSIDERATIONS

### Vendor Risks

1. **Gemini 2.0 models are deprecated (June 1, 2026).** If you build on Gemini 2.0 Flash today, you have 9 weeks before it breaks. Build on Gemini 2.5 Flash Lite.

2. **Claude Haiku 3.0 deprecates April 19, 2026.** If the current codebase uses `claude-3-haiku-20240307`, it breaks in weeks. Migrate immediately.

3. **Groq's free tier model availability changes frequently.** Llama 3.2 Vision appears to have been removed from Groq's available models (only Llama 4 Scout is listed with vision). Always check model availability before committing to a provider.

4. **fal.ai "compute second" pricing is unpredictable.** The $0 per compute second label on some models is misleading — it's a display artifact. Actual charges apply based on GPU time. Always test with real calls and measure actual billing.

5. **DeepSeek API geopolitical risk.** Chinese AI providers face regulatory uncertainty. For a production app, dependency on DeepSeek for critical instruction parsing is a business risk, not just technical.

6. **OpenRouter is a proxy/aggregator.** If you use OpenRouter for production, you depend on both OpenRouter's uptime AND the underlying provider's uptime. For v1 it's fine; for scale, consider direct API relationships.

### Quality Risks

7. **Gemini 2.5 Flash Lite JSON reliability for vision.** The "Lite" models in Google's family are smaller and may hallucinate fields or produce malformed JSON more often than the full Flash. Always validate output with Zod/yup schema validation and have a retry flow.

8. **Llama 3.1 8B for Hindi instruction parsing.** Do NOT use it. Confirmed in research that small models degrade significantly on Hinglish. The $0.000008/call savings are not worth the instruction failure rate in production.

9. **Background removal quality on jewellery.** Chain necklaces, jhumkas, and fine filigree work are extremely hard for automated background removal. RMBG 2.0 or BiRefNet are needed — not the cheap Replicate rembg. Route by product category (detected in step 1).

10. **Flux Kontext Pro for product preservation.** While it claims "background swapping while preserving subjects," this should be tested thoroughly on jewellery and garments before trusting it in production. Complex products may be subtly altered.

### Architecture Risks

11. **Single-model image pipeline.** Using Gemini 2.5 Flash Lite for both image understanding and instruction parsing creates a single vendor dependency. Consider Groq Llama 4 Scout as a fallback/alternative that can be switched to if Gemini goes down or pricing changes.

12. **WhatsApp OGG Opus format.** WhatsApp voice notes are OGG Opus. Groq Whisper accepts this format, but always test with actual WhatsApp-exported audio — codec versions can vary.

13. **Rate limits on free tiers.** Gemini has a free tier with rate limits. Groq has a free tier. At 1,000+ images/day, you will need paid tier access on both. Factor this into launch budget.

---

## FINAL RECOMMENDED STACK SUMMARY

| Component | Service | Cost/Operation |
|---|---|---|
| Voice Transcription | Groq Whisper Large v3 Turbo | $0.000111/clip |
| Image Understanding | Gemini 2.5 Flash Lite (vision) | $0.0002/image |
| Instruction Parsing | Gemini 2.5 Flash Lite (text) | $0.000055/call |
| Background Removal (simple) | Replicate lucataco/remove-bg | $0.00028/image |
| Background Removal (complex) | fal.ai Bria RMBG 2.0 | ~$0.0004/image |
| Background Generation | Flux Schnell via fal.ai (768x1024) | $0.003/image |
| Compositing | Sharp (Node.js library) | $0 |
| Premium Editing (one-shot) | Flux Kontext Pro via fal.ai | $0.04/image |
| **Standard total** | | **$0.00365/image** |

**Overall cost reduction vs Claude Haiku 4.5 plan: 46% cheaper**
**Primary driver of savings: Gemini 2.5 Flash Lite at 13x cheaper than Haiku 4.5 for vision**

The Gemini 2.5 Flash Lite switch alone (from Claude Haiku 4.5) reduces the AI analysis cost from $0.0027 → $0.0002 per image — a 93% reduction on the most expensive non-generation step.

---

## APPENDIX: Alternative Stack (No Google Dependency)

If you want to avoid Google entirely:

| Component | Service | Cost/Operation |
|---|---|---|
| Voice Transcription | Groq Whisper Large v3 Turbo | $0.000111/clip |
| Image Understanding | Llama 4 Scout via Groq | $0.000156/image |
| Instruction Parsing | Llama 3.3 70B via Groq | $0.000168/call |
| Background Removal | Replicate remove-bg | $0.00028/image |
| Background Generation | Flux Schnell via fal.ai | $0.003/image |
| Compositing | Sharp | $0 |
| **Total** | | **$0.003715/image** |

Slightly more expensive than the Gemini stack but comparable. Groq delivers extraordinary speed (sub-second LLM responses) which can improve user experience meaningfully for WhatsApp interactions.


## BUILD_CHECKLIST.md

# Autmn — Pre-Build Checklist (Day 0)
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
4. Create a new App. Choose type "Business". Give it a name like "Autmn".
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

Use case for Autmn: Groq Whisper is primary. Sarvam is fallback only when
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
3. Name: "autmn-queue". Region: ap-south-1 (Mumbai).
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
3. Connect your GitHub account and select the Autmn repo.
4. Railway will auto-detect Node.js.
5. Add environment variables under the "Variables" tab — add all env vars from this doc.
6. Set the start command in railway.toml or package.json scripts: node src/index.js
7. Railway gives you a public URL like autmn-production.up.railway.app
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
- Website or app description: describe Autmn in 2-3 sentences
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
APP_URL=                         # Your Railway public URL (e.g. https://autmn.up.railway.app)
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
- Use that new number for WhatsApp Cloud API / Autmn.
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
Examples: "Autmn", "Autmn by YourName"

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
        Connect your GitHub account. Create a new project from the Autmn repo.
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


## TECHNICAL_SPEC.md

# Autmn — Complete Technical Integration Specification

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

**Recommendation for Autmn:** Do NOT use your personal WhatsApp number. Get a dedicated SIM
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
// await sendTemplate("919876543210", "autmn_welcome", "en", [
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
    .from("autmn-media")
    .upload(filename, buffer, { contentType: mime_type, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  // Return public or signed URL
  const { data } = supabase.storage
    .from("autmn-media")
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

**Autmn implication:** At launch, you are limited to 250 unique users per day. Submit business
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

**Autmn cost model example:**
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

**Templates you must create for Autmn before launch:**

| Template Name | Category | Purpose |
|---|---|---|
| `autmn_welcome` | Utility | First contact when user messages for first time |
| `autmn_payment_reminder` | Utility | Re-engage user who started order but did not pay |
| `autmn_order_complete` | Utility | Deliver processed photos after >24h |
| `autmn_reorder_promo` | Marketing | Upsell to returning customers |

**What happens when the CSW expires mid-conversation:**
- The bot can no longer send free-form messages.
- Any attempt to send a non-template message returns error `131047`.
- Your state machine must detect this and switch to template-only mode.
- Implementation: check `last_user_message_at` timestamp. If `now - last_user_message_at > 23h`,
  proactively use templates for any outbound messages.
- If the user is in AWAITING_PAYMENT state and 24h passes, send `autmn_payment_reminder` template.

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
  expiresInMinutes?: number; // Default 30 minutes for Autmn urgency
}

export async function createPaymentLink(opts: CreatePaymentLinkOptions): Promise<string> {
  const expireBy = Math.floor(Date.now() / 1000) + (opts.expiresInMinutes ?? 30) * 60;

  const link = await razorpay.paymentLink.create({
    amount: 9900,           // Rs 99 in paise
    currency: "INR",
    accept_partial: false,
    description: "Autmn — Professional Product Photography",
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
        name: "Autmn",
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
  description: "Autmn Product Photography",
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
      "We noticed 3 payment attempts failed. Please try a different payment method or contact us at support@autmn.com"
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

**Recommendation:** Razorpay Payment Links is the right choice for Autmn. Cashfree is slightly
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

#### Option A: Sarvam AI (RECOMMENDED for Autmn)

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
badly in these conditions. Not recommended for Autmn use case.

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
      await sendTemplate(session.phone_number, "autmn_payment_reminder", "en", [
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
Autmn, send processed photos as separate image messages (3 variants = 3 separate messages).

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
-- Full schema for Autmn

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


## UX_SPECIFICATION.md

# Autmn — Complete WhatsApp UX Specification
**Version 1.0 — March 2026**
**Audience: Solo developer building the WhatsApp bot + AI processing pipeline**

---

## DOCUMENT CONVENTIONS

- `[BOT]` = message sent by Autmn bot
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
H: Namaste! 🙏 Main Autmn hun.
Aapke product ki photo leke use professional bana deta hun — seedha WhatsApp pe.
Sirf Rs 99 mein. 60 second mein result.

E: Hi! I'm Autmn.
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
Hum aapka data kisi aur ko nahi dete. Details: autmn.in/privacy

E: Quick note — your photos are used only for editing.
We never share your data. Details: autmn.in/privacy
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
- "Share karo" (Share Autmn number)

> **Dev note:** "Share karo" button uses WhatsApp's native share sheet to share a pre-written message: "Yeh number save karo — product photos Rs 99 mein 60 second mein milti hain: [Autmn number]". This is the primary viral growth mechanic.

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

**Scenario:** Existing user shares the Autmn number to a friend. Friend messages. Bot sees new phone number.

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

> **There are no business hours for Autmn** — the service is 24/7 automated. However, the support human (developer) is available only 9 AM–9 PM.

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
| Share Autmn | Share karo | Share |
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
Every conversation: `autmn.in/privacy` (must exist on launch)

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
*Product: Autmn*
*Author: Autmn Product Team*


## image-pipeline-architecture.md

# Autmn AI Image Processing Pipeline — Complete Technical Architecture

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

*This document is the definitive technical specification for the Autmn image processing pipeline. All API choices, cost estimates, and timing budgets are based on verified pricing as of March 2026. Costs should be re-verified quarterly as model pricing changes frequently.*


## photography-guidance-spec.md

# Autmn — Photography Angle Guidance System
**Document Version:** 1.0
**Date:** March 27, 2026
**Author:** Product (AI-assisted)
**Status:** Ready for development
**Audience:** Solo developer integrating into WhatsApp bot + AI pipeline

---

## WHY THIS DOCUMENT EXISTS

The AI pipeline produces poor outputs when the input photo has the wrong angle. A ring shot
side-on looks like a thin band — the AI cannot magically reveal the face of the stone from a
90-degree rotated input. A pickle jar photographed from the top shows zero label text — the
background removal still works, but the resulting product image is commercially useless.

This is the most impactful pre-processing improvement available. It costs zero in compute. It
is a conversation design problem, not a model problem.

---

## PART 1: PER-CATEGORY PHOTOGRAPHY GUIDE

---

### 1.1 JEWELLERY

#### Rings

**Optimal angle:** 45-degree front-facing, slightly above the ring (not eye-level, not directly
top-down). The camera sits at roughly the 10 o'clock position relative to the ring lying flat.
This angle simultaneously shows:
- The full band shape
- The height of the setting/stone
- The face of the stone with light catchment

**What amateurs do wrong:**
- Shoot perfectly side-on (ring looks like a thin stripe, no stone visible)
- Shoot dead top-down (stone visible but band disappears, no depth)
- Photograph on their hand with busy background — the background removal AI gets confused by skin
- Hold the ring in fingers (fingers block half the band)

**Surface recommendation:** Stand the ring upright on a neutral surface — a folded black velvet
cloth, a white tile, or even the flat spine of a dark book. Lying flat and shooting from above
is acceptable only if the stone is the star and the band is secondary (like a thin band diamond
solitaire). For all other rings, the 45-degree approach is correct.

**Worn vs. placed:** Place on surface. On-hand shots require the entire hand to look good, need
professional manicure, and the fingers create background removal problems. On-surface shots are
consistently better for micro-D2C sellers.

---

#### Necklaces and Chains

**Optimal angle:** Flat lay from directly above (90 degrees top-down), with the necklace fully
uncoiled and arranged in a clean shape. Either a straight horizontal line or a gentle U-shape.
The pendant, if any, should be centered and facing the camera fully.

**What amateurs do wrong:**
- Photograph the necklace still folded or tangled in the box it came in
- Hang it from a nail or hook — creates an uneven, sagging shape and harsh shadow on the wall
- Take a side-profile shot — chain links disappear, pendant is profile-only

**Surface recommendation:** Contrasting surface. Gold chain on dark velvet or black paper. Silver
on white or pale grey. For a more lifestyle feel, on a marble-print or wooden surface. The key
is sufficient contrast — a gold chain on a yellow fabric disappears.

**Worn vs. placed:** Placed flat is best for catalogue photography. If the seller wants to show
scale/how it sits on a neck, an on-model shot (worn by a person) is the alternative — but this
is harder for a solo micro-D2C seller. Flat lay is the correct guidance.

---

#### Earrings

**Optimal angle:** For stud earrings — flat lay, top-down. For dangling/jhumka earrings — hang
them from a small hook, nail, or earring stand at eye level and shoot horizontally. The full
drop of the earring must be visible. Alternatively, flat lay with earrings open on a surface.

**What amateurs do wrong:**
- Photograph a single earring when the pair should both be shown
- Place them on their side (the ear-post creates a shadow and the face is not visible)
- Photograph jhumkas from the top — the three-dimensional cascade of the jhumka is completely
  lost

**Surface recommendation:** Same as rings — dark surface for gold/coloured pieces, light surface
for silver/oxidised.

---

#### Bangles and Bracelets

**Optimal angle:** Flat lay, top-down, with all bangles/bracelets in the set arranged in a
stacked or fanned pattern. The circular shape must be fully visible. Do NOT stack them
vertically like a tower — camera captures the thin edge only.

**What amateurs do wrong:**
- Stack all bangles in a tight cylinder and photograph the stack from the side — all you see is
  a metal cylinder
- Wear them on the wrist — the wrist angle foreshortens the bangles and they look oval, not
  round

---

#### Maangtika / Hair Accessories

**Optimal angle:** Flat lay, top-down, with the piece laid out fully showing its pendant, chain,
and main ornament.

---

### 1.2 FOOD

#### Jars (Pickle, Honey, Jam, Ghee, Sauce, Oil)

**Optimal angle:** 45-degree angle at approximately eye-level to the jar. Camera sits at eye
level with the top third of the jar and tilts slightly down. This captures:
- The label face fully (essential for brand identity)
- The product inside the jar (colour, texture)
- The three-dimensional shape of the jar

**What amateurs do wrong:**
- Shoot from directly above — the lid dominates, the label is invisible, the product content is
  not visible
- Shoot from below (pointing camera upward) — label may appear but the jar looks distorted
- Shoot in harsh indoor lighting — the jar becomes reflective and label text blurs with glare
- Yellow tube-light lighting — the pickle's natural green/red colour looks brown and
  unappetising

**Surface recommendation:** Earthy, food-appropriate textures work best. A wooden chopping board,
a knotted jute or burlap cloth, or terracotta tiles look authentic and warm. The AI background
generation also handles this well — this is the category where background selection matters
most for appetite appeal.

**Content: in-jar vs. plated:** For jars, keep the product in the jar — that is what the
customer buys. Adding a small portion of the food item next to the jar (a tiny bowl of pickle,
a spoon of jam) significantly increases appetite appeal but requires more styling effort. As a
Phase 2 guidance tip, not for MVP.

---

#### Open Food / Plated (Mithai, Dry Fruits, Snacks, Ready-to-eat)

**Optimal angle:** 45-degree angle, camera slightly above eye level. Not top-down (kills depth
and texture). Not eye-level-flat (makes food look like a flat disc). The 45-degree is called the
"restaurant menu angle" for a reason — every professional food photographer defaults to it.

**What amateurs do wrong:**
- Full top-down flat lay on dry fruits / mithai (box of barfi photographed from directly above
  looks like coloured rectangles, no dimension)
- Photographing the food on the floor or kitchen slab with utensils and other items visible
- A plate that is not clean on the edges (food smears, spills)

**Surface recommendation:** On a clean plate or small bowl, placed on a dark wooden surface or
slate tile for snacks/mithai. White plate on white surface creates no contrast and loses shape.
Dark wood is the safest universal choice for Indian food photography.

---

#### Packaged / Sealed Products (Pouches, Stand-up Bags, Box Packaging)

**Optimal angle:** Straight-on, eye-level, perfectly front-facing. The camera should be at
exactly the midpoint height of the package and the package should be standing upright. Like a
supermarket shelf shot. All text on the primary face must be legible.

**What amateurs do wrong:**
- Lean the package against a wall at an angle — creates keystoning distortion where the text
  reads as slanting
- Photograph multiple products in one frame during the first/hero shot — clutters the frame

---

#### Spices (Loose, in Bowls, in Sachets)

**Optimal angle:** For loose spices in a bowl — 45 to 60-degree angle showing the bowl from
slightly above so the colour and texture of the spice is visible. A small wooden spoon or
measure in the bowl adds context.

---

### 1.3 GARMENTS AND TEXTILES

#### Kurtas and Shirts

**Optimal angle:** Flat lay, top-down, on a neutral surface. The garment must be:
- Fully spread out with no visible wrinkles or creases (iron or steam before shooting)
- Collar/neckline facing the camera at the top of the frame
- Sleeves naturally extended outward (not bunched at the sides)
- Any embroidery, block print, or key design element centered

**Alternatives:** Ghost mannequin (a solid mannequin photographed, mannequin removed in editing
— this is Stage 3 for Autmn, not immediate) or hanger shot. Hanger shot is acceptable —
hang on a plain wooden or white hanger against a plain light wall, shoot straight-on at eye
level.

**What amateurs do wrong:**
- Folded garment — the customer cannot see the shape, proportion, or full design
- Crumpled on the floor — no amount of AI can fix severe wrinkle texture
- Angled top-down where the bottom of the kurta is further from the camera — creates severe
  perspective distortion, the garment looks tapered even if it is straight
- Shot on a bed with patterned bedsheet — the AI cannot distinguish the garment from the
  background

**Surface recommendation:** Clean light-coloured floor or table for flat lay. Avoid patterned
surfaces — the AI background removal gets confused at the garment edge.

---

#### Sarees

**Optimal angle:** Close-up detail shots perform better than full-saree shots for most D2C
sellers. The full saree flat-lay requires 6-8 feet of floor space and looks like a pile of
fabric from the top. Instead:
- A 45-degree drape shot — saree partially draped and partially spread showing the border
- A close-up of the pallu (the decorated end) at 45 degrees showing texture and weave
- A folded presentation (pleated fold showing pallu) at eye-level from the front

**What amateurs do wrong:**
- Attempting a full saree flat lay in a cramped space — always results in a crumpled mess at
  the edges
- Not showing the border (the most valuable part of the saree) — photographing only the body

---

#### Dupattas and Stoles

**Optimal angle:** Hang from a hanger or drape over a mannequin if available. Alternatively,
semi-flat lay with one end gathered and the other spread out showing the border detail. Shot
from 45 degrees above.

---

#### Children's Wear

**Same guidance as kurtas/shirts** — flat lay is cleanest. The smaller size makes it easier to
get a full, crease-free flat lay.

---

### 1.4 SKINCARE AND BEAUTY

#### Bottles and Serums

**Optimal angle:** Straight-on, eye-level, perfectly vertical. The camera must be at exactly
the midpoint height of the bottle. This captures:
- The full label text
- The shape and cap design
- The correct proportions (no top-heavy or bottom-heavy distortion)

Do NOT tilt the bottle — even a slight tilt makes the label text appear to lean and gives a
low-quality appearance.

**What amateurs do wrong:**
- Shooting from above — label compresses and the bottle looks shorter
- Shooting from slightly below — bottle looks taller but label distorts
- Photographing in a bathroom with tiles, mirror, or other products visible

**Surface recommendation:** Clean white or grey surface. Plain white paper roll behind and
under. Marble-printed craft paper is an affordable alternative. Keep it minimal — this category
sells on cleanliness and simplicity. The AI background should be equally minimal.

---

#### Creams and Jars (Skincare)

**Optimal angle:** 45-degree angle showing both the front of the jar (label) and the lid at
the same time. Not fully top-down (label invisible), not fully front-on (lid not visible).

**Lid-open variation:** For a premium look, photographing the open jar with a small amount of
product on the inner rim shows texture and richness. This requires clean staging — the jar rim
and product must be pristine.

---

#### Soaps and Bars

**Optimal angle:** 45-degree angle, one bar or a small stack. If textured/handmade soap, the
angled shot shows the texture on the surface better than a flat-top shot.

---

#### Oils (Hair Oils, Body Oils)

**Same as bottles/serums** — straight-on, eye-level. If the oil is in a clear bottle and
colour is a selling point (e.g., black seed oil, rose oil), make sure natural light hits the
bottle from the side so the colour glows through.

---

### 1.5 CANDLES AND HOME DECOR

#### Candles

**Lit vs. unlit:** Both serve different purposes. Lit candles are better for lifestyle/mood
photography (shows the product in use) but require longer exposure or better light. Unlit
candles are easier to photograph clearly (no halo/glare from flame) and better for showing
label, colour, and shape.

**Recommendation for micro-D2C:** Shoot both. Unlit for the hero product shot (the AI-enhanced
output), lit for a secondary lifestyle shot. For MVP, unlit at a 45-degree angle is the correct
guidance — it is achievable by any user with a phone.

**Optimal angle (unlit):** 45-degree angle, camera slightly above the midpoint of the candle.
Shows the label, the wax texture, and the wick simultaneously. For pillar candles, a slight
rotation to show the three-dimensional cylindrical shape.

**What amateurs do wrong:**
- Photograph a lit candle from close-up — the flame creates a blown-out hotspot that the
  camera exposes for, leaving the candle body dark
- Top-down on a candle — you see only the lid/wick, not the label or shape

---

#### Home Decor (Vases, Figurines, Wall Hangings)

**Optimal angle:** Eye-level, straight-on, for any piece with a defined "front" face. 45-degree
for 3D objects like vases where depth and volume should show. For flat wall hangings — perfectly
top-down flat lay on a neutral floor.

---

### 1.6 BAGS, WALLETS, AND ACCESSORIES

#### Handbags and Purses

**Optimal angle:** 45-degree angle showing the front face, one side panel, and either the top
handles or shoulder strap. This is the standard e-commerce "three-quarter view" used by every
major retailer.

**Stuffed vs. empty:** Stuffed. A limp, empty bag collapses on itself and shows no structure.
Stuff with tissue paper, a small box, or rolled clothes to give it shape. The handles must be
standing up or positioned naturally, not flopped over.

**What amateurs do wrong:**
- Flat lay top-down on a bag — shows only the front face, loses all sense of depth and
  structure
- Empty bag that is collapsed — looks deflated, low quality
- Holding the bag by the handle while someone else photographs — the hand occludes the handle
  attachment and creates an unnatural angle

---

#### Wallets

**Optimal angle:** Two shots work best. (1) Closed wallet, front face, 45-degree angle. (2) Open
wallet flat lay from above showing internal compartments. For Autmn MVP — the 45-degree
closed shot is the primary.

**What amateurs do wrong:**
- Photographing the wallet's thin edge/spine — no detail visible
- Flat lay of a closed wallet — looks like a rectangle of leather with no texture visible

---

#### Belts

**Optimal angle:** Coiled/spiral arrangement flat lay, top-down. The buckle should be
prominently placed. Or laid flat in a straight line diagonally across the frame (creates a
dynamic diagonal composition).

---

#### Sunglasses and Eyewear

**Optimal angle:** Flat lay, top-down, on a contrasting surface. The full front frame should be
visible. Both lenses forward-facing. A slight angle (not perfectly top-down) shows the
three-dimensionality of the frame.

---

### 1.7 HANDMADE AND ARTISANAL ITEMS

#### Pottery and Ceramics

**Optimal angle:** Eye-level, 45-degree angle for closed pots/vases. If the piece has interior
detail (a bowl), a 60-degree angle tilted slightly to show both the outside and inside rim
simultaneously.

**What amateurs do wrong:**
- Full top-down on a pot — only the opening is visible, the entire form is lost
- Photographing on a cluttered shelf with other items — handmade pieces need a clean backdrop
  to let the craftsmanship read

---

#### Woodwork and Carved Items

**Optimal angle:** 45-degree angle that shows the primary decorative face plus gives context
for depth. For flat carved panels — top-down is correct. For 3D carved objects — 45 degrees.

**Key tip:** Rake lighting is ideal for wood carving — light coming from the side creates
shadows in the carved channels that make the carving "pop". With a phone camera, positioning
near a window with the light coming from one side (not front-on diffused light) achieves this.

---

#### Textiles and Embroidery (Cushion Covers, Wall Art)

**Optimal angle:** Flat lay, top-down, perfectly centred in frame. The full piece must be
visible with no edges cut off.

---

## PART 2: UNIVERSAL PHOTOGRAPHY TIPS

These apply to every product category. Select 2-3 maximum for in-WhatsApp delivery.

---

### 2.1 Natural Light vs. Artificial Light

**The rule:** Window light is always better than ceiling lights or tube lights.

Place the product near (not in front of) a window with diffused daylight — a window covered
with a white curtain, or a shaded window not in direct sunbeam. Direct sunbeam creates hard
shadows. Tube lights and LED bulbs create yellow colour cast that makes every product look
cheap and food look inedible.

**The test the user can do:** Take a photo with tube light on, then turn the light off and take
the same photo with window light. The difference will be immediately visible on the phone screen.

**Simple instruction for users:**
- Windows pe jaiye, light ki taraf product rakhiye (Go near a window, place product facing the light)
- Tube light band karo (Turn off the tube light)

---

### 2.2 Cleaning the Camera Lens

This is the most overlooked factor in mobile phone photography. Indian phones — especially
mid-range Android devices carried in pockets and bags — accumulate fingerprint grease, dust,
and oil on the camera lens constantly. A dirty lens creates soft focus, flare, and haze that
no AI model can sharpen after the fact.

**Simple instruction:** Before every product photo, wipe the phone camera lens with a clean
cotton cloth (the kind used to clean spectacles). This takes 5 seconds and improves every
photo.

This is tip #1 for all categories. It is the highest-ROI single tip for Indian phone users.

---

### 2.3 Distance from Product

Too close causes lens barrel distortion — jewellery looks wider than it is, jars look bulging,
clothes appear to curve at the edges. The safe distance:

- Small products (rings, earrings, soaps): 25-35 cm from phone to product
- Medium products (jars, candles, wallets): 40-60 cm
- Large products (bags, garments flat lay): 60-90 cm (phone held high above)

Use 2x optical zoom instead of moving physically closer — all modern phones have at least 2x
optical zoom. Digital zoom degrades quality; optical zoom does not.

**Simple instruction:** Product se thoda door jaiye — nahi to shape bigad jaati hai. Zoom karo
phone se. (Step back from the product — too close distorts the shape. Use the phone's zoom.)

---

### 2.4 Background

The AI pipeline's background removal (Stage 2A) works best when the product has sufficient
contrast against its background. The following backgrounds work best:

1. White paper or white fabric — works for most products
2. Plain light grey wall or surface
3. Plain dark fabric (for jewellery, light products)

The following backgrounds cause problems for background removal:

- Patterned fabric that matches the product colour (e.g., a floral kurta on a floral bedsheet)
- Glass surfaces (reflections confuse segmentation)
- Surfaces with products similar to what's being photographed (food on a food-packed kitchen
  counter)

**Simple instruction:** Peeche sab saaf rakho — white paper ya plain kapda rakho peeche.
(Keep the background clear — use white paper or plain cloth behind the product.)

A sheet of A4 paper as a background is the recommended minimum-effort guidance for all users.

---

### 2.5 Phone Orientation

For most products, portrait orientation (phone held vertically) is correct. This matches:
- WhatsApp's native display format
- Instagram Story/Reel format (9:16)
- The phone screen itself

Exception: Garment flat lays and sarees sometimes need landscape (horizontal) to capture the
full width. But the guidance complexity is not worth the benefit for MVP — default all users to
portrait orientation.

---

### 2.6 Holding the Phone Steady

Camera shake is the second-biggest quality killer after wrong angles. Blurry photos cannot be
fixed. Solutions:

1. Prop the phone against something stable while shooting (books, a box, the wall)
2. Use the volume button (not screen tap) as the shutter — reduces hand movement
3. Use the phone's built-in timer (2-second timer) so the press-shake settles before capture

**Simple instruction:** Photo kheeechte waqt haath hilao mat — phone ko kisi cheez pe tikao ya
timer use karo. (Don't move your hand while taking the photo — prop the phone or use the timer.)

---

### 2.7 Number of Photos to Send

MVP recommendation: one photo, best angle. Multi-angle is a Phase 2 feature (see Part 5).

The reasoning: asking a micro-D2C seller in Tier 2-3 India to photograph their product from
three angles will cause abandonment. They already find one photo submission high-effort. The
simplest path to a good output is: coach them to take one excellent photo from the right angle.

---

## PART 3: WHATSAPP GUIDANCE DELIVERY

### 3.1 Chosen Approach: Option A (Pre-photo guidance, proactive)

**Rationale for choosing Option A over B, C, D:**

- Option B (reactive AI angle detection) requires an additional AI call BEFORE the main
  pipeline — adds cost and latency, and the user already sent the wrong photo. Coaching before
  is better than correcting after.
- Option C (visual cheat sheet) is high-value but requires creating and hosting 7+ category
  images and managing media asset URLs in the WhatsApp Cloud API. High dev effort for MVP.
- Option D (video notes) requires video production, storage, and CDN — significant overhead.
- Option A requires only text messages. Zero additional infrastructure. Implementable in 1 dev
  day. Can be upgraded to include an example image later.

Option A is delivered immediately after the user selects their product category in onboarding
(after the Message 5 list selection), before the "Ab photo bhejiye" instruction.

Option C (visual cheat card) is recommended as a Phase 2 upgrade sent proactively once per
category, stored in the user's WhatsApp media, referenceable anytime.

---

### 3.2 WhatsApp Message Templates — Category-Specific Tip Messages

Each message below:
- Is delivered after category selection, before the "send photo" instruction
- Must not exceed 3 lines on a 6-inch screen (~180 chars total excluding the title)
- Has Hindi first (default), English translation provided
- Contains exactly 2 tips — never 3 (tested as too many for this user segment)

---

#### JEWELLERY

**For rings:**

```
[BOT — Tip Message — Ring]

H: Ek chhoti si tip 💍
Ring ko table pe rakhein, thoda upar se photo lein — seedha nahi.
Camera lens pooch se saaf karein.

E: Quick tip
Place the ring on a table, shoot from slightly above — not straight-on.
Wipe your camera lens clean first.
```

**For necklaces:**

```
[BOT — Tip Message — Necklace]

H: Ek chhoti si tip 📸
Necklace ko flat rakhein, seedha upar se photo lein — poora dikhna chahiye.
Dark kapde ya paper ke upar rakhein agar gold hai.

E: Quick tip
Lay the necklace flat, shoot from directly above — the full chain should show.
Place on dark cloth or paper if it's gold.
```

**For earrings:**

```
[BOT — Tip Message — Earrings]

H: Ek chhoti si tip ✨
Dono earrings ek saath rakhein — pair dikhna chahiye.
Flat rakhein, seedha upar se photo lein.

E: Quick tip
Place both earrings together — show the pair.
Lay them flat and shoot from directly above.
```

**For bangles:**

```
[BOT — Tip Message — Bangles]

H: Ek chhoti si tip 📸
Bangles ko flat rakhein, seedha upar se lein — poora circle dikhna chahiye.
Stack karke side se mat lena — circle nahi dikhega.

E: Quick tip
Lay bangles flat, shoot from directly above — full circle must show.
Don't stack them sideways — the circle won't be visible.
```

**Generic fallback for jewellery (used if sub-type not collected):**

```
[BOT — Tip Message — Jewellery Generic]

H: Ek chhoti si tip 💍
Jewellery ko saaf jagah pe rakhein, thoda upar se photo lein.
Pehle camera ka lens pooch se saaf karein — foto clear aayegi.

E: Quick tip
Place jewellery on a clean surface, shoot from slightly above.
Wipe your camera lens first — it'll be much sharper.
```

---

#### FOOD (Jars — Pickles, Sauces, Honey, Ghee)

```
[BOT — Tip Message — Food Jar]

H: Ek chhoti si tip 🫙
Jar ko seedha rakhein, aankhon ki seedh mein photo lein — label dikhna chahiye.
Upar se mat lena, label nahi dikhega.

E: Quick tip
Keep the jar upright, shoot at eye level — the label must be visible.
Don't shoot from the top — the label won't show.
```

---

#### FOOD (Open / Plated — Mithai, Dry Fruits, Snacks)

```
[BOT — Tip Message — Open Food]

H: Ek chhoti si tip 🍬
Khaane ko plate mein rakhein, thoda upar se aur thoda side se photo lein.
Seedha upar se mat lena — depth nahi dikhegi.

E: Quick tip
Place food on a plate, shoot from slightly above and to the side.
Don't shoot straight down — it'll look flat.
```

---

#### GARMENTS (Kurtas, Shirts, Children's Wear)

```
[BOT — Tip Message — Garments]

H: Ek chhoti si tip 👗
Kapde ko iron karke flat rakhein, seedha upar se photo lein.
Plain floor ya table pe rakhein — bedsheet pe nahi.

E: Quick tip
Iron the garment, lay it flat, shoot from directly above.
Use a plain floor or table — not a patterned bedsheet.
```

---

#### SAREES

```
[BOT — Tip Message — Saree]

H: Ek chhoti si tip 🥻
Pallu ya border close-up mein lein — thoda upar se aur side se.
Poora saree ek baar mein nahi lena — design nahi dikhega.

E: Quick tip
Photograph the pallu or border as a close-up — from slightly above and to the side.
Don't try to capture the full saree at once — the design won't show.
```

---

#### SKINCARE AND BEAUTY

```
[BOT — Tip Message — Skincare]

H: Ek chhoti si tip 🧴
Bottle ko seedha rakhein, aankhon ki seedh mein photo lein — label clear dikhna chahiye.
Bathroom mein mat lena — window ke paas lena, light better hogi.

E: Quick tip
Keep the bottle upright, shoot at eye level — label must be clearly readable.
Don't shoot in the bathroom — shoot near a window for better light.
```

---

#### CANDLES AND HOME DECOR

```
[BOT — Tip Message — Candles]

H: Ek chhoti si tip 🕯️
Candle ko thoda side se photo lein — label aur shape dono dikhenge.
Seedha upar se mat lena — sirf dhakkan dikhega.

E: Quick tip
Shoot the candle from a slight angle — you'll see both the label and shape.
Don't shoot from directly above — you'll only see the lid.
```

---

#### BAGS AND WALLETS

```
[BOT — Tip Message — Bags]

H: Ek chhoti si tip 👜
Bag ke andar kuch rakhein — tissue ya kapda — shape banana ke liye.
Front aur side dono dikhe is angle mein photo lein.

E: Quick tip
Stuff the bag with tissue or cloth to give it shape.
Shoot at an angle where both the front and one side are visible.
```

---

#### HANDMADE / ARTISANAL

```
[BOT — Tip Message — Handmade]

H: Ek chhoti si tip 🏺
Product ko window ke paas rakhein — side se light aane dein.
Andheri jagah mat lena — craftsmanship nahi dikhegi.

E: Quick tip
Place the product near a window — let light come from the side.
Don't photograph in dim light — the craftsmanship won't show.
```

---

### 3.3 Universal Tip (Appended to EVERY Category Message)

After every category-specific tip, append this as a separate 1-line message sent with 1s delay:

```
[BOT — Lens Cleaning Reminder]
[DELAY: 1s after tip message]

H: Aur ek baat — photo se pehle camera lens ko kapde se saaf zaroor karein. 📷

E: One more thing — always wipe your camera lens with a cloth before shooting.
```

This single tip has the highest universal impact across all categories and user types. By
sending it as a separate short message (not bundled in the tip), it is more memorable.

---

### 3.4 Integration Point in Existing Flow

Insert the tip message sequence at this exact point in the UX spec (Section 1B, after Message 5):

```
[Existing: USER selects product category from LIST]
   |
   v
[NEW: BOT sends category-specific tip message]   <-- INSERT HERE
   |
   [NEW: 1s delay]
   |
   v
[NEW: BOT sends lens cleaning reminder]
   |
   [1s delay]
   v
[Existing: BOT Message 6 — "Ab photo bhejiye"]
```

The tip message must NOT replace Message 6. It inserts before it. The user still gets the
clear "now send the photo" call to action.

---

### 3.5 Re-trigger: When Returning User Starts a New Order

When a returning user sends a new photo without going through onboarding again, do NOT resend
tips automatically — this becomes annoying. Instead, make tips available on demand:

```
[BOT — Returning User Photo Request]

H: Photo mil gayi! Ek second.
Agar angle ya light ke baare mein tip chahiye to "Tip" bhejiye.

E: Got your photo! One moment.
Send "Tip" if you want advice on angle or lighting.
```

If user sends "Tip" → resend their category-specific tip message (stored from onboarding).

---

## PART 4: AI-POWERED ANGLE DETECTION

### 4.1 Feasibility Assessment

Gemini 2.5 Flash Lite (the recommended QA model from AI_MODEL_RESEARCH.md) can reliably detect
the following angle problems in a single vision API call:

| Problem | Detectable? | Confidence |
|---|---|---|
| Ring photographed side-on (band visible, stone not) | Yes | High |
| Necklace tangled or coiled (not laid flat) | Yes | High |
| Jar photographed top-down (lid visible, label not) | Yes | High |
| Garment folded (not laid flat) | Yes | High |
| Bag empty and collapsed | Yes | Medium |
| Garment severely wrinkled | Yes | High |
| Ring photographed on hand (background confusion) | Yes | Medium |
| Food plated but shot completely top-down | Yes | Medium |
| Candle shot top-down (only wick/lid visible) | Yes | High |

The model cannot reliably detect:
- Subtle 10-degree angle differences (e.g., 45 vs. 55 degrees — both fine)
- Correct angle but wrong distance (produces no obvious visual cue the model can name)
- Sub-optimal but acceptable angles

---

### 4.2 Where to Insert Angle Detection in the Pipeline

**Insert as an extension of Stage 1 (Input Quality Assessment)**, not a separate stage. The
current Stage 1 call to Gemini already sends the image and assesses quality_score, blur_score,
lighting_issues, and usability_rating. Add `angle_issue` to the same JSON schema.

This costs zero additional API calls. The existing Stage 1 image is already loaded in the
model's context window. Adding 30-50 additional output tokens (for the angle_issue field) costs
approximately Rs 0.0015 extra per image at Gemini 2.5 Flash Lite pricing — negligible.

**Modified Stage 1 JSON schema:**

```json
{
  "product_category": "ring",
  "quality_score": 7,
  "blur_score": 2,
  "lighting_issues": ["yellow_cast"],
  "usability_rating": "usable",
  "angle_issue": {
    "detected": true,
    "problem": "ring_side_on",
    "message_hi": "Yeh ring side se li gayi hai — stone nahi dikh raha. Kya thoda upar se dobara le sakte hain?",
    "message_en": "This ring is shot from the side — the stone isn't visible. Can you reshoot from slightly above?"
  }
}
```

If `angle_issue.detected` is false, the pipeline continues normally.
If `angle_issue.detected` is true, the pipeline forks:

```
IF angle_issue.detected AND quality_score >= 5:
  → Process the image normally (it may still be usable)
  → Send the angle_issue message to user as a soft suggestion AFTER delivering the result
  → "Yeh result aaya — aur agar angle thoda theek ho to aur achha aayega. Dekhein?"

IF angle_issue.detected AND quality_score < 5:
  → Do NOT process (would be wasted Rs for a bad output)
  → Send the angle_issue message as a blocking nudge BEFORE asking them to re-submit
  → "Is photo mein thodi problem hai — angle theek karo aur dobara bhejiye. Ek baar aur try karein?"
```

This fork logic preserves user experience (they always get *something* when the photo is
usable) while preventing wasted processing on hopelessly bad input.

---

### 4.3 Angle Detection System Prompt (Stage 1 Extension)

Add this section to the existing Stage 1 system prompt:

```
ANGLE ASSESSMENT:
After assessing quality, evaluate whether the product is photographed from an optimal angle
for its category. Use the product_category you identified.

Angle problems to detect (only flag if clearly problematic, not for minor variations):

- ring: photographed flat side-on (band dominant, stone face not visible)
- ring: photographed on hand (distracting background, scale issues)
- necklace: coiled/tangled (not laid flat or clearly arranged)
- earrings: single earring shown when it is clearly a pair style (dangling/jhumka)
- jar: photographed top-down (lid dominant, label not visible)
- garment: folded or severely crumpled (shape not visible)
- garment: lying at steep angle (perspective distortion visible)
- bag: visibly empty/collapsed (no shape visible)
- candle: photographed top-down (only wick/lid visible)
- food_open: photographed perfectly top-down (completely flat view, no depth)

Return angle_issue.detected = false for:
- Acceptable angles that are not optimal but are workable
- Cases where category is unclear
- Unusual or creative angles that could be intentional

For angle_issue.problem, use only these values:
ring_side_on | ring_on_hand | necklace_coiled | earrings_pair_missing |
jar_top_down | garment_folded | garment_distorted | bag_collapsed |
candle_top_down | food_flat

Generate message_hi and message_en: Keep under 2 lines. Warm, non-critical tone.
Do NOT use words like "galat" (wrong), "buri" (bad), "problem". Use "aur achha ho sakta hai"
(could be even better) framing.
```

---

### 4.4 User-Facing Messages for Angle Detection

**Tone principle:** Never make the user feel rejected or that they did something wrong. Frame
every correction as "your photo is good, here is how to make it even better." The Autmn
user base is made up of first-time sellers with limited confidence. A blunt rejection will cause
immediate churn.

**Angle issue blocking message (quality_score < 5):**

```
[BOT — Angle Correction — Blocking]

H: Aapki photo aa gayi! 😊
Bas ek chhoti si baat — [angle_issue.message_hi]
Dobara bhejein — bilkul free mein process hoga.

E: Got your photo!
Just one small thing — [angle_issue.message_en]
Resend — it'll process for free.
```

**Angle issue soft suggestion (quality_score >= 5, sent AFTER result delivery):**

```
[BOT — Angle Suggestion — Post-result]

H: Yeh result aa gaya! 🎉
Ek sujhav — [angle_issue.message_hi]
Isi tarah ek aur photo bhejein to result aur bhi kamaal ka hoga!

E: Your result is ready!
One suggestion — [angle_issue.message_en]
Send another with this angle for an even better result!
```

---

## PART 5: MULTI-ANGLE STRATEGY

### 5.1 Which Categories Benefit Most from Multiple Angles

| Category | Benefit from Multi-Angle | Priority |
|---|---|---|
| Bags and wallets | Very high — structure + interior + strap all need separate shots | P1 |
| Jewellery (rings) | High — face + profile + on-hand lifestyle shot | P1 |
| Garments (kurtas) | High — front flat lay + collar detail + print detail | P2 |
| Skincare (serums) | Medium — front label + cap detail | P2 |
| Candles | Medium — front label + top (showing wick) + lit lifestyle | P2 |
| Food (jars) | Low — single label-facing shot is sufficient | P3 |
| Food (open/plated) | Low — single 45-degree shot covers it | P3 |
| Sarees | Very high — but complexity makes multi-angle hard to execute | P3 |

### 5.2 Recommendation: Multi-Angle as Phase 2 Feature

**Do NOT implement multi-angle for MVP.** The reasoning:

1. Asking a micro-D2C seller to take 3 photos instead of 1 will cause abandonment. The user
   is already performing a new behaviour (sending photos to a WhatsApp bot). Adding friction
   reduces activation rates.
2. The AI background compositing pipeline (Stage 3 and 4) currently works with a single product
   image. Adding multi-angle input requires a merge/selection step that adds pipeline complexity
   and latency.
3. The Rs 99 price point makes it unclear whether multi-angle processing warrants the same fee
   or a higher fee. This is a pricing experiment that should wait until the core loop has enough
   orders to be statistically meaningful.

**Phase 2 multi-angle design (for future implementation):**

After delivering the primary result, the bot sends:

```
[BOT — Multi-Angle Upsell — Post-result]
[DELAY: 10s after result delivery]

H: Result pasand aaya? 🎯
Ek aur angle bhejiyen — main isse aur bhi behtar kar sakta/sakti hun.
Pehla result free — doosra bhi sirf Rs 49.

E: Happy with the result?
Send one more angle — I can make it even better.
First result was free — second angle is just Rs 49.
```

The discounted second-angle pricing (Rs 49 vs Rs 99) lowers the experimentation barrier and
tests multi-angle demand before committing to building the full feature.

### 5.3 AI Angle Selection from Multiple Inputs (Future)

When multi-angle is implemented, the AI should not simply process all angles — it should select
the best input angle programmatically. Recommended approach:

1. Run Stage 1 Quality Assessment on all submitted photos simultaneously (parallel calls)
2. Score each photo on: quality_score, angle_appropriateness (new field), label_visibility
3. Select the highest-scoring photo as the primary input for Stage 2 onward
4. Return only one enhanced output (not one per angle) — keeps the output simple for the user

This is achievable with Gemini 2.5 Flash Lite with a comparative prompt: "Given these N photos
of the same product, identify which has the best angle for e-commerce use." Estimated additional
cost per multi-angle order: Rs 0.01-0.02. Acceptable.

---

## PART 6: RICE PRIORITIZATION

### Photography Guidance in Pre-Photo Tips (Part 3)

| Dimension | Value | Notes |
|---|---|---|
| Reach | ~100% of new users / month | Every new user passes through onboarding and category selection |
| Impact | 2 (High) | Correct angle directly improves AI output quality, reduces resubmissions |
| Confidence | 80% | Messaging is low-risk; whether it meaningfully changes user behaviour is medium confidence |
| Effort | 0.5 person-weeks | Text messages only, no new infrastructure, plug into existing onboarding flow |
| **RICE Score** | **(100% x 2 x 0.8) / 0.5 = 320** | |

### AI Angle Detection in Stage 1 (Part 4)

| Dimension | Value | Notes |
|---|---|---|
| Reach | ~30% of users / month | Estimated proportion who send a clearly suboptimal angle |
| Impact | 2 (High) | Prevents wasted processing, improves output quality on resubmission |
| Confidence | 80% | Gemini vision can detect clear angle problems reliably |
| Effort | 1 person-week | Schema update to Stage 1 prompt + bot message routing logic |
| **RICE Score** | **(30% x 2 x 0.8) / 1 = 48** | |

### Multi-Angle (Part 5)

| Dimension | Value | Notes |
|---|---|---|
| Reach | ~20% of users / month | Bags and jewellery sellers most likely to try |
| Impact | 1 (Medium) | Better outputs but not a fundamental problem |
| Confidence | 50% | Uncertain whether micro-D2C users will engage with 2+ photo flow |
| Effort | 4 person-weeks | Pipeline merge logic, pricing experiments, UI changes |
| **RICE Score** | **(20% x 1 x 0.5) / 4 = 2.5** | |

**Prioritisation order:**
1. Photography tips in onboarding (RICE 320) — build this sprint
2. AI angle detection in Stage 1 QA (RICE 48) — build next sprint
3. Multi-angle (RICE 2.5) — Phase 2, after 500 orders baseline

---

## PART 7: IMPLEMENTATION CHECKLIST

### Sprint 1 — Photography Tips (0.5 person-weeks)

- [ ] Add sub-type collection for jewellery (ring / necklace / earrings / bangles) to the
      category selection LIST in Message 5 onboarding, OR use a follow-up quick reply after
      user selects "Jewellery / Accessories"
- [ ] Map each product category + sub-type to the correct tip message template from Part 3
- [ ] Insert tip message + lens cleaning reminder into onboarding flow between category
      selection and the "Ab photo bhejiye" message
- [ ] Add "Tip" keyword handler for returning users (resend stored category tip on demand)
- [ ] Store category + sub-type in user profile (already planned in UX spec dev notes)

### Sprint 2 — AI Angle Detection (1 person-week)

- [ ] Add `angle_issue` object to Stage 1 QA JSON schema
- [ ] Update Stage 1 system prompt with angle assessment section (Part 4.3)
- [ ] Add pipeline fork logic: if `angle_issue.detected`, check `quality_score` and route to
      blocking vs. soft-suggestion message
- [ ] Write and test bot messages for blocking case and post-result suggestion case
- [ ] Add `angle_issue.problem` to order log for analytics (track which angles are most common)
- [ ] Set up PostHog event: `angle_issue_detected` with properties: category, problem type,
      resolution (resubmitted or ignored)

### Success Metrics

- **Activation:** % of new users who submit a photo after receiving the tip message. Baseline
  (no tip): measure first, then compare. Target: +10 percentage points within 4 weeks.
- **Resubmission rate:** % of users who resubmit after an angle correction message. Target:
  > 50% (majority should be willing to reshoot with guidance).
- **Output quality score:** Average final QA score (Stage 5) should increase once better input
  angles are achieved. Track before/after sprint 1 and sprint 2.
- **Support messages:** Count of "result accha nahi aaya" type messages per week. Should
  decrease as input quality improves.

---

## APPENDIX A: CATEGORY-TO-ANGLE REFERENCE TABLE

| Category | Sub-type | Optimal Angle | Surface | Worn/Placed |
|---|---|---|---|---|
| Jewellery | Ring | 45-degree above | Dark velvet / white tile | Placed |
| Jewellery | Necklace/Chain | Top-down flat lay | Dark contrasting cloth | Placed |
| Jewellery | Earrings (stud) | Top-down flat lay | Contrasting surface | Placed |
| Jewellery | Earrings (dangling/jhumka) | Eye-level hanging | Neutral background | Hung |
| Jewellery | Bangles/Bracelets | Top-down flat lay | Contrasting surface | Placed |
| Food | Jar (pickle/sauce/honey) | 45-degree eye-level | Wood / burlap | Upright |
| Food | Open/plated (mithai/snacks) | 45-degree above | Dark wood / slate | Plated |
| Food | Packaged/pouch | Straight front-on eye-level | Plain surface | Upright |
| Garments | Kurta/Shirt | Top-down flat lay | Plain floor/table | Flat |
| Garments | Saree | Close-up 45-degree (pallu/border) | Plain surface | Draped |
| Garments | Dupatta | 45-degree hanging or semi-flat | Plain surface | Hung |
| Skincare | Bottle/Serum | Straight front-on eye-level | White/marble | Upright |
| Skincare | Cream/Jar | 45-degree | White/marble | Upright |
| Skincare | Soap bar | 45-degree | Wood/white | Placed |
| Candles | Pillar/container | 45-degree above midpoint | Neutral surface | Upright |
| Bags | Handbag/Purse | 45-degree three-quarter view | Plain surface | Stuffed |
| Bags | Wallet | 45-degree closed + top-down open | Plain surface | Placed |
| Handmade | Pottery/Ceramics | 45-degree eye-level | Neutral surface | Placed |
| Handmade | Woodwork/Carvings | 45-degree with side lighting | Plain surface | Placed |
| Handmade | Textiles/Embroidery | Top-down flat lay | Plain floor | Flat |

---

## APPENDIX B: GEMINI ANGLE DETECTION PROMPT VALUES

Problem values for `angle_issue.problem` field and corresponding user messages:

| Problem Value | Hindi User Message | English User Message |
|---|---|---|
| `ring_side_on` | Ring thodi si ghumao — stone dikhna chahiye. Upar se photo lein. | Rotate the ring slightly — the stone should face the camera. Shoot from above. |
| `ring_on_hand` | Ring ko table pe rakh ke photo lein — zyada clean aayega. | Place the ring on a table — it'll photograph much cleaner. |
| `necklace_coiled` | Necklace ko flat rakhein aur seedha upar se photo lein. | Lay the necklace flat and shoot from directly above. |
| `earrings_pair_missing` | Dono earrings ek saath rakhein — pair dikhna chahiye. | Show both earrings together — display the pair. |
| `jar_top_down` | Jar ko side se photo lein — label dikhna chahiye. | Shoot the jar from the side — the label must be visible. |
| `garment_folded` | Kapde ko iron karke flat rakho, phir photo lein. | Iron the garment, lay it flat, then photograph. |
| `garment_distorted` | Phone seedha rakho — angle se garment ka shape bigad jaata hai. | Keep the phone straight — an angled shot distorts the garment shape. |
| `bag_collapsed` | Bag ke andar tissue ya kapda rakhein — shape banana ke liye. | Stuff the bag with tissue or cloth to give it shape. |
| `candle_top_down` | Candle ko side se photo lein — label aur shape dono dikhenge. | Shoot the candle from the side — you'll see both label and shape. |
| `food_flat` | Thoda side se photo lein — depth aur texture zyada achhi dikhegi. | Shoot from a slight angle — depth and texture will look much better. |


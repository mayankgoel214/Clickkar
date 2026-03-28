# WhatsAds — AI Model Cost Research
**Date:** March 27, 2026
**Purpose:** Find the cheapest viable AI models for every stage of the WhatsAds pipeline
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
- **Verdict:** 13x cheaper than Haiku 4.5. Best cost option in the Gemini family for this task. Recommended for most WhatsAds image assessments.

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
- **Verdict:** For WhatsAds, this is actually very interesting — you can pass the product cutout and generate a background around it in one call, rather than separate generation + compositing steps. Test this workflow.

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
- **Verdict:** Not suitable for WhatsAds product use case.

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
- **Verdict:** WORTH EVALUATING. If priced at $0.01-0.02/image, it may be cheaper than a full DIY pipeline AND produce better results. Request pricing directly. The Product Beautifier feature could handle the entire WhatsAds workflow.

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

No current end-to-end tool provides a clear cost AND quality win over a DIY pipeline for the specific WhatsAds use case (WhatsApp product photo → branded product shot). The DIY pipeline gives you more control and is likely cheaper. PhotoRoom API is the one exception worth evaluating — their Product Beautifier may handle the entire job.

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

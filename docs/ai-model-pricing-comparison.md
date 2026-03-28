# AI Model Pricing Comparison for WhatsAds
## Last Updated: March 2026

### Use Cases

**Task 1 — Image Quality Assessment (VISION model required)**
Given a product photo, output structured JSON: product category, quality score, usability, issues.
Token budget: ~1,500 input tokens (image) + 100 text tokens + 200 output tokens = **1,600 in / 200 out**

**Task 2 — Instruction Parsing (TEXT model, Hindi/English understanding)**
Parse mixed Hindi/English instructions like "isko festive background do" into structured JSON edit commands.
Token budget: ~100 input tokens + 100 output tokens = **100 in / 100 out**

---

## VISION MODELS — Cost Per Single Image Assessment

Assumptions: 1,600 input tokens + 200 output tokens per request.

| # | Model | Provider | Input $/1M | Output $/1M | Cost/Image | Hindi? | Vision Quality | Notes |
|---|-------|----------|-----------|------------|------------|--------|---------------|-------|
| 1 | **Qwen 2.5 VL 7B** | SiliconFlow | $0.05 | $0.05 | **$0.000090** | Good | Good for structured tasks | Cheapest vision API available. $0.05/M blended. |
| 2 | **Gemini 2.0 Flash Lite** | Google AI | $0.075 | $0.30 | **$0.000180** | Good | Good | DEPRECATED June 2026. Do not use for new projects. |
| 3 | **Gemini 2.5 Flash Lite** | Google AI | $0.10 | $0.40 | **$0.000240** | Good | Good | Successor to 2.0 Flash Lite. Best value from Google. |
| 4 | **Gemini 2.0 Flash** | Google AI | $0.10 | $0.40 | **$0.000240** | Good | Very Good | DEPRECATED June 2026. Migrate to 2.5 Flash Lite. |
| 5 | **Groq Llama 4 Scout** | Groq | $0.11 | $0.34 | **$0.000244** | Good (Hindi in training) | Good, native multimodal | 17B MoE, up to 5 images. Very fast inference (~460 tok/s). |
| 6 | **Pixtral 12B** | Mistral AI | $0.15 | $0.15 | **$0.000270** | Moderate | Good | Uniform in/out pricing. 128K context. |
| 7 | **GPT-4o mini** | OpenAI | $0.15 | $0.60 | **$0.000360** | Very Good | Very Good | Proven quality. Good structured output. |
| 8 | **Fireworks Llama 3.2 11B Vision** | Fireworks | $0.20 | $0.20 | **$0.000360** | Moderate | Good | Images counted as ~6,400 tokens. Actual cost may be higher. |
| 9 | **Qwen 2.5 VL 32B** | DeepInfra | $0.20 | $0.60 | **$0.000440** | Good | Very Good | Best open-source vision quality. |
| 10 | **Moondream 3** | Moondream Cloud | $0.30 | $2.50 | **$0.000980** | Poor | Moderate | Tiny model, fast. $5 free monthly credits. Not for Hindi. |
| 11 | **GPT-4.1 mini** | OpenAI | $0.40 | $1.60 | **$0.000960** | Excellent | Excellent | Best quality. 83% cheaper than GPT-4o. 1M context. |
| 12 | **Gemini 2.5 Flash** | Google AI | $0.30 | $2.50 | **$0.000980** | Good | Excellent | Thinking/reasoning model. Overkill for assessment? |
| 13 | **Claude 3.5 Haiku** | Anthropic | $0.80 | $4.00 | **$0.002080** | Very Good | Very Good | Baseline comparison. Reliable structured output. |

### Key Takeaways — Vision

1. **Best value: Gemini 2.5 Flash Lite** at $0.000240/image — cheapest non-deprecated Google option with vision support
2. **Best quality/price: GPT-4o mini** at $0.000360/image — proven vision quality, great Hindi, excellent structured JSON
3. **Cheapest absolute: Qwen 2.5 VL 7B on SiliconFlow** at $0.000090/image — but SiliconFlow is a Chinese provider (latency/reliability concerns from India)
4. **Best for speed: Groq Llama 4 Scout** at $0.000244/image — fastest inference, native multimodal, supports Hindi
5. **Avoid: Gemini 2.0 Flash / Flash Lite** — both deprecated June 2026

---

## TEXT MODELS — Cost Per Instruction Parse

Assumptions: 100 input tokens + 100 output tokens per request.

| # | Model | Provider | Input $/1M | Output $/1M | Cost/Parse | Hindi Quality | Notes |
|---|-------|----------|-----------|------------|------------|--------------|-------|
| 1 | **Groq Llama 3.1 8B** | Groq | $0.05 | $0.08 | **$0.000013** | Moderate | Ultra-fast. May struggle with Hinglish nuances. |
| 2 | **Gemini 2.0 Flash Lite** | Google AI | $0.075 | $0.30 | **$0.000038** | Good | DEPRECATED June 2026. |
| 3 | **DeepSeek V3** | DeepSeek | $0.14 | $0.28 | **$0.000042** | Good | Cheapest capable model. Chinese provider. |
| 4 | **Cerebras Llama 3.1 8B** | Cerebras | $0.10 | $0.10 | **$0.000020** | Moderate | Blazing fast. Free tier: 24M tokens/day. |
| 5 | **Gemini 2.5 Flash Lite** | Google AI | $0.10 | $0.40 | **$0.000050** | Good | Best Google value. Good Hindi. |
| 6 | **Groq Llama 4 Scout** | Groq | $0.11 | $0.34 | **$0.000045** | Good | Can handle vision + text. Single model for both tasks. |
| 7 | **GPT-4o mini** | OpenAI | $0.15 | $0.60 | **$0.000075** | Very Good | Proven Hinglish understanding. Reliable JSON. |
| 8 | **Pixtral 12B** | Mistral AI | $0.15 | $0.15 | **$0.000030** | Moderate | Decent but not optimized for Hindi. |
| 9 | **GPT-4.1 mini** | OpenAI | $0.40 | $1.60 | **$0.000200** | Excellent | Best Hindi/Hinglish. Overkill for simple parsing. |
| 10 | **Claude 3.5 Haiku** | Anthropic | $0.80 | $4.00 | **$0.000480** | Very Good | Expensive for this task. Baseline only. |

### Key Takeaways — Text Parsing

1. **Best value: Groq Llama 3.1 8B** at $0.000013/parse — but test Hindi quality first
2. **Best Hindi quality/price: GPT-4o mini** at $0.000075/parse — proven Hinglish understanding
3. **Single-model option: Groq Llama 4 Scout** at $0.000045/parse — handles BOTH vision and text, simplifies architecture

---

## SPEECH-TO-TEXT MODELS — For Voice Note Processing

| # | Model | Provider | Price/Hour | Price/Min | Price/10s msg | Notes |
|---|-------|----------|-----------|----------|--------------|-------|
| 1 | **fal.ai Wizper (Whisper v3)** | fal.ai | $0.03 | $0.0005 | **$0.000083** | $0.50/1000 minutes. 20x cheaper than OpenAI. |
| 2 | **Groq Distil-Whisper** | Groq | $0.02 | $0.00033 | **$0.000056** | English only. 240x real-time. Min 10s charge. |
| 3 | **Groq Whisper Large v3 Turbo** | Groq | $0.04 | $0.00067 | **$0.000111** | Multilingual. 216x real-time. Min 10s charge. |
| 4 | **Groq Whisper Large v3** | Groq | $0.111 | $0.00185 | **$0.000308** | Full model. Best accuracy. Min 10s charge. |
| 5 | **Sarvam AI STT** | Sarvam AI | $0.35 | $0.00583 | **$0.000972** | Indian languages specialist. Hindi-optimized. |
| 6 | **Sarvam AI STT + Diarization** | Sarvam AI | $0.53 | $0.00883 | **$0.001472** | Speaker identification. Credits never expire. |

### Key Takeaways — Speech-to-Text

1. **Cheapest: Groq Distil-Whisper** at $0.02/hr — but English only
2. **Best for Hindi voice notes: Groq Whisper Large v3 Turbo** at $0.04/hr — multilingual, incredibly fast
3. **Best Hindi accuracy: Sarvam AI** at $0.35/hr — purpose-built for Indian languages, 10x more expensive but potentially better Hindi accuracy

---

## RECOMMENDED ARCHITECTURE FOR WhatsAds

### Option A: Minimize Cost (Single Provider)
Use **Gemini 2.5 Flash Lite** for everything (vision + text parsing):
- Image assessment: $0.000240/photo
- Instruction parsing: $0.000050/instruction
- **Total per order (1 photo + 3 instructions): ~$0.000390**
- **Cost per 1,000 orders: $0.39**
- Voice notes: Groq Whisper Large v3 Turbo at $0.04/hr

### Option B: Best Quality/Price Mix
- Vision: **GPT-4o mini** — $0.000360/photo (proven quality, excellent Hindi, reliable JSON)
- Text parsing: **Groq Llama 4 Scout** — $0.000045/instruction (fast, cheap, decent Hindi)
- Voice: **Groq Whisper Large v3 Turbo** — $0.04/hr
- **Total per order (1 photo + 3 instructions): ~$0.000495**
- **Cost per 1,000 orders: $0.50**

### Option C: Single Model Simplicity
Use **Groq Llama 4 Scout** for both vision AND text:
- All tasks: $0.11 in / $0.34 out per 1M tokens
- Image assessment: $0.000244/photo
- Instruction parsing: $0.000045/instruction
- **Total per order (1 photo + 3 instructions): ~$0.000379**
- **Cost per 1,000 orders: $0.38**
- Voice: Groq Whisper Large v3 Turbo at $0.04/hr
- Pros: Single provider (Groq), single model, simple architecture, very fast
- Cons: Newer model, Hindi quality needs testing vs GPT-4o mini

### Option D: Absolute Cheapest
- Vision: **Qwen 2.5 VL 7B on SiliconFlow** — $0.000090/photo
- Text: **Cerebras Llama 3.1 8B** — $0.000020/instruction
- Voice: **Groq Distil-Whisper** — $0.02/hr (English-only, use Turbo for Hindi)
- **Total per order: ~$0.000150**
- **Cost per 1,000 orders: $0.15**
- Cons: Multiple providers, Chinese hosting for SiliconFlow, Hindi quality unknown

---

## SCALE PROJECTIONS

| Scale | Option A (Gemini) | Option B (GPT+Groq) | Option C (Groq Scout) | Option D (Cheapest) |
|-------|------------------|---------------------|----------------------|-------------------|
| 100 orders/day | $1.17/mo | $1.50/mo | $1.14/mo | $0.45/mo |
| 1,000 orders/day | $11.70/mo | $15.00/mo | $11.40/mo | $4.50/mo |
| 10,000 orders/day | $117/mo | $150/mo | $114/mo | $45/mo |
| 100,000 orders/day | $1,170/mo | $1,500/mo | $1,140/mo | $450/mo |

*Note: Voice note costs are additional. Assuming 20% of users send voice notes averaging 10 seconds each, add ~$0.01-0.05/mo per 1,000 orders.*

---

## FREE TIERS WORTH NOTING

| Provider | Free Tier |
|----------|-----------|
| **Google Gemini** | Free tier available for all models (rate-limited) |
| **Cerebras** | 24M tokens/day free (~$48/day value) |
| **Groq** | Free tier with rate limits |
| **Moondream** | $5 free monthly credits |
| **DeepSeek** | 5M free tokens on signup (30-day expiry) |
| **Together AI** | Free Llama 3.2 11B Vision endpoint (non-commercial) |
| **SiliconFlow** | Free tier for Qwen 2.5 VL 7B |

---

## Sources

- [Google Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API Pricing](https://platform.openai.com/docs/pricing)
- [Groq Pricing](https://groq.com/pricing)
- [Fireworks AI Pricing](https://fireworks.ai/pricing)
- [Together AI Pricing](https://www.together.ai/pricing)
- [Cerebras Pricing](https://www.cerebras.ai/pricing)
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Mistral AI Pricing](https://mistral.ai/pricing)
- [Moondream Pricing](https://moondream.ai/pricing)
- [Sarvam AI Pricing](https://www.sarvam.ai/api-pricing)
- [fal.ai Whisper](https://fal.ai/models/fal-ai/whisper)
- [Qwen 2.5 VL 7B on SiliconFlow](https://www.siliconflow.com/models/qwen-qwen2-5-vl-7b-instruct)
- [GPT-4.1 Mini Pricing](https://pricepertoken.com/pricing-page/model/openai-gpt-4.1-mini)
- [Groq Llama 4 Scout](https://groq.com/blog/llama-4-now-live-on-groq-build-fast-at-the-lowest-cost-without-compromise)
- [PricePerToken.com](https://pricepertoken.com/)
- [Artificial Analysis](https://artificialanalysis.ai/providers)

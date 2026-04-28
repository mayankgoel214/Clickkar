# Pipeline archive

Historical / alternate pipelines kept for reference only. **None of these are called at runtime.**

The production path is `pipeline/production.ts` (Beta prompt + Pro → NB2 → GPT Image 2 fallback chain).

## What's here

- `gemini-pipeline-v5.ts` — V5 pipeline with full/lean/skinny/beta modes, 4-candidate over-gen, best-of QA. Replaced by simpler single-shot production pipeline on 2026-04-23.
- `art-director.ts` — per-product LLM-generated creative briefs. Unused — simpler prompts produce better results.
- `composition-library.ts` — scene-seed rotation for variety. Unused — trust the model.
- `content-safety.ts` — pre-flight LLM safety check. Unused — rely on Gemini's built-in filter.
- `metrics.ts` — pipeline metrics emission. Superseded by `cost-tracker.ts` in production.
- `composite-engine.ts` — product-cutout + AI-background compositing. Unused — DIRECT track only.

Do not import from this folder. If you think you need one of these back, talk to architect first.

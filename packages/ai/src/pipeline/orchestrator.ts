import { assessInputImage } from '../qa/assess.js';
import { checkOutputWithReference } from '../qa/output-check.js';
import { preprocessImage } from './preprocess.js';
import { analyzeProduct, generateAdPrompt } from './product-analyzer.js';
import { runNanoBananaShot } from './nano-banana-shot.js';
import { removeBackground, runFallbackPipeline } from './fallback.js';
import { runProductShot } from './product-shot.js';
import type { InputAssessment } from '../qa/assess.js';
import type { ComparativeAssessment } from '../qa/output-check.js';
import type { ProductAnalysis } from './product-analyzer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessImageParams {
  /** Supabase storage URL of the raw input image */
  imageUrl: string;
  /** Style ID — optional, auto-determined from product analysis */
  style?: string;
  /** Detected or declared product category */
  productCategory?: string;
  /** Parsed voice instruction text to incorporate into the ad prompt */
  voiceInstructions?: string;
  /** Maximum pipeline attempts before returning best result (default: 3) */
  maxAttempts?: number;
}

export interface ProcessImageResult {
  outputUrl: string;
  cutoutUrl?: string;
  qaScore: number;
  pipeline: 'nano_banana' | 'segmentation' | 'bria';
  attempts: number;
  durationMs: number;
  inputAssessment?: InputAssessment;
  productAnalysis?: ProductAnalysis;
  adPrompt?: string;
  rejected?: boolean;
  rejectionReason?: string;
}

// Internal structure for tracking attempt results
interface AttemptRecord {
  outputUrl: string;
  cutoutUrl?: string;
  qaScore: number;
  pipeline: 'nano_banana' | 'segmentation' | 'bria';
  assessment: ComparativeAssessment;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QA_PASS_SCORE = 70;
const QA_FIDELITY_MIN = 25;
const DEFAULT_MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(
      `Failed to download image: ${resp.status} ${resp.statusText} — ${url}`
    );
  }
  return Buffer.from(await resp.arrayBuffer());
}

function isPassingQA(assessment: ComparativeAssessment): boolean {
  return (
    assessment.score >= QA_PASS_SCORE &&
    assessment.productFidelityScore >= QA_FIDELITY_MIN
  );
}

/** Map product analysis to a fallback style ID for the segmentation pipeline */
function deriveStyleFromAnalysis(analysis: ProductAnalysis): string {
  const mood = analysis.recommendedScene.mood.toLowerCase();
  const segment = analysis.priceSegment;

  if (mood.includes('festiv') || mood.includes('celebrat')) return 'festival';
  if (segment === 'luxury' || segment === 'premium') return 'marble_premium';
  if (mood.includes('warm') || mood.includes('cozy') || mood.includes('rustic'))
    return 'warm_lifestyle';
  if (mood.includes('outdoor') || mood.includes('natural') || mood.includes('fresh'))
    return 'outdoor_bokeh';
  if (mood.includes('minimal') || mood.includes('dark') || mood.includes('moody'))
    return 'gradient_minimal';
  if (mood.includes('flat') || mood.includes('overhead') || mood.includes('top'))
    return 'flat_lay';

  return 'clean_white';
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Orchestrate the full product image processing pipeline.
 *
 * Pipeline: messy photo → clean cutout → smart analysis → ad prompt → generation
 *
 * 1. Download + preprocess (sharp)
 * 2. Assess input quality (Gemini) — reject if unusable
 * 3. Remove background (BiRefNet v2) — clean product cutout
 * 4. Deep product analysis + Ad prompt generation (parallel with step 3 analysis)
 * 5. Attempt 1: Nano Banana 2 with CLEAN CUTOUT + tailored prompt
 * 6. Attempt 2: Segmentation pipeline (cutout already available)
 * 7. Attempt 3: Bria Product Shot (last resort)
 * 8. Return best result by comparative QA score
 */
export async function processProductImage(
  params: ProcessImageParams
): Promise<ProcessImageResult> {
  const totalStart = Date.now();
  const maxAttempts = params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const attempts: AttemptRecord[] = [];
  const stageTiming: Record<string, number> = {};

  // -------------------------------------------------------------------------
  // Stage 1: Download + preprocess
  // -------------------------------------------------------------------------

  const dlStart = Date.now();
  let rawBuffer: Buffer;
  try {
    rawBuffer = await downloadBuffer(params.imageUrl);
  } catch (err) {
    throw new Error(
      `Cannot download input image: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const { buffer: processedBuffer } = await preprocessImage(rawBuffer);
  stageTiming['preprocess'] = Date.now() - dlStart;

  console.info(
    JSON.stringify({
      event: 'orchestrator_preprocessed',
      durationMs: stageTiming['preprocess'],
    })
  );

  // -------------------------------------------------------------------------
  // Stage 2: Input quality assessment
  // -------------------------------------------------------------------------

  const qaInStart = Date.now();
  const inputAssessment = await assessInputImage(processedBuffer);
  stageTiming['input_assessment'] = Date.now() - qaInStart;

  if (!inputAssessment.usable) {
    console.warn(
      JSON.stringify({
        event: 'orchestrator_input_rejected',
        reason: inputAssessment.rejectionReason,
        durationMs: Date.now() - totalStart,
      })
    );

    return {
      outputUrl: '',
      qaScore: 0,
      pipeline: 'nano_banana',
      attempts: 0,
      durationMs: Date.now() - totalStart,
      inputAssessment,
      rejected: true,
      rejectionReason: inputAssessment.rejectionReason ?? 'Image quality too low',
    };
  }

  // Keep the preprocessed input buffer for comparative QA
  const inputBufferForQA = processedBuffer;

  // -------------------------------------------------------------------------
  // Stage 3: Background removal + Deep analysis + Ad prompt (PARALLEL)
  //
  // These three are independent and can run at the same time:
  // - BiRefNet removes background → clean cutout URL
  // - Gemini analyzes the product → structured analysis
  // - (Ad prompt depends on analysis, so it runs after)
  // -------------------------------------------------------------------------

  const parallelStart = Date.now();

  // Start background removal and product analysis in parallel
  const [cutoutUrl, analysis] = await Promise.all([
    removeBackground(params.imageUrl).catch((err) => {
      console.error(
        JSON.stringify({
          event: 'orchestrator_bg_removal_error',
          error: err instanceof Error ? err.message : String(err),
        })
      );
      return null; // Continue without cutout — will use raw image
    }),
    analyzeProduct(processedBuffer).catch((err) => {
      console.error(
        JSON.stringify({
          event: 'orchestrator_analysis_error',
          error: err instanceof Error ? err.message : String(err),
        })
      );
      // Fallback analysis
      const fallback: ProductAnalysis = {
        productName: 'Product',
        brandName: null,
        productType: inputAssessment.productCategory ?? 'other',
        specificDescription: 'A product item',
        dominantColors: ['neutral'],
        material: 'unknown',
        shape: 'standard',
        keyVisualElements: [],
        visibleText: [],
        targetAudience: 'general consumers',
        priceSegment: 'mid_range',
        salesChannel: 'online marketplace',
        desiredEmotion: 'trust',
        recommendedScene: {
          surface: 'clean white surface',
          background: 'soft gradient background',
          lighting: 'soft diffused studio lighting',
          colorPalette: 'neutral whites and grays',
          props: [],
          mood: 'clean and professional',
          photographyStyle: 'e-commerce product photography',
        },
        category: (inputAssessment.productCategory as ProductAnalysis['category']) ?? 'other',
      };
      return fallback;
    }),
  ]);

  stageTiming['parallel_prep'] = Date.now() - parallelStart;

  console.info(
    JSON.stringify({
      event: 'orchestrator_parallel_prep_complete',
      hasCutout: cutoutUrl !== null,
      productName: analysis.productName,
      category: analysis.category,
      durationMs: stageTiming['parallel_prep'],
    })
  );

  // The image URL to use for generation — clean cutout if available, raw otherwise
  const generationImageUrl = cutoutUrl ?? params.imageUrl;

  // Now generate the ad prompt (needs analysis to be done first)
  const promptStart = Date.now();
  let adPrompt: string;
  try {
    adPrompt = await generateAdPrompt(analysis, params.voiceInstructions);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'orchestrator_prompt_error',
        error: err instanceof Error ? err.message : String(err),
      })
    );
    const scene = analysis.recommendedScene;
    adPrompt = `${analysis.productType} on ${scene.surface}, ${scene.background}, ${scene.lighting}, ${scene.mood} mood, ${scene.photographyStyle}`;
  }
  stageTiming['ad_prompt'] = Date.now() - promptStart;

  console.info(
    JSON.stringify({
      event: 'orchestrator_prompt_ready',
      adPrompt,
      usingCutout: cutoutUrl !== null,
      durationMs: stageTiming['ad_prompt'],
    })
  );

  // -------------------------------------------------------------------------
  // Stage 4: Attempt 1 — Nano Banana 2 with CLEAN CUTOUT
  // -------------------------------------------------------------------------

  if (maxAttempts >= 1) {
    const attemptStart = Date.now();
    try {
      const { outputUrl } = await runNanoBananaShot({
        imageUrl: generationImageUrl,
        prompt: adPrompt,
      });

      const outputBuffer = await downloadBuffer(outputUrl);
      const qa = await checkOutputWithReference(inputBufferForQA, outputBuffer);

      stageTiming['attempt_1_nano_banana'] = Date.now() - attemptStart;

      console.info(
        JSON.stringify({
          event: 'orchestrator_attempt_1_nano_banana',
          qaScore: qa.score,
          fidelity: qa.productFidelity,
          fidelityScore: qa.productFidelityScore,
          pass: isPassingQA(qa),
          usedCutout: cutoutUrl !== null,
          durationMs: stageTiming['attempt_1_nano_banana'],
        })
      );

      attempts.push({
        outputUrl,
        cutoutUrl: cutoutUrl ?? undefined,
        qaScore: qa.score,
        pipeline: 'nano_banana',
        assessment: qa,
      });

      if (isPassingQA(qa)) {
        return {
          outputUrl,
          cutoutUrl: cutoutUrl ?? undefined,
          qaScore: qa.score,
          pipeline: 'nano_banana',
          attempts: 1,
          durationMs: Date.now() - totalStart,
          inputAssessment,
          productAnalysis: analysis,
          adPrompt,
        };
      }
    } catch (err) {
      stageTiming['attempt_1_nano_banana'] = Date.now() - attemptStart;
      console.error(
        JSON.stringify({
          event: 'orchestrator_attempt_1_nano_banana_error',
          error: err instanceof Error ? err.message : String(err),
          durationMs: stageTiming['attempt_1_nano_banana'],
        })
      );
    }
  }

  // -------------------------------------------------------------------------
  // Stage 5: Attempt 2 — Segmentation pipeline (cutout already available)
  // -------------------------------------------------------------------------

  if (maxAttempts >= 2) {
    const attemptStart = Date.now();
    try {
      const derivedStyle = params.style ?? deriveStyleFromAnalysis(analysis);

      const { outputUrl, cutoutUrl: segCutoutUrl } = await runFallbackPipeline({
        imageUrl: params.imageUrl,
        style: derivedStyle,
        productCategory: analysis.category,
      });

      const outputBuffer = await downloadBuffer(outputUrl);
      const qa = await checkOutputWithReference(inputBufferForQA, outputBuffer);

      stageTiming['attempt_2_segmentation'] = Date.now() - attemptStart;

      console.info(
        JSON.stringify({
          event: 'orchestrator_attempt_2_segmentation',
          qaScore: qa.score,
          fidelity: qa.productFidelity,
          fidelityScore: qa.productFidelityScore,
          pass: isPassingQA(qa),
          durationMs: stageTiming['attempt_2_segmentation'],
        })
      );

      attempts.push({
        outputUrl,
        cutoutUrl: segCutoutUrl,
        qaScore: qa.score,
        pipeline: 'segmentation',
        assessment: qa,
      });

      if (isPassingQA(qa)) {
        return {
          outputUrl,
          cutoutUrl: segCutoutUrl,
          qaScore: qa.score,
          pipeline: 'segmentation',
          attempts: 2,
          durationMs: Date.now() - totalStart,
          inputAssessment,
          productAnalysis: analysis,
          adPrompt,
        };
      }
    } catch (err) {
      stageTiming['attempt_2_segmentation'] = Date.now() - attemptStart;
      console.error(
        JSON.stringify({
          event: 'orchestrator_attempt_2_segmentation_error',
          error: err instanceof Error ? err.message : String(err),
          durationMs: stageTiming['attempt_2_segmentation'],
        })
      );
    }
  }

  // -------------------------------------------------------------------------
  // Stage 6: Attempt 3 — Bria Product Shot (last resort)
  // -------------------------------------------------------------------------

  if (maxAttempts >= 3) {
    const attemptStart = Date.now();
    try {
      const scene = analysis.recommendedScene;
      const briaPrompt = `${scene.surface}, ${scene.background}, ${scene.lighting}, ${scene.photographyStyle}`;

      const { outputUrl } = await runProductShot({
        imageUrl: params.imageUrl,
        scenePrompt: briaPrompt,
      });

      const outputBuffer = await downloadBuffer(outputUrl);
      const qa = await checkOutputWithReference(inputBufferForQA, outputBuffer);

      stageTiming['attempt_3_bria'] = Date.now() - attemptStart;

      console.info(
        JSON.stringify({
          event: 'orchestrator_attempt_3_bria',
          qaScore: qa.score,
          fidelity: qa.productFidelity,
          fidelityScore: qa.productFidelityScore,
          pass: isPassingQA(qa),
          durationMs: stageTiming['attempt_3_bria'],
        })
      );

      attempts.push({
        outputUrl,
        qaScore: qa.score,
        pipeline: 'bria',
        assessment: qa,
      });

      return {
        outputUrl,
        qaScore: qa.score,
        pipeline: 'bria',
        attempts: 3,
        durationMs: Date.now() - totalStart,
        inputAssessment,
        productAnalysis: analysis,
        adPrompt,
      };
    } catch (err) {
      stageTiming['attempt_3_bria'] = Date.now() - attemptStart;
      console.error(
        JSON.stringify({
          event: 'orchestrator_attempt_3_bria_error',
          error: err instanceof Error ? err.message : String(err),
          durationMs: stageTiming['attempt_3_bria'],
        })
      );
    }
  }

  // -------------------------------------------------------------------------
  // All attempts exhausted — return best
  // -------------------------------------------------------------------------

  if (attempts.length === 0) {
    throw new Error('All pipeline attempts failed with no successful output');
  }

  const best = attempts.reduce((prev, curr) => {
    if (curr.qaScore > prev.qaScore) return curr;
    if (
      curr.qaScore === prev.qaScore &&
      curr.assessment.productFidelityScore > prev.assessment.productFidelityScore
    ) {
      return curr;
    }
    return prev;
  });

  console.warn(
    JSON.stringify({
      event: 'orchestrator_returning_best_attempt',
      bestScore: best.qaScore,
      bestPipeline: best.pipeline,
      bestFidelity: best.assessment.productFidelity,
      totalAttempts: attempts.length,
      durationMs: Date.now() - totalStart,
    })
  );

  return {
    outputUrl: best.outputUrl,
    cutoutUrl: best.cutoutUrl,
    qaScore: best.qaScore,
    pipeline: best.pipeline,
    attempts: attempts.length,
    durationMs: Date.now() - totalStart,
    inputAssessment,
    productAnalysis: analysis,
    adPrompt,
  };
}

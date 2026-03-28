import { assessInputImage } from '../qa/assess.js';
import { checkOutputQuality } from '../qa/output-check.js';
import { preprocessImage } from './preprocess.js';
import { runProductShot } from './product-shot.js';
import { runFallbackPipeline } from './fallback.js';
import { buildScenePrompt } from '../prompts/product-shot.js';
import type { InputAssessment } from '../qa/assess.js';
import type { OutputAssessment } from '../qa/output-check.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessImageParams {
  /** Supabase storage URL of the raw input image */
  imageUrl: string;
  /** Style ID (e.g. clean_white, festival, marble_premium) */
  style: string;
  /** Detected or declared product category */
  productCategory?: string;
  /** Parsed voice instruction text to append to scene prompt */
  voiceInstructions?: string;
  /** Maximum pipeline attempts before returning best result (default: 3) */
  maxAttempts?: number;
}

export interface ProcessImageResult {
  outputUrl: string;
  cutoutUrl?: string;
  qaScore: number;
  pipeline: 'primary' | 'fallback';
  attempts: number;
  durationMs: number;
  inputAssessment?: InputAssessment;
  rejected?: boolean;
  rejectionReason?: string;
}

// Internal structure for tracking attempt results
interface AttemptRecord {
  outputUrl: string;
  cutoutUrl?: string;
  qaScore: number;
  pipeline: 'primary' | 'fallback';
  outputAssessment: OutputAssessment;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QA_PASS_THRESHOLD = 65;
const QA_RETRY_THRESHOLD = 55;
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

/** Slightly adjust the scene prompt on retry to nudge the model */
function buildRetryPrompt(
  basePrompt: string,
  attempt: number
): string {
  const adjustments = [
    ', high detail, photorealistic, sharp focus',
    ', professional product photography, crystal clear, vibrant',
  ];
  const adj = adjustments[attempt - 2]; // attempt 2 → index 0
  return adj ? `${basePrompt}${adj}` : basePrompt;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Orchestrate the full product image processing pipeline.
 *
 * This is the main entry point called by the background worker.
 *
 * Flow:
 * 1. Download + preprocess (sharp)
 * 2. Assess input quality (Gemini) — reject if unusable
 * 3. Attempt 1: Bria Product Shot (primary) — pass if QA score >= 65
 * 4. Attempt 2: Bria Product Shot with adjusted prompt — pass if score >= 55
 * 5. Attempt 3: Fallback pipeline (RMBG + Flux Schnell + compositing)
 * 6. Return best result regardless of score
 */
export async function processProductImage(
  params: ProcessImageParams
): Promise<ProcessImageResult> {
  const totalStart = Date.now();
  const maxAttempts = params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const productCategory = params.productCategory ?? 'other';
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
      style: params.style,
      productCategory,
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
      pipeline: 'primary',
      attempts: 0,
      durationMs: Date.now() - totalStart,
      inputAssessment,
      rejected: true,
      rejectionReason: inputAssessment.rejectionReason ?? 'Image quality too low',
    };
  }

  // Use Gemini-detected category if caller didn't specify
  const resolvedCategory =
    params.productCategory ?? inputAssessment.productCategory ?? 'other';

  // -------------------------------------------------------------------------
  // Stage 3: Build base scene prompt
  // -------------------------------------------------------------------------

  const baseScenePrompt = buildScenePrompt(
    params.style,
    resolvedCategory,
    params.voiceInstructions
  );

  // -------------------------------------------------------------------------
  // Stage 4: Attempt 1 — Primary pipeline (Bria Product Shot)
  // -------------------------------------------------------------------------

  if (maxAttempts >= 1) {
    const attempt1Start = Date.now();
    try {
      const { outputUrl } = await runProductShot({
        imageUrl: params.imageUrl,
        scenePrompt: baseScenePrompt,
      });

      const outputBuffer = await downloadBuffer(outputUrl);
      const qaOut = await checkOutputQuality(outputBuffer);

      stageTiming['attempt_1'] = Date.now() - attempt1Start;

      console.info(
        JSON.stringify({
          event: 'orchestrator_attempt_1',
          qaScore: qaOut.score,
          pass: qaOut.pass,
          durationMs: stageTiming['attempt_1'],
        })
      );

      attempts.push({
        outputUrl,
        qaScore: qaOut.score,
        pipeline: 'primary',
        outputAssessment: qaOut,
      });

      if (qaOut.score >= QA_PASS_THRESHOLD) {
        return {
          outputUrl,
          qaScore: qaOut.score,
          pipeline: 'primary',
          attempts: 1,
          durationMs: Date.now() - totalStart,
          inputAssessment,
        };
      }
    } catch (err) {
      stageTiming['attempt_1'] = Date.now() - attempt1Start;
      console.error(
        JSON.stringify({
          event: 'orchestrator_attempt_1_error',
          error: err instanceof Error ? err.message : String(err),
          durationMs: stageTiming['attempt_1'],
        })
      );
    }
  }

  // -------------------------------------------------------------------------
  // Stage 5: Attempt 2 — Bria Product Shot with adjusted prompt
  // -------------------------------------------------------------------------

  if (maxAttempts >= 2) {
    const attempt2Start = Date.now();
    const retryPrompt = buildRetryPrompt(baseScenePrompt, 2);

    try {
      const { outputUrl } = await runProductShot({
        imageUrl: params.imageUrl,
        scenePrompt: retryPrompt,
      });

      const outputBuffer = await downloadBuffer(outputUrl);
      const qaOut = await checkOutputQuality(outputBuffer);

      stageTiming['attempt_2'] = Date.now() - attempt2Start;

      console.info(
        JSON.stringify({
          event: 'orchestrator_attempt_2',
          qaScore: qaOut.score,
          pass: qaOut.pass,
          durationMs: stageTiming['attempt_2'],
        })
      );

      attempts.push({
        outputUrl,
        qaScore: qaOut.score,
        pipeline: 'primary',
        outputAssessment: qaOut,
      });

      if (qaOut.score >= QA_RETRY_THRESHOLD) {
        return {
          outputUrl,
          qaScore: qaOut.score,
          pipeline: 'primary',
          attempts: 2,
          durationMs: Date.now() - totalStart,
          inputAssessment,
        };
      }
    } catch (err) {
      stageTiming['attempt_2'] = Date.now() - attempt2Start;
      console.error(
        JSON.stringify({
          event: 'orchestrator_attempt_2_error',
          error: err instanceof Error ? err.message : String(err),
          durationMs: stageTiming['attempt_2'],
        })
      );
    }
  }

  // -------------------------------------------------------------------------
  // Stage 6: Attempt 3 — Fallback pipeline (RMBG + Flux + compositing)
  // -------------------------------------------------------------------------

  if (maxAttempts >= 3) {
    const attempt3Start = Date.now();
    try {
      const { outputUrl, cutoutUrl } = await runFallbackPipeline({
        imageUrl: params.imageUrl,
        style: params.style,
        productCategory: resolvedCategory,
      });

      const outputBuffer = await downloadBuffer(outputUrl);
      const qaOut = await checkOutputQuality(outputBuffer);

      stageTiming['attempt_3_fallback'] = Date.now() - attempt3Start;

      console.info(
        JSON.stringify({
          event: 'orchestrator_attempt_3_fallback',
          qaScore: qaOut.score,
          pass: qaOut.pass,
          durationMs: stageTiming['attempt_3_fallback'],
        })
      );

      attempts.push({
        outputUrl,
        cutoutUrl,
        qaScore: qaOut.score,
        pipeline: 'fallback',
        outputAssessment: qaOut,
      });

      // Return fallback result regardless of score — it's our last option
      return {
        outputUrl,
        cutoutUrl,
        qaScore: qaOut.score,
        pipeline: 'fallback',
        attempts: 3,
        durationMs: Date.now() - totalStart,
        inputAssessment,
      };
    } catch (err) {
      stageTiming['attempt_3_fallback'] = Date.now() - attempt3Start;
      console.error(
        JSON.stringify({
          event: 'orchestrator_attempt_3_error',
          error: err instanceof Error ? err.message : String(err),
          durationMs: stageTiming['attempt_3_fallback'],
        })
      );
    }
  }

  // -------------------------------------------------------------------------
  // All attempts exhausted — return the best scoring attempt
  // -------------------------------------------------------------------------

  if (attempts.length === 0) {
    throw new Error('All pipeline attempts failed with no successful output');
  }

  const best = attempts.reduce((prev, curr) =>
    curr.qaScore > prev.qaScore ? curr : prev
  );

  console.warn(
    JSON.stringify({
      event: 'orchestrator_all_attempts_below_threshold',
      bestScore: best.qaScore,
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
  };
}

/**
 * Never-fail pipeline — 3-tier architecture with provider redundancy.
 *
 * Tier 1: gemini-3-pro-image-preview (Nano Banana Pro, $0.134/img)
 *   V5 pipeline, 2 generation attempts + combinedQualityCheck gate.
 *
 * Tier 2: gemini-3.1-flash-image-preview (Nano Banana 2, $0.045/img, 5K/mo free)
 *   Same V5 code path — different Gemini model. Fires when Tier 1 QA fails twice.
 *
 * Tier 3: OpenAI gpt-image-1 (medium quality, $0.034/img)
 *   Different provider entirely — fires when both Gemini models fail / rate-limit.
 *   Same QA gate applied to output.
 *
 * On all tiers failing:
 *   Throws Error with `needs_refund: true` in the message. The worker detects
 *   this marker and marks the order as failed so the founder can trigger a
 *   manual refund. We do NOT ship a BiRefNet cutout, clean studio, or enhanced
 *   original — quality below Tier 3 is unacceptable.
 */

import { processProductImageV5, type ProcessImageV5Params } from './gemini-pipeline-v5.js';
import { openaiGenerateImage } from './openai-generate.js';
import { combinedQualityCheck } from '../qa/combined-qa.js';
import type { ProcessImageParams, ProcessImageResult } from './orchestrator.js';
import { downloadBuffer, uploadToStorage, postProcessFinal, addAILabel } from './fallback.js';
import { lightAnalyze, type LightAnalysis } from './light-analyzer.js';
import { preprocessImage } from './preprocess.js';
import { checkContentSafety } from './content-safety.js';
import type { ProductProfileV4 } from './product-analyzer-v4.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Primary model — Tier 1. Reads GEMINI_IMAGE_MODEL env at call time when absent. */
const TIER1_MODEL = process.env['GEMINI_IMAGE_MODEL'] ?? 'gemini-3-pro-image-preview';

/** Quality-fallback model — Tier 2. Always explicit — never reads env. */
const TIER2_MODEL = 'gemini-3.1-flash-image-preview';

/** Timeout for each Gemini V5 tier (3 minutes). */
const GEMINI_TIER_TIMEOUT_MS = 3 * 60 * 1000;

/** Timeout for the OpenAI Tier 3 path (90 seconds). */
const OPENAI_TIER_TIMEOUT_MS = 90_000;

/** QA pass threshold — mirrors V5 / V3 orchestrator. */
const QA_PASS_SCORE = 65;
const QA_FIDELITY_MIN = 25;

// ---------------------------------------------------------------------------
// Extended params
// ---------------------------------------------------------------------------

export interface NeverFailParams extends ProcessImageParams {
  /** Pre-downloaded reference image buffers for multi-angle orders. */
  referenceImageBuffers?: Buffer[];
  /** Pre-computed product profile from analyzeProductV4() — kept for backward compat, not used by V5. */
  profileV4?: ProductProfileV4;
}

export interface NeverFailResult {
  outputUrl: string;
  /** Always undefined — video generation removed. Kept for worker compatibility. */
  storyUrl?: string;
  /** Always undefined — video generation removed. Kept for worker compatibility. */
  videoUrl?: string;
  cutoutUrl?: string;
  qaScore: number;
  pipeline: string;
  attempts: number;
  durationMs: number;
  tier: 1 | 2 | 3 | 4;
  tierReason?: string;
  outputBuffer?: Buffer;
  inputAssessment?: any;
  rejected?: boolean;
  rejectionReason?: string;
  usedCreativeDirection?: {
    heroMoment: string;
    creativeBrief: string;
    scenePrompt: string;
    dynamicElements: string[];
    emotionalTrigger: string;
    storyScene: string;
    backgroundOnlyPrompt: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

/** Map ProcessImageResult -> NeverFailResult for Gemini tiers. */
function geminiResultToNeverFail(
  result: ProcessImageResult,
  tier: 1 | 2,
  totalStart: number,
  tierReason?: string,
): NeverFailResult {
  return {
    outputUrl: result.outputUrl,
    outputBuffer: result.outputBuffer,
    cutoutUrl: result.cutoutUrl,
    qaScore: result.qaScore,
    pipeline: result.pipeline,
    attempts: result.attempts,
    durationMs: Date.now() - totalStart,
    tier,
    tierReason,
    inputAssessment: result.inputAssessment,
    rejected: result.rejected,
    rejectionReason: result.rejectionReason,
    usedCreativeDirection: result.usedCreativeDirection,
  };
}

// ---------------------------------------------------------------------------
// Tier 3 -- OpenAI minimal path
// ---------------------------------------------------------------------------

/**
 * Minimal OpenAI generation path. Runs light-analyzer for prompt context,
 * calls openaiGenerateImage, applies post-processing, then runs the same
 * combinedQualityCheck gate as Tier 1 / Tier 2.
 */
async function runOpenAITier(
  rawBuffer: Buffer,
  params: NeverFailParams,
  totalStart: number,
): Promise<NeverFailResult> {
  const style = params.style ?? 'style_lifestyle';
  const category = params.productCategory ?? 'other';

  console.info(JSON.stringify({ event: 'never_fail_tier3_start', provider: 'openai', model: 'gpt-image-1' }));

  // Light analysis -- best-effort, non-fatal on failure
  let analysis: LightAnalysis | null = null;
  try {
    const { buffer: processedBuffer } = await preprocessImage(rawBuffer);
    analysis = await lightAnalyze([processedBuffer, ...(params.referenceImageBuffers ?? [])]);
  } catch {
    // Continue without analysis -- prompt will be generic but still usable
  }

  // Build a compact prompt from what we know
  const productDesc = analysis
    ? `${analysis.productName} (${analysis.productCategory}), dominant colors: ${analysis.dominantColors.join(', ')}`
    : `product (${category})`;

  const voiceNote = params.voiceInstructions
    ? `\nAdditional instructions from client: ${params.voiceInstructions}`
    : '';

  const prompt = `Create a professional advertisement photo for: ${productDesc}. Style: ${style.replace('style_', '').replace(/_/g, ' ')}. Keep the product exactly as-is -- same shape, color, branding -- placed in a beautiful, realistic setting. No text overlays. Make it look like a real product photograph, not AI-generated.${voiceNote}`;

  // Process raw buffer for sending to OpenAI
  let processedBuffer: Buffer;
  try {
    const pp = await preprocessImage(rawBuffer);
    processedBuffer = pp.buffer;
  } catch {
    processedBuffer = rawBuffer;
  }

  const result = await openaiGenerateImage({
    inputImageBuffer: processedBuffer,
    prompt,
    referenceImageBuffers: params.referenceImageBuffers,
  });

  // Apply post-processing (grain, vignette, warmth, AI label)
  let postProcessed: Buffer;
  try {
    postProcessed = await postProcessFinal(result.imageBuffer, style);
    postProcessed = await addAILabel(postProcessed);
  } catch {
    postProcessed = result.imageBuffer;
  }

  // QA gate -- same thresholds as Tier 1 / Tier 2
  const qa = await combinedQualityCheck(processedBuffer, postProcessed, {
    checkFidelity: style !== 'style_with_model',
  });

  console.info(JSON.stringify({
    event: 'never_fail_tier3_qa',
    pass: qa.pass,
    score: qa.score,
    fidelityScore: qa.productFidelityScore,
    hasFundamentalError: qa.hasFundamentalError,
    issues: qa.issues,
  }));

  const fidelityOk = style === 'style_with_model' || qa.productFidelityScore >= QA_FIDELITY_MIN;
  const passesGate =
    qa.pass &&
    qa.score >= QA_PASS_SCORE &&
    fidelityOk &&
    !qa.hasFundamentalError &&
    qa.humanAnatomy !== 'major_issue' &&
    qa.productIntegration !== 'impossible';

  if (!passesGate) {
    // Tier 3 QA failed -- signal needs_refund to the worker
    throw new Error(
      `[needs_refund: true] Tier 3 (OpenAI gpt-image-1) QA gate failed -- score=${qa.score} fidelity=${qa.productFidelityScore} fundamental=${qa.hasFundamentalError}. All 3 tiers exhausted.`,
    );
  }

  const outputUrl = await uploadToStorage(postProcessed, `output_tier3_openai_${Date.now()}.jpg`);

  console.info(JSON.stringify({
    event: 'never_fail_tier3_success',
    durationMs: Date.now() - totalStart,
    qaScore: qa.score,
  }));

  return {
    outputUrl,
    outputBuffer: postProcessed,
    qaScore: qa.score,
    pipeline: 'openai-gpt-image',
    attempts: 1,
    durationMs: Date.now() - totalStart,
    tier: 3,
    tierReason: 'Both Gemini tiers failed -- OpenAI gpt-image-1 succeeded',
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function processImageNeverFail(
  params: NeverFailParams,
): Promise<NeverFailResult> {
  const totalStart = Date.now();

  // Pre-download the raw image buffer once -- reused across all tiers
  let rawBuffer: Buffer;
  try {
    rawBuffer = await downloadBuffer(params.imageUrl);
  } catch (err) {
    throw new Error(`Cannot download input image: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Phase B (2026-04-22): content-safety pre-flight.
  // Fail fast on products Gemini will refuse (weapons, explicit, regulated
  // alcohol etc.) — avoid burning ~$0.50 + 3 min of compute looping through
  // tiers that will all refuse. Runs off the lightAnalyze of the raw buffer,
  // so the safety check doesn't need its own preprocess pass.
  try {
    const { buffer: analysisBuffer } = await preprocessImage(rawBuffer);
    const analysis = await lightAnalyze([analysisBuffer, ...(params.referenceImageBuffers ?? [])]);
    const safety = await checkContentSafety(analysis);

    if (!safety.safe) {
      console.warn(JSON.stringify({
        event: 'never_fail_safety_blocked',
        blockReason: safety.blockReason,
        productName: analysis.productName,
        durationMs: Date.now() - totalStart,
      }));
      // Marker string picked up by worker — order is marked failed, no ship.
      throw new Error(
        `needs_refund: true — content_safety_blocked (${safety.blockReason ?? 'other'}): ${safety.userMessage ?? 'Product cannot be generated.'}`,
      );
    }
  } catch (err) {
    // Propagate needs_refund errors; swallow anything else so generation still tries
    // (Gemini's own filters downstream are the backstop).
    if (err instanceof Error && err.message.includes('needs_refund')) throw err;
    console.warn(JSON.stringify({
      event: 'never_fail_safety_skipped',
      reason: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
    }));
  }

  // -- Tier 1: gemini-3-pro-image-preview (primary / best quality) ----------
  {
    console.info(JSON.stringify({
      event: 'never_fail_tier1_start',
      pipeline: 'v5',
      model: TIER1_MODEL,
    }));

    try {
      const v5Params: ProcessImageV5Params = {
        ...params,
        referenceImageBuffers: params.referenceImageBuffers,
        modelOverride: TIER1_MODEL,
      };

      const result = await withTimeout(
        processProductImageV5(v5Params),
        GEMINI_TIER_TIMEOUT_MS,
        'Tier 1 (gemini-3-pro-image-preview)',
      );

      console.info(JSON.stringify({
        event: 'never_fail_tier1_success',
        pipeline: 'v5',
        model: TIER1_MODEL,
        qaScore: result.qaScore,
        durationMs: Date.now() - totalStart,
      }));

      return geminiResultToNeverFail(result, 1, totalStart);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(JSON.stringify({
        event: 'never_fail_tier1_failed',
        model: TIER1_MODEL,
        reason: reason.slice(0, 300),
        durationMs: Date.now() - totalStart,
      }));
    }
  }

  // -- Tier 2: gemini-3.1-flash-image-preview (quality fallback, same code) -
  {
    console.info(JSON.stringify({
      event: 'never_fail_tier2_start',
      pipeline: 'v5',
      model: TIER2_MODEL,
    }));

    try {
      const v5Params: ProcessImageV5Params = {
        ...params,
        referenceImageBuffers: params.referenceImageBuffers,
        modelOverride: TIER2_MODEL,
      };

      const result = await withTimeout(
        processProductImageV5(v5Params),
        GEMINI_TIER_TIMEOUT_MS,
        'Tier 2 (gemini-3.1-flash-image-preview)',
      );

      console.info(JSON.stringify({
        event: 'never_fail_tier2_success',
        pipeline: 'v5',
        model: TIER2_MODEL,
        qaScore: result.qaScore,
        durationMs: Date.now() - totalStart,
      }));

      return geminiResultToNeverFail(
        result,
        2,
        totalStart,
        'Tier 1 (Pro) failed -- Flash succeeded',
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(JSON.stringify({
        event: 'never_fail_tier2_failed',
        model: TIER2_MODEL,
        reason: reason.slice(0, 300),
        durationMs: Date.now() - totalStart,
      }));
    }
  }

  // -- Tier 3: OpenAI gpt-image-1 (provider fallback) ----------------------
  try {
    const tier3Result = await withTimeout(
      runOpenAITier(rawBuffer, params, totalStart),
      OPENAI_TIER_TIMEOUT_MS,
      'Tier 3 (OpenAI gpt-image-1)',
    );
    return tier3Result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      event: 'never_fail_tier3_failed',
      provider: 'openai',
      reason: reason.slice(0, 300),
      durationMs: Date.now() - totalStart,
    }));
    // Propagate with needs_refund marker
    throw new Error(
      `[needs_refund: true] All 3 AI tiers exhausted (Pro -> Flash -> OpenAI). Last error: ${reason.slice(0, 200)}`,
    );
  }
}

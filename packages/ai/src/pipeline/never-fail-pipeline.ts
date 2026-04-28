/**
 * Never-fail pipeline — thin wrapper over the production chain.
 *
 * The worker calls processImageNeverFail() per style. This module keeps the
 * same external shape (NeverFailParams / NeverFailResult) so the worker needs
 * no changes, while routing all generation through production.ts internally.
 *
 * Tier mapping (from production.ts):
 *   StyleResult.tier 1 | 2 | 3 → NeverFailResult.tier 1 | 2 | 3
 *   StyleResult.tier 'refund'  → throws Error('[needs_refund: true] ...')
 *
 * pipelineMode and modelOverride are still accepted on the type for admin-UI
 * backward compatibility, but are ignored in the production path. All modes
 * now run the same Beta prompt + Pro → Flash → GPT-2 chain.
 */

import { downloadBuffer, uploadToStorage } from './fallback.js';
import { preprocessImage } from './preprocess.js';
import { lightAnalyze } from './light-analyzer.js';
import { processStyleProduction } from './production.js';
import type { ProcessImageParams } from './_common/types.js';

// ---------------------------------------------------------------------------
// Extended params (backward-compatible)
// ---------------------------------------------------------------------------

export interface NeverFailParams extends ProcessImageParams {
  /** Pre-downloaded reference image buffers for multi-angle orders. */
  referenceImageBuffers?: Buffer[];
  /** Kept for backward compat — not used in production routing. */
  profileV4?: unknown;
  /**
   * Override the Tier 1 Gemini image model — kept for admin UI compat.
   * Ignored in production (always runs the full Pro → Flash → GPT-2 chain).
   */
  modelOverride?: string;
  /**
   * Pipeline mode — kept for backward compat.
   * Ignored in production — all modes run Beta prompt.
   */
  pipelineMode?: 'full' | 'lean' | 'skinny' | 'beta';
}

export interface NeverFailResult {
  outputUrl: string;
  /** Always undefined — video generation removed. Kept for worker compatibility. */
  storyUrl?: string;
  /** Always undefined — video generation removed. Kept for worker compatibility. */
  videoUrl?: string;
  cutoutUrl?: string;
  /** Placeholder — no QA gate in production. */
  qaScore: number;
  pipeline: string;
  attempts: number;
  durationMs: number;
  tier: 1 | 2 | 3 | 4;
  tierReason?: string;
  outputBuffer?: Buffer;
  inputAssessment?: unknown;
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
// Main export
// ---------------------------------------------------------------------------

export async function processImageNeverFail(
  params: NeverFailParams,
): Promise<NeverFailResult> {
  const totalStart = Date.now();
  const style = params.style ?? 'style_lifestyle';

  if (params.pipelineMode && params.pipelineMode !== 'beta') {
    console.info(JSON.stringify({
      event: 'never_fail_mode_ignored',
      pipelineMode: params.pipelineMode,
      note: 'All modes route to production Beta chain (Pro → Flash → GPT-2). pipelineMode is deprecated.',
    }));
  }

  if (params.modelOverride) {
    console.info(JSON.stringify({
      event: 'never_fail_model_override_ignored',
      modelOverride: params.modelOverride,
      note: 'modelOverride is deprecated. Production always uses the full tier chain.',
    }));
  }

  // ---- Download + preprocess ------------------------------------------------
  let rawBuffer: Buffer;
  try {
    rawBuffer = await downloadBuffer(params.imageUrl);
  } catch (err) {
    throw new Error(
      `Cannot download input image: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let primaryBuffer: Buffer;
  try {
    const pp = await preprocessImage(rawBuffer);
    primaryBuffer = pp.buffer;
  } catch {
    primaryBuffer = rawBuffer;
  }

  // ---- Light analysis (best-effort — used for product name in prompt) --------
  let productName = 'product';
  try {
    const allBuffers = [primaryBuffer, ...(params.referenceImageBuffers ?? [])];
    const analysis = await lightAnalyze(allBuffers);
    productName = analysis.productName;
  } catch {
    // Non-fatal — Beta prompt doesn't use product name anyway (intentional)
  }

  // ---- Route to production chain --------------------------------------------
  const styleResult = await processStyleProduction({
    style,
    primaryBuffer,
    referenceBuffers: params.referenceImageBuffers ?? [],
    productName,
    userInstructions: params.voiceInstructions,
  });

  // ---- Map to NeverFailResult ------------------------------------------------
  if (styleResult.tier === 'refund') {
    throw new Error(
      `[needs_refund: true] All 3 AI tiers exhausted for style "${style}". Last error: ${styleResult.error ?? 'unknown'}`,
    );
  }

  // tier is 1 | 2 | 3 here (not 'refund')
  const tier = styleResult.tier as 1 | 2 | 3;

  return {
    outputUrl: styleResult.outputUrl!,
    qaScore: 100, // No QA gate in production
    pipeline: styleResult.model,
    attempts: tier,
    durationMs: Date.now() - totalStart,
    tier,
    tierReason: tier === 1
      ? 'Pro succeeded'
      : tier === 2
        ? 'Pro failed — Flash succeeded'
        : 'Both Gemini tiers failed — GPT-2 succeeded',
  };
}

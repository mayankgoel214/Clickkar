/**
 * Never-fail pipeline — thin wrapper over the V1 production chain.
 *
 * The worker calls processImageNeverFail() per style. This module keeps the
 * external shape (NeverFailParams / NeverFailResult) so the worker needs no
 * changes, while routing all generation through production.ts internally.
 *
 * Tier mapping (from production.ts V1):
 *   StyleResult.tier 1         → NeverFailResult.tier 1 (Pro succeeded)
 *   StyleResult.tier 2         → NeverFailResult.tier 2 (Pro failed, GPT-2 succeeded)
 *   StyleResult.tier 'refund'  → throws Error('[needs_refund: true] ...')
 *
 * pipelineMode and modelOverride are still accepted on the type for admin-UI
 * backward compatibility, but are ignored. All paths run the same V1 chain
 * (Beta prompt + Pro → GPT-2 → refund).
 */

import { downloadBuffer } from './fallback.js';
import { preprocessImage } from './preprocess.js';
import { processStyleProduction } from './production.js';
import { generateCreativeBrief } from './creative-brief.js';
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
   * Override the Tier 1 image model — kept for admin UI compat.
   * Ignored in V1 (always runs Pro → GPT-2 chain).
   */
  modelOverride?: string;
  /**
   * Pipeline mode — kept for backward compat.
   * Ignored in V1 — all modes run the Beta prompt.
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
  /** Placeholder — no QA gate in V1. */
  qaScore: number;
  pipeline: string;
  attempts: number;
  durationMs: number;
  /** 1 = Pro, 2 = GPT-2. (Tier 4 retained on type for old callers but unused in V1.) */
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
      note: 'V1 ignores pipelineMode. All paths run Beta + Pro → GPT-2 → refund.',
    }));
  }

  if (params.modelOverride) {
    console.info(JSON.stringify({
      event: 'never_fail_model_override_ignored',
      modelOverride: params.modelOverride,
      note: 'V1 ignores modelOverride. Production always uses the full tier chain.',
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

  // ---- V1.1: Creative Brief (per-product art direction) --------------------
  // Worker calls processImageNeverFail per-style, so we generate a brief for
  // just this one style. Cost ~₹0.10, latency ~3s. On failure, falls back to
  // V1 base Beta prompt (no breaking change).
  const allBuffers = [primaryBuffer, ...(params.referenceImageBuffers ?? [])];
  const brief = await generateCreativeBrief({
    buffers: allBuffers,
    styles: [style],
    productCategory: params.productCategory,
  });

  // ---- Route to V1.1 production chain ---------------------------------------
  const styleResult = await processStyleProduction({
    style,
    primaryBuffer,
    referenceBuffers: params.referenceImageBuffers ?? [],
    productCategory: params.productCategory,
    userInstructions: params.voiceInstructions,
    artDirection: brief?.directions[style],
  });

  // ---- Map to NeverFailResult ------------------------------------------------
  if (styleResult.tier === 'refund') {
    throw new Error(
      `[needs_refund: true] All AI tiers exhausted for style "${style}". Last error: ${styleResult.error ?? 'unknown'}`,
    );
  }

  // tier is 1 | 2 here (refund handled above)
  const tier = styleResult.tier;

  return {
    outputUrl: styleResult.outputUrl!,
    qaScore: 100, // No QA gate in V1
    pipeline: styleResult.model,
    attempts: tier,
    durationMs: Date.now() - totalStart,
    tier,
    tierReason: tier === 1
      ? 'Pro succeeded'
      : 'Pro failed — GPT-2 succeeded',
  };
}

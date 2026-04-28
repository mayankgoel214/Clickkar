/**
 * Production pipeline — single file, clean, readable.
 *
 * Chain per style:
 *   Tier 1: gemini-3-pro-image-preview   ($0.134 / ₹13.40)
 *   Tier 2: gemini-3.1-flash-image-preview  ($0.045 / ₹4.50)
 *   Tier 3: gpt-image-2                  ($0.21 / ₹21.00)
 *   Refund: all 3 tiers failed
 *
 * No QA gate. No content-safety preflight. No Art Director. No fal.ai.
 * A simple deterministic check (blank / corrupt / too-small / blurry)
 * guards against catastrophic Gemini failures before shipping.
 *
 * Runs all 3 style jobs in Promise.all — they're independent.
 * Light analysis runs once per order (not per style).
 */

import { randomBytes } from 'crypto';
import { geminiGenerateImage } from './gemini-generate.js';
import { openaiGenerateImage } from './openai-generate.js';
import { postProcessFinal, addAILabel, downloadBuffer, uploadToStorage } from './fallback.js';
import { runDeterministicChecks } from '../qa/deterministic-checks.js';
import { buildBetaPrompt } from './style-prompts-v5.js';
import { lightAnalyze, type LightAnalysis } from './light-analyzer.js';
import { preprocessImage } from './preprocess.js';
import type { ProcessImageParams } from './_common/types.js';

// ---------------------------------------------------------------------------
// Cost constants (INR, ₹100 = $1 approximation)
// ---------------------------------------------------------------------------

const COST_INR = {
  geminiProImage: 13.40,      // $0.134 — gemini-3-pro-image-preview
  geminiFlashImage: 4.50,     // $0.045 — gemini-3.1-flash-image-preview
  openaiGptImage2: 21.00,     // $0.21 standard quality — gpt-image-2
  lightAnalysis: 0.30,        // Gemini Flash Lite per order
} as const;

const RETAIL_PRICE_INR = 99;

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------

const TIER1_MODEL = 'gemini-3-pro-image-preview';
const TIER2_MODEL = 'gemini-3.1-flash-image-preview';

// ---------------------------------------------------------------------------
// Timeouts
// ---------------------------------------------------------------------------

const GEMINI_TIER_TIMEOUT_MS = 3 * 60 * 1000;  // 3 minutes per Gemini tier
const OPENAI_TIER_TIMEOUT_MS = 150_000;         // 150 seconds — GPT can be slow

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductionParams extends ProcessImageParams {
  /**
   * 1-3 style IDs to generate (e.g. ["style_clean_white", "style_with_model", "style_festive"]).
   * All styles are processed in parallel.
   */
  styles: string[];
  /**
   * All input photos — first is primary, rest are reference. Up to 5.
   * If provided, light analysis and generation use all buffers.
   * When absent, the single imageUrl is downloaded and used.
   */
  imageBuffers?: Buffer[];
  /**
   * Optional user-provided guidance (voice-note transcript or typed text).
   */
  userInstructions?: string;
}

export interface StyleResult {
  style: string;
  /** Supabase URL. null when tier === 'refund'. */
  outputUrl: string | null;
  tier: 1 | 2 | 3 | 'refund';
  model: 'gemini-3-pro-image-preview' | 'gemini-3.1-flash-image-preview' | 'gpt-image-2' | 'refund';
  /** Actual cost incurred for this style (includes failed-tier attempts). */
  costInr: number;
  durationMs: number;
  /** Prompt sent to the winning tier — useful for debugging. */
  prompt: string;
  error: string | null;
}

export interface ProductionResult {
  orderId: string;
  styleResults: StyleResult[];
  /** Sum of per-style costs. */
  totalCostInr: number;
  /** Light analysis + preprocessing overhead (charged once per order). */
  overheadCostInr: number;
  /** totalCostInr + overheadCostInr */
  grandTotalInr: number;
  /** RETAIL_PRICE_INR - grandTotalInr */
  marginInr: number;
  marginPct: number;
  /** true if any style ended in 'refund' tier */
  needsRefund: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
        ms,
      ),
    ),
  ]);
}

/**
 * Apply post-processing and AI label. Non-fatal — on error returns raw buffer.
 */
async function finalize(buffer: Buffer, style: string): Promise<Buffer> {
  try {
    const processed = await postProcessFinal(buffer, style);
    return await addAILabel(processed);
  } catch {
    return buffer;
  }
}

/**
 * Run deterministic defect checks on the output buffer.
 * Catastrophic = blank / corrupt / too-small / blurry / wrong-aspect.
 * We pass the output buffer as both args — the NCC check will return ~1
 * (comparing to itself) but that only means "no scene change", which is
 * NOT a catastrophic failure signal we use here. We only care about:
 * isValid, isBlank, and laplacianVariance < 50.
 */
async function hasCatastrophicDefect(outputBuffer: Buffer): Promise<boolean> {
  try {
    const result = await runDeterministicChecks(outputBuffer, outputBuffer);
    if (!result.isValid) return true;
    if (result.isBlank) return true;
    if (result.laplacianVariance < 50) return true;
    return false;
  } catch {
    // If we can't even check, assume it's fine — let it ship
    return false;
  }
}

// ---------------------------------------------------------------------------
// Per-style algorithm
// ---------------------------------------------------------------------------

async function processStyleWithChain(
  style: string,
  primaryBuffer: Buffer,
  referenceBuffers: Buffer[],
  productName: string,
  userInstructions: string | undefined,
  orderId: string,
): Promise<StyleResult> {
  const styleStart = Date.now();
  const prompt = buildBetaPrompt(style, productName, userInstructions);
  let accumulatedCost = 0;

  // ---- Tier 1: Pro -----------------------------------------------------------
  try {
    console.info(JSON.stringify({
      event: 'production_tier1_start',
      orderId,
      style,
      model: TIER1_MODEL,
    }));

    const gen = await withTimeout(
      geminiGenerateImage({
        inputImageBuffer: primaryBuffer,
        prompt,
        temperature: 0.3,
        // Identity anchoring — duplicate the primary buffer as the first
        // reference. Gemini weighs reference images heavily for identity
        // preservation; duplicating the input doubles its representational
        // weight in the model's attention without adding any cost.
        referenceImageBuffers: [primaryBuffer, ...referenceBuffers],
        model: TIER1_MODEL,
      }),
      GEMINI_TIER_TIMEOUT_MS,
      `Tier 1 Pro (${style})`,
    );

    const finalized = await finalize(gen.imageBuffer, style);
    const catastrophic = await hasCatastrophicDefect(finalized);

    if (!catastrophic) {
      const outputUrl = await uploadToStorage(
        finalized,
        `production_${orderId}_${style}_tier1_${Date.now()}.jpg`,
      );
      const costInr = accumulatedCost + COST_INR.geminiProImage;

      const result: StyleResult = {
        style,
        outputUrl,
        tier: 1,
        model: 'gemini-3-pro-image-preview',
        costInr,
        durationMs: Date.now() - styleStart,
        prompt,
        error: null,
      };

      console.info(JSON.stringify({
        event: 'production_style_complete',
        orderId,
        style,
        tier: 1,
        model: TIER1_MODEL,
        costInr,
        durationMs: result.durationMs,
        error: null,
      }));

      return result;
    }

    console.warn(JSON.stringify({
      event: 'production_tier1_catastrophic_defect',
      orderId,
      style,
      reason: 'blank_or_blurry_or_corrupt',
    }));
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'production_tier1_failed',
      orderId,
      style,
      reason: err instanceof Error ? err.message.slice(0, 200) : String(err),
    }));
  }
  accumulatedCost += COST_INR.geminiProImage;

  // ---- Tier 2: Flash (NB2) ---------------------------------------------------
  try {
    console.info(JSON.stringify({
      event: 'production_tier2_start',
      orderId,
      style,
      model: TIER2_MODEL,
    }));

    const gen = await withTimeout(
      geminiGenerateImage({
        inputImageBuffer: primaryBuffer,
        prompt,
        temperature: 0.3,
        // Identity anchoring — duplicate the primary buffer as the first
        // reference. Gemini weighs reference images heavily for identity
        // preservation; duplicating the input doubles its representational
        // weight in the model's attention without adding any cost.
        referenceImageBuffers: [primaryBuffer, ...referenceBuffers],
        model: TIER2_MODEL,
      }),
      GEMINI_TIER_TIMEOUT_MS,
      `Tier 2 Flash (${style})`,
    );

    const finalized = await finalize(gen.imageBuffer, style);
    const catastrophic = await hasCatastrophicDefect(finalized);

    if (!catastrophic) {
      const outputUrl = await uploadToStorage(
        finalized,
        `production_${orderId}_${style}_tier2_${Date.now()}.jpg`,
      );
      const costInr = accumulatedCost + COST_INR.geminiFlashImage;

      const result: StyleResult = {
        style,
        outputUrl,
        tier: 2,
        model: 'gemini-3.1-flash-image-preview',
        costInr,
        durationMs: Date.now() - styleStart,
        prompt,
        error: null,
      };

      console.info(JSON.stringify({
        event: 'production_style_complete',
        orderId,
        style,
        tier: 2,
        model: TIER2_MODEL,
        costInr,
        durationMs: result.durationMs,
        error: null,
      }));

      return result;
    }

    console.warn(JSON.stringify({
      event: 'production_tier2_catastrophic_defect',
      orderId,
      style,
      reason: 'blank_or_blurry_or_corrupt',
    }));
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'production_tier2_failed',
      orderId,
      style,
      reason: err instanceof Error ? err.message.slice(0, 200) : String(err),
    }));
  }
  accumulatedCost += COST_INR.geminiFlashImage;

  // ---- Tier 3: OpenAI GPT Image 2 -------------------------------------------
  try {
    console.info(JSON.stringify({
      event: 'production_tier3_start',
      orderId,
      style,
      model: 'gpt-image-2',
    }));

    const gen = await withTimeout(
      openaiGenerateImage({
        inputImageBuffer: primaryBuffer,
        prompt,
        referenceImageBuffers: referenceBuffers.length > 0 ? referenceBuffers : undefined,
        model: 'gpt-image-2',
      }),
      OPENAI_TIER_TIMEOUT_MS,
      `Tier 3 OpenAI (${style})`,
    );

    const finalized = await finalize(gen.imageBuffer, style);
    const outputUrl = await uploadToStorage(
      finalized,
      `production_${orderId}_${style}_tier3_${Date.now()}.jpg`,
    );
    const costInr = accumulatedCost + COST_INR.openaiGptImage2;

    const result: StyleResult = {
      style,
      outputUrl,
      tier: 3,
      model: 'gpt-image-2',
      costInr,
      durationMs: Date.now() - styleStart,
      prompt,
      error: null,
    };

    console.info(JSON.stringify({
      event: 'production_style_complete',
      orderId,
      style,
      tier: 3,
      model: 'gpt-image-2',
      costInr,
      durationMs: result.durationMs,
      error: null,
    }));

    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      event: 'production_tier3_failed',
      orderId,
      style,
      reason: errMsg.slice(0, 200),
    }));
    accumulatedCost += COST_INR.openaiGptImage2;

    // All 3 tiers failed — refund
    const result: StyleResult = {
      style,
      outputUrl: null,
      tier: 'refund',
      model: 'refund',
      costInr: accumulatedCost,
      durationMs: Date.now() - styleStart,
      prompt,
      error: errMsg.slice(0, 300),
    };

    console.info(JSON.stringify({
      event: 'production_style_complete',
      orderId,
      style,
      tier: 'refund',
      model: 'refund',
      costInr: accumulatedCost,
      durationMs: result.durationMs,
      error: errMsg.slice(0, 200),
    }));

    return result;
  }
}

// ---------------------------------------------------------------------------
// Public API: processStyleProduction
// ---------------------------------------------------------------------------

/**
 * Process a single style through the production chain.
 * Exposed for the never-fail-pipeline thin wrapper.
 */
export async function processStyleProduction(params: {
  style: string;
  primaryBuffer: Buffer;
  referenceBuffers: Buffer[];
  productName: string;
  userInstructions?: string;
  orderId?: string;
}): Promise<StyleResult> {
  const orderId = params.orderId ?? randomBytes(4).toString('hex');
  return processStyleWithChain(
    params.style,
    params.primaryBuffer,
    params.referenceBuffers,
    params.productName,
    params.userInstructions,
    orderId,
  );
}

// ---------------------------------------------------------------------------
// Public API: processOrderProduction
// ---------------------------------------------------------------------------

/**
 * Process an order: light analysis + 3 style generations in parallel.
 *
 * This is the main entry point for multi-style orders. The worker calls
 * processImageNeverFail (per-style); this function is for future multi-style
 * order processing or direct admin/test usage.
 */
export async function processOrderProduction(
  params: ProductionParams,
): Promise<ProductionResult> {
  const orderStart = Date.now();
  const orderId = randomBytes(4).toString('hex');

  // ---- Download + preprocess primary image ----------------------------------
  let primaryBuffer: Buffer;
  let referenceBuffers: Buffer[] = [];

  if (params.imageBuffers && params.imageBuffers.length > 0) {
    // Buffers provided directly (admin UI path)
    try {
      const pp = await preprocessImage(params.imageBuffers[0]!);
      primaryBuffer = pp.buffer;
    } catch {
      primaryBuffer = params.imageBuffers[0]!;
    }
    referenceBuffers = params.imageBuffers.slice(1);
  } else {
    // Download from URL (worker path)
    const raw = await downloadBuffer(params.imageUrl);
    try {
      const pp = await preprocessImage(raw);
      primaryBuffer = pp.buffer;
    } catch {
      primaryBuffer = raw;
    }
  }

  // ---- Light analysis (once per order) --------------------------------------
  let analysis: LightAnalysis;
  try {
    const allBuffers = [primaryBuffer, ...referenceBuffers];
    analysis = await lightAnalyze(allBuffers);
  } catch {
    analysis = {
      productName: 'product',
      productCategory: params.productCategory ?? 'other',
      hasBranding: true,
      physicalSize: 'medium' as const,
      dominantColors: ['neutral'],
      typicalSetting: 'tabletop',
      usable: true,
      itemCount: 1,
      items: ['product'],
      setDescription: null,
    };
  }

  const overheadCostInr = COST_INR.lightAnalysis;

  // ---- Run all styles in parallel -------------------------------------------
  const styleResults = await Promise.all(
    params.styles.map(style =>
      processStyleWithChain(
        style,
        primaryBuffer,
        referenceBuffers,
        analysis.productName,
        params.userInstructions ?? params.voiceInstructions,
        orderId,
      ),
    ),
  );

  // ---- Aggregate metrics ----------------------------------------------------
  const totalCostInr = Number(
    styleResults.reduce((sum, r) => sum + r.costInr, 0).toFixed(2),
  );
  const grandTotalInr = Number((totalCostInr + overheadCostInr).toFixed(2));
  const marginInr = Number((RETAIL_PRICE_INR - grandTotalInr).toFixed(2));
  const marginPct = Number(((marginInr / RETAIL_PRICE_INR) * 100).toFixed(1));
  const needsRefund = styleResults.some(r => r.tier === 'refund');

  const tier1Count = styleResults.filter(r => r.tier === 1).length;
  const tier2Count = styleResults.filter(r => r.tier === 2).length;
  const tier3Count = styleResults.filter(r => r.tier === 3).length;
  const refundCount = styleResults.filter(r => r.tier === 'refund').length;

  const result: ProductionResult = {
    orderId,
    styleResults,
    totalCostInr,
    overheadCostInr,
    grandTotalInr,
    marginInr,
    marginPct,
    needsRefund,
    durationMs: Date.now() - orderStart,
  };

  console.info(JSON.stringify({
    event: 'production_order_complete',
    orderId,
    totalCostInr,
    marginInr,
    marginPct,
    needsRefund,
    tier1Count,
    tier2Count,
    tier3Count,
    refundCount,
    durationMs: result.durationMs,
  }));

  return result;
}

/**
 * Production V1 — ad-engineered pipeline.
 *
 * Per style:
 *   Tier 1: gemini-3-pro-image-preview   ($0.134 / ₹13.40)
 *   Tier 2: gpt-image-2                  ($0.21 / ₹21.00)
 *   Refund: both tiers failed
 *
 * No NB2 middle tier — when Pro safety-refuses, NB2 ~95% refuses too
 * (shared backend), so paying ₹4.50 to almost-never-succeed is wasted spend.
 * GPT-2 has independent safety filters, making it an actually-useful backup.
 *
 * No QA gate. No content-safety preflight. No Art Director. No light
 * analysis (Beta prompt ignores productName). All deliberately removed
 * after V5 over-generation experiments showed the gains were not worth
 * the cost or the latency.
 *
 * Reliability levers (all zero added cost):
 *   - Beta prompt (ad-engineered): style + ad-mode + per-category nudge
 *   - Identity anchoring: input duplicated as the first reference image
 *   - Temperature 0.3: more conservative, less product drift
 *   - Aspect 1:1 forced in prompt (consistent across 3 styles in an order)
 *   - Deterministic defect check on raw Pro output (sharp-only, ~50ms):
 *     blur, blank, wrong aspect, product duplication, color shift, fill %
 *
 * Runs all 3 style jobs in Promise.all — they're independent.
 */

import { randomBytes } from 'crypto';
import { geminiGenerateImage } from './gemini-generate.js';
import { openaiGenerateImage } from './openai-generate.js';
import { postProcessFinal, addAILabel, downloadBuffer, uploadToStorage } from './fallback.js';
import { runDeterministicChecks } from '../qa/deterministic-checks.js';
import { buildBetaPrompt, type StyleArtDirection } from './style-prompts-v5.js';
import { preprocessImage } from './preprocess.js';
import { generateCreativeBrief, type CreativeBrief } from './creative-brief.js';
import {
  parsePerStyleInstructions,
  type PerStyleInstructionResult,
} from '../instructions/parse-per-style.js';
import type { ProcessImageParams } from './_common/types.js';

// ---------------------------------------------------------------------------
// Cost constants (INR, ₹100 = $1 approximation)
// ---------------------------------------------------------------------------

const COST_INR = {
  geminiProImage: 13.40,      // $0.134 — gemini-3-pro-image-preview at 2K
  openaiGptImage2: 21.00,     // $0.21 standard quality — gpt-image-2
  creativeBrief: 0.10,        // ~$0.001 — gemini-2.5-flash with photos + structured output
  instructionParse: 0.05,     // ~$0.0005 — gemini-2.5-flash text-only
} as const;

const RETAIL_PRICE_INR = 99;

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------

const TIER1_MODEL = 'gemini-3-pro-image-preview';
const TIER2_MODEL = 'gpt-image-2';

// ---------------------------------------------------------------------------
// Generation parameters
// ---------------------------------------------------------------------------

const TIER1_TEMPERATURE = 0.3;     // conservative, faithful to input
const GEMINI_TIER_TIMEOUT_MS = 3 * 60 * 1000;  // 3 minutes
const OPENAI_TIER_TIMEOUT_MS = 150_000;         // 150s — GPT can be slow

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductionParams extends ProcessImageParams {
  /**
   * 1-3 style IDs to generate (e.g. ["style_clean_white", "style_with_model"]).
   * All styles are processed in parallel.
   */
  styles: string[];
  /**
   * All input photos — first is primary, rest are reference. Up to 5.
   * If provided, generation uses all buffers. When absent, the single
   * imageUrl is downloaded and used.
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
  tier: 1 | 2 | 'refund';
  model: 'gemini-3-pro-image-preview' | 'gpt-image-2' | 'refund';
  /** Actual cost incurred for this style (includes failed-tier attempts). */
  costInr: number;
  durationMs: number;
  /** Prompt sent to the winning tier — useful for debugging. */
  prompt: string;
  error: string | null;
  /** Defect check fail reason (when Pro output was rejected before fallback). */
  tier1DefectReason?: string | null;
}

export interface ProductionResult {
  orderId: string;
  styleResults: StyleResult[];
  /** V1.1 Creative Brief (null if step failed or was skipped — pipeline still runs). */
  creativeBrief: CreativeBrief | null;
  /** V1.2.1 — parsed customer instructions (null if user provided none). */
  parsedInstructions: PerStyleInstructionResult | null;
  /** Sum of per-style costs + creative brief overhead. */
  totalCostInr: number;
  /** RETAIL_PRICE_INR - totalCostInr */
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
 * Run defect checks on raw Pro output (before post-processing).
 *
 * runDeterministicChecks already covers aspect, fill %, blur, duplication,
 * and color shift. We treat any pass=false as catastrophic and fall to GPT-2.
 *
 * Pure sharp, ~50-100ms, zero API cost.
 */
async function checkOutputForDefects(
  inputBuffer: Buffer,
  outputBuffer: Buffer,
): Promise<{ catastrophic: boolean; reason: string | null }> {
  try {
    const result = await runDeterministicChecks(inputBuffer, outputBuffer);
    if (!result.pass) {
      return { catastrophic: true, reason: result.failReason };
    }
    return { catastrophic: false, reason: null };
  } catch {
    // If we can't even check, assume it's fine — let it ship rather than
    // unnecessarily falling to expensive GPT-2.
    return { catastrophic: false, reason: null };
  }
}

// ---------------------------------------------------------------------------
// Per-style algorithm
// ---------------------------------------------------------------------------

async function processStyleWithChain(
  style: string,
  primaryBuffer: Buffer,
  referenceBuffers: Buffer[],
  userInstructions: string | undefined,
  productCategory: string | undefined,
  orderId: string,
  artDirection?: StyleArtDirection,
): Promise<StyleResult> {
  const styleStart = Date.now();
  // Beta ignores productName — pass empty string. Category drives the nudge.
  // artDirection (V1.1) splices in per-product scene + mood when present.
  const prompt = buildBetaPrompt(style, '', userInstructions, productCategory, artDirection);
  let accumulatedCost = 0;
  let tier1DefectReason: string | null = null;

  // ---- Tier 1: Pro -----------------------------------------------------------
  try {
    console.info(JSON.stringify({
      event: 'production_tier1_start',
      orderId,
      style,
      productCategory: productCategory ?? 'unspecified',
      model: TIER1_MODEL,
    }));

    const gen = await withTimeout(
      geminiGenerateImage({
        inputImageBuffer: primaryBuffer,
        prompt,
        temperature: TIER1_TEMPERATURE,
        // V1.2 Identity anchoring — primary buffer passed 3× as references.
        // Pro accepts up to 16 reference images; tripling the primary
        // reinforces "this is the product, preserve it exactly" without any
        // cost increase. Combined with the preservation clause in the prompt,
        // this fixes Monster-style identity drift on rare product variants.
        referenceImageBuffers: [primaryBuffer, primaryBuffer, ...referenceBuffers],
        model: TIER1_MODEL,
      }),
      GEMINI_TIER_TIMEOUT_MS,
      `Tier 1 Pro (${style})`,
    );

    // Defect check on RAW Pro output (before post-processing). Post-processing
    // adds the "AI Generated" label which would skew an input/output NCC.
    const defect = await checkOutputForDefects(primaryBuffer, gen.imageBuffer);

    if (!defect.catastrophic) {
      const finalized = await finalize(gen.imageBuffer, style);
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
        tier1DefectReason: null,
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

    tier1DefectReason = defect.reason;
    console.warn(JSON.stringify({
      event: 'production_tier1_defect',
      orderId,
      style,
      reason: defect.reason,
    }));
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : String(err);
    tier1DefectReason = reason;
    console.warn(JSON.stringify({
      event: 'production_tier1_failed',
      orderId,
      style,
      reason,
    }));
  }
  accumulatedCost += COST_INR.geminiProImage;

  // ---- Tier 2: OpenAI GPT Image 2 -------------------------------------------
  try {
    console.info(JSON.stringify({
      event: 'production_tier2_start',
      orderId,
      style,
      model: TIER2_MODEL,
      tier1FailReason: tier1DefectReason,
    }));

    const gen = await withTimeout(
      openaiGenerateImage({
        inputImageBuffer: primaryBuffer,
        prompt,
        referenceImageBuffers: referenceBuffers.length > 0 ? referenceBuffers : undefined,
        model: TIER2_MODEL,
      }),
      OPENAI_TIER_TIMEOUT_MS,
      `Tier 2 OpenAI (${style})`,
    );

    const finalized = await finalize(gen.imageBuffer, style);
    const outputUrl = await uploadToStorage(
      finalized,
      `production_${orderId}_${style}_tier2_${Date.now()}.jpg`,
    );
    const costInr = accumulatedCost + COST_INR.openaiGptImage2;

    const result: StyleResult = {
      style,
      outputUrl,
      tier: 2,
      model: 'gpt-image-2',
      costInr,
      durationMs: Date.now() - styleStart,
      prompt,
      error: null,
      tier1DefectReason,
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
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    accumulatedCost += COST_INR.openaiGptImage2;

    console.error(JSON.stringify({
      event: 'production_tier2_failed',
      orderId,
      style,
      reason: errMsg.slice(0, 200),
    }));

    // Both tiers failed — refund
    const result: StyleResult = {
      style,
      outputUrl: null,
      tier: 'refund',
      model: 'refund',
      costInr: accumulatedCost,
      durationMs: Date.now() - styleStart,
      prompt,
      error: errMsg.slice(0, 300),
      tier1DefectReason,
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
 * Process a single style through the production V1.1 chain.
 * Exposed for the never-fail-pipeline thin wrapper.
 *
 * artDirection (V1.1, optional): per-style creative direction generated by
 * the Creative Brief step at order level. When omitted, falls back to V1
 * base Beta prompt — proven working.
 */
export async function processStyleProduction(params: {
  style: string;
  primaryBuffer: Buffer;
  referenceBuffers: Buffer[];
  /** Kept for signature compatibility — Beta prompt ignores productName. */
  productName?: string;
  productCategory?: string;
  userInstructions?: string;
  orderId?: string;
  artDirection?: StyleArtDirection;
}): Promise<StyleResult> {
  const orderId = params.orderId ?? randomBytes(4).toString('hex');
  return processStyleWithChain(
    params.style,
    params.primaryBuffer,
    params.referenceBuffers,
    params.userInstructions,
    params.productCategory,
    orderId,
    params.artDirection,
  );
}

// ---------------------------------------------------------------------------
// Public API: processOrderProduction
// ---------------------------------------------------------------------------

/**
 * Process a full order — multiple styles in parallel.
 *
 * Used by admin UI for direct testing. The worker calls processImageNeverFail
 * (per-style) which routes through processStyleProduction.
 */
export async function processOrderProduction(
  params: ProductionParams,
): Promise<ProductionResult> {
  const orderStart = Date.now();
  const orderId = randomBytes(4).toString('hex');

  // ---- Resolve primary + reference buffers ----------------------------------
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

  // ---- V1.2.1: Parse customer instructions per-style -----------------------
  // If the user provided free-form instructions ("model ko Asian banao aur
  // colored studio ko green"), this Gemini Flash call splits them into
  // per-style + global buckets. Hinglish-aware. Falls back to "apply raw
  // to everything" on any error.
  const rawInstructions = params.userInstructions ?? params.voiceInstructions;
  let parsedInstructions: PerStyleInstructionResult | null = null;
  let parsedCostInr = 0;

  if (rawInstructions && rawInstructions.trim().length > 0) {
    const parseStart = Date.now();
    parsedInstructions = await parsePerStyleInstructions({
      rawInstructions,
      styles: params.styles,
    });
    parsedCostInr = COST_INR.instructionParse;

    console.info(JSON.stringify({
      event: 'production_instructions_parsed',
      orderId,
      confidence: parsedInstructions.confidence,
      hasGlobal: !!parsedInstructions.globalInstruction,
      perStyleHits: Object.entries(parsedInstructions.perStyle)
        .filter(([_, v]) => v && v.trim().length > 0)
        .map(([s]) => s),
      durationMs: Date.now() - parseStart,
      costInr: parsedCostInr,
    }));
  }

  // ---- V1.1: Creative Brief (per-product art direction) --------------------
  // Single Gemini Flash call analyzes the product photos + generates per-style
  // creative direction. V1.2.1 — also passes parsed instructions so the brief
  // LLM can weave them into its per-style direction. On any failure, returns
  // null and the pipeline falls through to V1 base Beta prompt.
  const briefStart = Date.now();
  const allBuffers = [primaryBuffer, ...referenceBuffers];
  const creativeBrief = await generateCreativeBrief({
    buffers: allBuffers,
    styles: params.styles,
    productCategory: params.productCategory,
    perStyleInstructions: parsedInstructions?.perStyle,
    globalInstruction: parsedInstructions?.globalInstruction,
  });
  const briefDurationMs = Date.now() - briefStart;
  const briefCostInr = creativeBrief ? COST_INR.creativeBrief : 0;

  console.info(JSON.stringify({
    event: 'production_creative_brief',
    orderId,
    briefHit: creativeBrief !== null,
    productType: creativeBrief?.profile.productType.slice(0, 80) ?? null,
    durationMs: briefDurationMs,
    costInr: briefCostInr,
  }));

  // ---- Per-style instruction routing ----------------------------------------
  // For each style, combine global + per-style instruction (if parsed). If
  // parsing wasn't run (no user input), pass undefined → no instruction.
  // If parsing ran but produced fallback (raw → globalInstruction),
  // every style gets the raw text — preserves V1.1 behavior on parser failure.
  function instructionForStyle(style: string): string | undefined {
    if (!parsedInstructions) return undefined;
    const perStyle = parsedInstructions.perStyle[style];
    const global = parsedInstructions.globalInstruction;
    const parts = [global, perStyle].filter((s): s is string => !!s && s.trim().length > 0);
    return parts.length > 0 ? parts.join('. ') : undefined;
  }

  // ---- Run all styles in parallel -------------------------------------------
  const styleResults = await Promise.all(
    params.styles.map(style =>
      processStyleWithChain(
        style,
        primaryBuffer,
        referenceBuffers,
        instructionForStyle(style),
        params.productCategory,
        orderId,
        creativeBrief?.directions[style],
      ),
    ),
  );

  // ---- Aggregate metrics ----------------------------------------------------
  const styleCostInr = styleResults.reduce((sum, r) => sum + r.costInr, 0);
  const totalCostInr = Number((styleCostInr + briefCostInr + parsedCostInr).toFixed(2));
  const marginInr = Number((RETAIL_PRICE_INR - totalCostInr).toFixed(2));
  const marginPct = Number(((marginInr / RETAIL_PRICE_INR) * 100).toFixed(1));
  const needsRefund = styleResults.some(r => r.tier === 'refund');

  const tier1Count = styleResults.filter(r => r.tier === 1).length;
  const tier2Count = styleResults.filter(r => r.tier === 2).length;
  const refundCount = styleResults.filter(r => r.tier === 'refund').length;

  const result: ProductionResult = {
    orderId,
    styleResults,
    creativeBrief,
    parsedInstructions,
    totalCostInr,
    marginInr,
    marginPct,
    needsRefund,
    durationMs: Date.now() - orderStart,
  };

  console.info(JSON.stringify({
    event: 'production_order_complete',
    orderId,
    totalCostInr,
    briefCostInr,
    parsedCostInr,
    marginInr,
    marginPct,
    needsRefund,
    briefHit: creativeBrief !== null,
    instructionsParsed: parsedInstructions !== null,
    tier1Count,
    tier2Count,
    refundCount,
    durationMs: result.durationMs,
  }));

  return result;
}

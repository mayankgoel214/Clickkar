/**
 * V5 pipeline — Streamlined Gemini-first creative ad generation.
 *
 * Key differences from V4:
 *   - Light analysis: 7-field LightAnalyze replaces 42-field ProductProfileV4
 *   - Two clean tracks: COMPOSITE (branding) or DIRECT (no branding / with model)
 *   - COMPOSITE: BiRefNet + Gemini background run IN PARALLEL → sharp compositing
 *   - DIRECT: Gemini generates full ad from product image
 *   - clean_white / studio on COMPOSITE: styled studio shot instead of Gemini BG call
 *   - Simple 3-question QA instead of 20-field scoring
 *   - One retry on QA failure, then deliver whatever comes back
 *   - No Kontext, no ESRGAN, no CodeFormer, no Bria
 */

import { preprocessImage } from './preprocess.js';
import { lightAnalyze, type LightAnalysis } from './light-analyzer.js';
import { getStylePromptV5 } from './style-prompts-v5.js';
import { geminiGenerateImage } from './gemini-generate.js';
import { compositeProductOntoBackground } from './composite-engine.js';
import {
  postProcessFinal,
  addAILabel,
  uploadToStorage,
  downloadBuffer,
  removeBackground,
} from './fallback.js';
import { runDeterministicChecks } from '../qa/deterministic-checks.js';
import { combinedQualityCheck } from '../qa/combined-qa.js';
import type { ProcessImageParams, ProcessImageResult } from './orchestrator.js';

// ---------------------------------------------------------------------------
// QA thresholds — mirror V3 orchestrator (QA_PASS_SCORE / QA_FIDELITY_MIN).
// V5 previously shipped simpleQA (3 binary checks) which gave every output a
// passing score 75 regardless of fidelity. This let wrong-product outputs
// ship. Match V3's thresholds so fidelity breaks fail-closed.
// ---------------------------------------------------------------------------
const V5_QA_PASS_SCORE = 65;
const V5_QA_FIDELITY_MIN = 25;
/** Best-of fallback threshold — still better than dropping to Tier 2. */
const V5_BEST_OF_MIN_SCORE = 55;

// ---------------------------------------------------------------------------
// Candidate selection composite gate
//
// Previously `selectBestCandidate` picked the highest-scoring candidate but
// shipped it unconditionally — a candidate with pass:false and 50% fill would
// still win and go to QA. In the 2026-04-20 prod run both candidates had
// pass:false and fill:50 (see PRODUCTION_READINESS_PLAN.md P0-3), idx:0 still
// shipped as winner. The existing fields were decorative.
//
// The composite combines the three signals we already compute:
//   fillPct     — 0..100, how much of the canvas shows product/scene content
//   deterministicPass — 0|20, bonus if the gate thinks nothing is obviously wrong
//   sharpness   — 0|10, bonus if the image isn't flagged blurry by Laplacian
//   symmetryPenalty — 0..50, penalty proportional to quadrant duplication risk
//
// compositeScore = max(0, fillPct + deterministicPass + sharpness - symmetryPenalty)
//
// Threshold: compositeScore >= V5_CANDIDATE_MIN_COMPOSITE. The worst-case we
// want to ship is "just barely not garbage" — a candidate with 40% fill, no
// deterministic pass, no blur penalty, low symmetry risk scores 45–50. Picking
// 50 lets those through while rejecting the 2026-04-20 pattern where both
// candidates scored exactly fill=50 with pass:false and got silently shipped.
// The later combinedQualityCheck gate still has final say via its own
// V5_QA_PASS_SCORE / V5_BEST_OF_MIN_SCORE thresholds.
// ---------------------------------------------------------------------------
const V5_CANDIDATE_MIN_COMPOSITE = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessImageV5Params extends ProcessImageParams {
  /** Pre-downloaded reference image buffers for multi-angle orders. */
  referenceImageBuffers?: Buffer[];
}

type Track = 'COMPOSITE' | 'DIRECT';

// ---------------------------------------------------------------------------
// Helpers — Border detection (minimal inline version)
// ---------------------------------------------------------------------------

async function detectAndCropBorder(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;

    if (w < 200 || h < 200) return buffer;

    const raw = await sharp(buffer).raw().toBuffer();
    const channels = meta.channels ?? 3;

    const stripW = Math.max(4, Math.round(w * 0.03));
    const stripH = Math.max(4, Math.round(h * 0.03));

    function getStripVariance(pixels: number[]): number {
      if (pixels.length === 0) return 999;
      const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
      return pixels.reduce((sum, v) => sum + (v - mean) ** 2, 0) / pixels.length;
    }

    function sampleEdge(edge: 'top' | 'bottom' | 'left' | 'right'): number[] {
      const values: number[] = [];
      const step = 3;
      if (edge === 'top') {
        for (let y = 0; y < stripH; y += step)
          for (let x = 0; x < w; x += step) {
            const idx = (y * w + x) * channels;
            values.push(raw[idx]!, raw[idx + 1]!, raw[idx + 2]!);
          }
      } else if (edge === 'bottom') {
        for (let y = h - stripH; y < h; y += step)
          for (let x = 0; x < w; x += step) {
            const idx = (y * w + x) * channels;
            values.push(raw[idx]!, raw[idx + 1]!, raw[idx + 2]!);
          }
      } else if (edge === 'left') {
        for (let y = 0; y < h; y += step)
          for (let x = 0; x < stripW; x += step) {
            const idx = (y * w + x) * channels;
            values.push(raw[idx]!, raw[idx + 1]!, raw[idx + 2]!);
          }
      } else {
        for (let y = 0; y < h; y += step)
          for (let x = w - stripW; x < w; x += step) {
            const idx = (y * w + x) * channels;
            values.push(raw[idx]!, raw[idx + 1]!, raw[idx + 2]!);
          }
      }
      return values;
    }

    const variances = {
      top:    getStripVariance(sampleEdge('top')),
      bottom: getStripVariance(sampleEdge('bottom')),
      left:   getStripVariance(sampleEdge('left')),
      right:  getStripVariance(sampleEdge('right')),
    };

    const THRESHOLD = 150;
    const borderCount =
      (variances.top    < THRESHOLD ? 1 : 0) +
      (variances.bottom < THRESHOLD ? 1 : 0) +
      (variances.left   < THRESHOLD ? 1 : 0) +
      (variances.right  < THRESHOLD ? 1 : 0);

    if (borderCount < 2) return buffer;

    const cropTop    = variances.top    < THRESHOLD ? stripH + Math.round(h * 0.01) : 0;
    const cropBottom = variances.bottom < THRESHOLD ? stripH + Math.round(h * 0.01) : 0;
    const cropLeft   = variances.left   < THRESHOLD ? stripW + Math.round(w * 0.01) : 0;
    const cropRight  = variances.right  < THRESHOLD ? stripW + Math.round(w * 0.01) : 0;

    const newW = w - cropLeft - cropRight;
    const newH = h - cropTop - cropBottom;

    if (newW < w * 0.8 || newH < h * 0.8) return buffer;

    const cropped = await sharp(buffer)
      .extract({ left: cropLeft, top: cropTop, width: newW, height: newH })
      .resize(Math.max(newW, newH), Math.max(newW, newH), { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .jpeg({ quality: 92 })
      .toBuffer();

    console.info(JSON.stringify({
      event: 'v5_border_detected_and_cropped',
      borderCount,
      originalSize: `${w}x${h}`,
      newSize: `${newW}x${newH}`,
    }));

    return cropped;
  } catch {
    return buffer;
  }
}

// ---------------------------------------------------------------------------
// Candidate selector — deterministic, no API cost
// ---------------------------------------------------------------------------

interface CandidateSelection {
  buffer: Buffer;
  compositeScore: number;
  clearedThreshold: boolean;
}

/**
 * Compute composite score from deterministic-check output.
 * See V5_CANDIDATE_MIN_COMPOSITE comment for weighting rationale.
 */
function computeCompositeScore(check: {
  pass: boolean;
  estimatedFillPct: number;
  quadrantSymmetry: number;
  failReason: string | null;
}): number {
  const fill = check.estimatedFillPct ?? 0;
  const deterministicPass = check.pass ? 20 : 0;
  const sharpness = check.failReason?.includes('blurry') ? 0 : 10;
  const symmetryPenalty = (check.quadrantSymmetry ?? 0) * 50;
  return Math.max(0, fill + deterministicPass + sharpness - symmetryPenalty);
}

async function selectBestCandidate(
  inputBuffer: Buffer,
  candidates: Buffer[],
): Promise<CandidateSelection> {
  if (candidates.length === 1) {
    // Single candidate — still run the gate so caller can fall through to Tier 2.
    const only = await runDeterministicChecks(inputBuffer, candidates[0]!);
    const composite = computeCompositeScore(only);
    const cleared = composite >= V5_CANDIDATE_MIN_COMPOSITE;

    console.info(JSON.stringify({
      event: 'v5_candidate_selected',
      winner: 0,
      totalCandidates: 1,
      compositeScore: composite,
      threshold: V5_CANDIDATE_MIN_COMPOSITE,
      clearedThreshold: cleared,
      scores: [{ idx: 0, pass: only.pass, fill: only.estimatedFillPct, composite }],
    }));

    return {
      buffer: candidates[0]!,
      compositeScore: composite,
      clearedThreshold: cleared,
    };
  }

  const checks = await Promise.all(candidates.map(c => runDeterministicChecks(inputBuffer, c)));

  // Composite score drives selection AND the gate. See V5_CANDIDATE_MIN_COMPOSITE.
  const composites = checks.map(computeCompositeScore);

  let bestIdx = 0;
  let bestComposite = -Infinity;

  for (let i = 0; i < composites.length; i++) {
    if (composites[i]! > bestComposite) {
      bestComposite = composites[i]!;
      bestIdx = i;
    }
  }

  const cleared = bestComposite >= V5_CANDIDATE_MIN_COMPOSITE;

  console.info(JSON.stringify({
    event: 'v5_candidate_selected',
    winner: bestIdx,
    totalCandidates: candidates.length,
    compositeScore: bestComposite,
    threshold: V5_CANDIDATE_MIN_COMPOSITE,
    clearedThreshold: cleared,
    scores: checks.map((c, i) => ({
      idx: i,
      pass: c.pass,
      fill: c.estimatedFillPct,
      composite: composites[i],
    })),
  }));

  return {
    buffer: candidates[bestIdx]!,
    compositeScore: bestComposite,
    clearedThreshold: cleared,
  };
}

// ---------------------------------------------------------------------------
// Neutral canvas for COMPOSITE background generation
// ---------------------------------------------------------------------------

async function getNeutralCanvas(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Track COMPOSITE — BiRefNet + Gemini BG run in parallel
// ---------------------------------------------------------------------------

interface CompositeTrackResult {
  compositedBuffer: Buffer;
  cutoutBuffer: Buffer | null;
}

async function runCompositeTrack(
  processedBuffer: Buffer,
  imageUrl: string,
  style: string,
  analysis: LightAnalysis,
  voiceInstructions: string | undefined,
  referenceBuffers: Buffer[] | undefined,
): Promise<CompositeTrackResult> {
  console.warn(JSON.stringify({ event: 'v5_composite_track_called_unexpectedly', style }));
  const prompt = getStylePromptV5(style, 'COMPOSITE', analysis, voiceInstructions);

  // All styles — including style_clean_white and style_studio — go through the full
  // BiRefNet + Gemini background path for proper studio-quality compositing.
  // Run BiRefNet + Gemini background generation IN PARALLEL
  const [birefnetResult, geminiResult] = await Promise.allSettled([
    // BiRefNet: background removal → cutout URL → download buffer
    removeBackground(imageUrl).then(cutoutUrl => downloadBuffer(cutoutUrl)),
    // Gemini: generate background-only scene using a neutral canvas (no product conditioning)
    getNeutralCanvas().then(neutralCanvas =>
      geminiGenerateImage({
        inputImageBuffer: neutralCanvas,
        prompt,
        temperature: 0.5,
        referenceImageBuffers: referenceBuffers,
      }).then(r => r.imageBuffer),
    ),
  ]);

  if (birefnetResult.status === 'rejected') {
    throw new Error(`BiRefNet failed: ${birefnetResult.reason instanceof Error ? birefnetResult.reason.message : String(birefnetResult.reason)}`);
  }
  if (geminiResult.status === 'rejected') {
    throw new Error(`Gemini BG generation failed: ${geminiResult.reason instanceof Error ? geminiResult.reason.message : String(geminiResult.reason)}`);
  }

  const cutoutBuffer = birefnetResult.value;
  const backgroundBuffer = geminiResult.value;

  const composited = await compositeProductOntoBackground({
    cutoutBuffer,
    backgroundBuffer,
    physicalSize: analysis.physicalSize,
    style,
  });

  return { compositedBuffer: composited, cutoutBuffer };
}

// ---------------------------------------------------------------------------
// Track DIRECT — Gemini generates full ad from product image
// ---------------------------------------------------------------------------

async function runDirectTrack(
  processedBuffer: Buffer,
  style: string,
  analysis: LightAnalysis,
  voiceInstructions: string | undefined,
  referenceBuffers: Buffer[] | undefined,
  temperatures: number[],
): Promise<CandidateSelection> {
  const prompt = getStylePromptV5(style, 'DIRECT', analysis, voiceInstructions);

  if (temperatures.length === 1) {
    const result = await geminiGenerateImage({
      inputImageBuffer: processedBuffer,
      prompt,
      temperature: temperatures[0],
      referenceImageBuffers: referenceBuffers,
    });
    return selectBestCandidate(processedBuffer, [result.imageBuffer]);
  }

  // Generate multiple candidates in parallel, pick best deterministically
  const settled = await Promise.allSettled(
    temperatures.map(temp =>
      geminiGenerateImage({
        inputImageBuffer: processedBuffer,
        prompt,
        temperature: temp,
        referenceImageBuffers: referenceBuffers,
      }).then(r => r.imageBuffer),
    ),
  );

  const successful = settled
    .filter((r): r is PromiseFulfilledResult<Buffer> => r.status === 'fulfilled')
    .map(r => r.value);

  if (successful.length === 0) {
    throw new Error('All parallel Gemini generations failed');
  }

  return selectBestCandidate(processedBuffer, successful);
}

// ---------------------------------------------------------------------------
// Apply post-processing pipeline
// ---------------------------------------------------------------------------

async function applyPostProcessing(buffer: Buffer, style: string): Promise<Buffer> {
  let result = await postProcessFinal(buffer, style);
  result = await addAILabel(result);
  return result;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * V5 creative ad pipeline.
 *
 * COMPOSITE track (branded products, not with_model):
 *   BiRefNet cutout + Gemini background scene → sharp compositing
 *   For clean_white/studio: styled studio shot instead of Gemini BG
 *
 * DIRECT track (unbranded or with_model):
 *   2 parallel Gemini full-ad generations → deterministic candidate selection
 *
 * QA: 3 binary questions → one retry on failure → deliver whatever comes back
 */
export async function processProductImageV5(
  params: ProcessImageV5Params,
): Promise<ProcessImageResult> {
  const totalStart = Date.now();
  const style = params.style ?? 'style_lifestyle';
  const voiceInstructions = params.voiceInstructions;

  console.info(JSON.stringify({
    event: 'v5_pipeline_start',
    style,
    hasVoiceInstructions: !!voiceInstructions,
    hasReferences: !!(params.referenceImageBuffers?.length),
  }));

  // ── Stage 1: Download + preprocess ────────────────────────────────────────

  let rawBuffer: Buffer;
  try {
    rawBuffer = await downloadBuffer(params.imageUrl);
  } catch (err) {
    throw new Error(`v5: Cannot download input image: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { buffer: processedBuffer } = await preprocessImage(rawBuffer);
  const croppedBuffer = await detectAndCropBorder(processedBuffer);

  // ── Stage 2: Light analysis ────────────────────────────────────────────────
  //
  // lightAnalyze now throws on timeout / parse failure instead of silently
  // returning defaults. We catch here and continue with hadAnalysis=false.
  // The generation still has the input image + reference buffers (Gemini i2i
  // carries the product identity), so a blind run can still produce a usable
  // ad — it just can't route on productName/category. That is better than
  // building a prompt that says "product / other" when the user sent a
  // Rubik's cube and got three wrong-color ads back.

  const allBuffersForAnalysis = [croppedBuffer, ...(params.referenceImageBuffers ?? [])];
  let analysis: LightAnalysis;
  let hadAnalysis = true;
  try {
    analysis = await lightAnalyze(allBuffersForAnalysis);
  } catch (err) {
    hadAnalysis = false;
    console.warn(JSON.stringify({
      event: 'v5_light_analysis_failed',
      photoCount: allBuffersForAnalysis.length,
      error: err instanceof Error ? err.message : String(err),
      fallback: 'blind_generation_with_references',
    }));
    analysis = {
      productName: 'product',
      productCategory: params.productCategory ?? 'other',
      hasBranding: true,
      physicalSize: 'medium',
      dominantColors: ['neutral'],
      typicalSetting: 'tabletop',
      usable: true,
      itemCount: 1,
      items: ['product'],
      setDescription: null,
    };
  }

  // ── Stage 2b: Usability gate ───────────────────────────────────────────────

  if (!analysis.usable) {
    console.info(JSON.stringify({ event: 'v5_input_rejected', reason: 'lightAnalyze usable=false' }));
    // Return early — never-fail will catch us and run Tier 2
    throw new Error('v5: Input image not usable for advertising (blurry, no product, or screenshot)');
  }

  // ── Stage 3: Route to track ────────────────────────────────────────────────

  const isWithModel = style === 'style_with_model';

  // Categories where visual detail fidelity is critical — kept for documentation.
  // COMPOSITE track is currently disabled due to consistent compositing artifacts
  // (transparent ghost products, crosshatch patterns, pixelated outputs).
  // May be revisited once a proper inpainting model (e.g. Flux Pro Fill) is integrated.
  const fidelityCriticalCategories = ['jewellery', 'handicraft', 'electronics', 'candle', 'bag', 'home_goods'];

  // COMPOSITE track has been disabled due to consistent compositing artifacts.
  // DIRECT track produces more reliable results — slight product drift is acceptable.
  const track: Track = 'DIRECT';

  console.info(JSON.stringify({
    event: 'v5_track_selected',
    track,
    style,
    hadAnalysis,
    productName: analysis.productName,
    physicalSize: analysis.physicalSize,
    productCategory: analysis.productCategory,
    hasBranding: analysis.hasBranding,
    reason: 'DIRECT only — COMPOSITE disabled',
  }));

  // ── Stage 4: Generation loop (attempt 1, then 1 retry) ────────────────────
  //
  // QA gate: combinedQualityCheck with full fidelity scoring (0-100 score,
  // 0-35 productFidelityScore, fundamental error / anatomy / integration
  // checks). Pass criteria mirror the V3 orchestrator:
  //   score >= V5_QA_PASS_SCORE (65)
  //   AND productFidelityScore >= V5_QA_FIDELITY_MIN (25) — skipped for
  //       style_with_model since Gemini intentionally regenerates the
  //       product into the person's hand and strict fidelity is wrong.
  //   AND no fundamental error / random text / sketches
  //   AND humanAnatomy != 'major_issue' AND productIntegration != 'impossible'
  //
  // If neither attempt passes, we keep the best-scored attempt — delivering
  // a 60-score ad is still better than dropping to Tier 2 (styled studio,
  // qaScore 50). If even the best-of is below V5_BEST_OF_MIN_SCORE, throw
  // so never-fail falls through to Tier 2.
  // ---------------------------------------------------------------------------

  const checkFidelity = !isWithModel;

  let bestBuffer: Buffer | null = null;
  let bestScore = -1;
  let bestFidelityScore = -1;
  let bestQa: Awaited<ReturnType<typeof combinedQualityCheck>> | null = null;
  let qaPass = false;
  let attempts = 0;

  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt;
    const isRetry = attempt > 1;

    console.info(JSON.stringify({ event: 'v5_generation_attempt', attempt, track }));

    let candidateBuffer: Buffer | null = null;

    try {
      // COMPOSITE track is disabled — always run DIRECT.
      // attempt 1 uses 2 parallel temps, retry uses single call.
      // Phase 1 (2026-04-20): lowered from [0.5, 0.7] / [0.5] to [0.3, 0.4] / [0.3]
      // per Gemini 3 Pro best-practice research — lower temp = higher product fidelity,
      // tighter inter-generation consistency. Still two candidates for multi-run selection
      // since Pro has no seed parameter.
      const temperatures = isRetry ? [0.3] : [0.3, 0.4];
      const selection = await runDirectTrack(
        croppedBuffer,
        style,
        analysis,
        voiceInstructions,
        params.referenceImageBuffers,
        temperatures,
      );

      // Composite score gate: if the best candidate from this attempt didn't
      // clear the deterministic threshold, skip the expensive QA call and
      // retry (or fall through to Tier 2 on the final attempt). Previously the
      // gate was decorative — a candidate with pass:false, fill:50 would still
      // hit QA unchanged. Now it gets a chance to retry first.
      if (!selection.clearedThreshold) {
        console.warn(JSON.stringify({
          event: 'v5_composite_gate_failed',
          attempt,
          compositeScore: selection.compositeScore,
          threshold: V5_CANDIDATE_MIN_COMPOSITE,
          action: isRetry ? 'fallthrough_to_tier2' : 'retry',
        }));
        if (isRetry) {
          // Nothing cleared on retry either — let never-fail run Tier 2.
          throw new Error(
            `v5: composite-score gate failed (best=${selection.compositeScore.toFixed(1)}, threshold=${V5_CANDIDATE_MIN_COMPOSITE}) — falling to Tier 2`,
          );
        }
        continue;
      }

      candidateBuffer = selection.buffer;
    } catch (genErr) {
      console.error(JSON.stringify({
        event: 'v5_generation_error',
        attempt,
        track,
        error: genErr instanceof Error ? genErr.message : String(genErr),
      }));
      // If this was the first attempt, try once more. If retry also failed, propagate.
      if (isRetry) throw genErr;
      continue;
    }

    // Post-process — wrap in try/catch so a post-processing error doesn't discard a good image
    let postProcessed: Buffer;
    try {
      postProcessed = await applyPostProcessing(candidateBuffer, style);
    } catch (ppErr) {
      console.warn(JSON.stringify({
        event: 'v5_post_processing_error',
        attempt,
        error: ppErr instanceof Error ? ppErr.message : String(ppErr),
        fallback: 'using_unprocessed_buffer',
      }));
      postProcessed = candidateBuffer;
    }

    // QA check — full fidelity-aware scoring
    const qa = await combinedQualityCheck(croppedBuffer, postProcessed, {
      checkFidelity,
      voiceInstructions,
    });

    console.info(JSON.stringify({
      event: 'v5_qa_result',
      attempt,
      pass: qa.pass,
      score: qa.score,
      fidelityScore: qa.productFidelityScore,
      fidelity: qa.productFidelity,
      hasFundamentalError: qa.hasFundamentalError,
      hasRandomText: qa.hasRandomText,
      humanAnatomy: qa.humanAnatomy,
      productIntegration: qa.productIntegration,
      issues: qa.issues,
      checkFidelity,
    }));

    // Hard rejection on fundamental errors — don't consider this as "best-of".
    // Retry if attempts remain; otherwise fall through to best-of / Tier 2.
    if (qa.hasFundamentalError) {
      console.warn(JSON.stringify({
        event: 'v5_fundamental_error_detected',
        attempt,
        description: qa.fundamentalErrorDescription,
      }));
      continue;
    }

    // Track best-of across attempts
    if (qa.score > bestScore) {
      bestScore = qa.score;
      bestFidelityScore = qa.productFidelityScore;
      bestBuffer = postProcessed;
      bestQa = qa;
    }

    const fidelityOk = !checkFidelity || qa.productFidelityScore >= V5_QA_FIDELITY_MIN;
    const passesGate =
      qa.pass &&
      qa.score >= V5_QA_PASS_SCORE &&
      fidelityOk &&
      qa.humanAnatomy !== 'major_issue' &&
      qa.productIntegration !== 'impossible';

    if (passesGate) {
      qaPass = true;
      break; // QA passed — no retry needed
    }

    console.info(JSON.stringify({
      event: isRetry ? 'v5_qa_failed_using_best_of' : 'v5_qa_failed_retrying',
      attempt,
      score: qa.score,
      fidelityScore: qa.productFidelityScore,
    }));
  }

  // ── Decide final buffer — either QA-passed or best-of-acceptable ─────────
  //
  // If we never passed QA, deliver the best-of only when it clears the
  // degraded threshold AND (for fidelity-checked styles) still preserves the
  // product enough to be recognizable. Otherwise throw so Tier 2 takes over.

  let outputBuffer: Buffer | null = null;
  let finalScore = 0;

  if (qaPass && bestBuffer && bestQa) {
    outputBuffer = bestBuffer;
    finalScore = bestScore;
  } else if (
    bestBuffer &&
    bestScore >= V5_BEST_OF_MIN_SCORE &&
    (!checkFidelity || bestFidelityScore >= V5_QA_FIDELITY_MIN)
  ) {
    outputBuffer = bestBuffer;
    finalScore = bestScore;
    console.info(JSON.stringify({
      event: 'v5_delivering_best_of',
      score: bestScore,
      fidelityScore: bestFidelityScore,
    }));
  } else {
    console.warn(JSON.stringify({
      event: 'v5_rejecting_output_falling_to_tier2',
      bestScore,
      bestFidelityScore,
      reason:
        bestBuffer === null
          ? 'no_candidate_survived_fundamental_error_gate'
          : 'best_of_below_thresholds',
    }));
    throw new Error(
      `v5: QA gate failed — bestScore=${bestScore} bestFidelity=${bestFidelityScore} (below thresholds, falling to Tier 2)`,
    );
  }

  // ── Stage 5: Upload output + cutout, then return ──────────────────────────

  const outputUrl = await uploadToStorage(outputBuffer, `output_v5_${Date.now()}.jpg`);

  // COMPOSITE track is disabled — no cutout to upload (DIRECT track does not produce one)
  const cutoutUrl: string | undefined = undefined;

  const durationMs = Date.now() - totalStart;
  console.info(JSON.stringify({
    event: 'v5_pipeline_complete',
    track,
    style,
    attempts,
    qaPass,
    hadAnalysis,
    finalScore,
    finalFidelityScore: bestFidelityScore,
    durationMs,
  }));

  return {
    outputUrl,
    outputBuffer,
    cutoutUrl,
    qaScore: finalScore,
    pipeline: 'primary',
    attempts,
    durationMs,
    inputAssessment: {
      usable: true,
      productCategory: analysis.productCategory,
    },
  };
}

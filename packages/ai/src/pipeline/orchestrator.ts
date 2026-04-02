import { preprocessImage } from './preprocess.js';
import { analyzeAndPlan, type AnalyzeAndPlanResult } from './product-analyzer.js';
import { createStudioShot, inpaintStudioBackground, generateReferenceScene, postProcessFinal, addAILabel, refineWithKontext, restoreFaces, upscaleDownscale, uploadToStorage, downloadBuffer, recompositeProduct, harmonizeLighting } from './fallback.js';
import { runBriaProductShot } from './product-shot.js';
import { combinedQualityCheck } from '../qa/combined-qa.js';
import type { ProductAnalysis } from './product-analyzer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessImageParams {
  imageUrl: string;
  style?: string;
  productCategory?: string;
  voiceInstructions?: string;
  maxAttempts?: number;
}

export interface ProcessImageResult {
  outputUrl: string;
  cutoutUrl?: string;
  studioShotUrl?: string;
  qaScore: number;
  pipeline: 'composite';
  attempts: number;
  durationMs: number;
  inputAssessment?: { usable: boolean; productCategory: string };
  productAnalysis?: ProductAnalysis;
  adPrompt?: string;
  rejected?: boolean;
  rejectionReason?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QA_PASS_SCORE = 65;
const QA_FIDELITY_MIN = 25;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Two-track creative ad pipeline with branding-aware routing.
 *
 * TRACK A (branded products — has logos/text):
 *   1. Generate empty background scene via Flux Pro Fill
 *   2. Composite real product cutout with harmonization
 *   3. Combined QA with fidelity check
 *
 * TRACK B (unbranded products — no logos):
 *   1. Seedream generates full creative ad (product regenerated, that's OK)
 *   2. Combined QA without fidelity check
 *
 * FALLBACK: Bria Product Shot → Studio shot on white
 *
 * Only 2 Gemini calls total (1 analysis + 1 QA).
 */
export async function processProductImage(
  params: ProcessImageParams
): Promise<ProcessImageResult> {
  const totalStart = Date.now();

  // -------------------------------------------------------------------------
  // Stage 1: Download + preprocess
  // -------------------------------------------------------------------------

  let rawBuffer: Buffer;
  try {
    rawBuffer = await downloadBuffer(params.imageUrl);
  } catch (err) {
    throw new Error(`Cannot download input image: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { buffer: processedBuffer } = await preprocessImage(rawBuffer);

  // -------------------------------------------------------------------------
  // Stage 2: PARALLEL — BiRefNet cutout + Consolidated Gemini analysis
  // -------------------------------------------------------------------------

  const category = params.productCategory ?? 'other';

  const [studioResult, plan] = await Promise.all([
    // BiRefNet → cutout → studio shot (our guaranteed fallback)
    createStudioShot(params.imageUrl, category),

    // Single Gemini call: QA + analysis + branding detection + style-aware prompt generation
    analyzeAndPlan(processedBuffer, params.voiceInstructions, params.style).catch((err): AnalyzeAndPlanResult | null => {
      console.error(JSON.stringify({ event: 'analyze_and_plan_error', error: err instanceof Error ? err.message : String(err) }));
      return null;
    }),
  ]);

  const { studioBuffer, cutoutBuffer } = studioResult;
  const studioShotUrl = await uploadToStorage(studioBuffer, `studio_${Date.now()}.jpg`);

  // Handle analysis failure or rejected input
  if (!plan || !plan.usable) {
    const reason = plan?.rejectionReason ?? 'Analysis failed — image may not contain a usable product';
    console.info(JSON.stringify({ event: 'input_rejected', reason }));
    return {
      outputUrl: studioShotUrl, qaScore: 0, pipeline: 'composite', attempts: 0,
      durationMs: Date.now() - totalStart,
      inputAssessment: { usable: false, productCategory: category },
      rejected: true, rejectionReason: reason,
    };
  }

  // Use branding confidence to make routing decision — if uncertain, preserve product (Track A)
  const hasBranding = plan.hasBranding || plan.brandingConfidence >= 0.3;

  // With Model uses Track B (Seedream full generation) — best person quality for now
  // TODO: Implement hybrid approach (inpainting for small products, Seedream for large)
  const isWithModel = params.style === 'style_with_model';
  const forceTrackB = !hasBranding || isWithModel;
  const useTrackA = hasBranding && !isWithModel;

  console.info(JSON.stringify({
    event: 'pipeline_routed',
    track: useTrackA ? 'A_branded' : 'B_unbranded',
    productName: plan.analysis.productName,
    hasBranding: plan.hasBranding,
    brandingConfidence: plan.brandingConfidence,
    effectiveBranding: hasBranding,
    forceTrackB,
    brandElements: plan.brandElements,
    scenePromptPreview: plan.scenePrompt.slice(0, 80),
  }));

  // -------------------------------------------------------------------------
  // Stage 3: Generation with retry loop (up to 2 attempts before fallback)
  // -------------------------------------------------------------------------

  const MAX_GENERATION_ATTEMPTS = 2;
  let bestAdBuffer: Buffer | null = null;
  let bestQaScore = 0;
  let bestFidelityScore = 0;
  let totalAttempts = 0;
  let lastQaResult: Awaited<ReturnType<typeof combinedQualityCheck>> | null = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    totalAttempts = attempt;
    let adBuffer: Buffer | null = null;

    // Adjust prompt on retry based on QA feedback — category-specific fixes
    let currentScenePrompt = plan.scenePrompt;
    let currentBgPrompt = plan.backgroundOnlyPrompt;
    if (attempt > 1 && lastQaResult) {
      // Parse issues into targeted fix instructions (keep under 150 tokens for Seedream)
      const issueText = lastQaResult.issues.join(' ').toLowerCase();
      const fixes: string[] = [];

      if (lastQaResult.humanAnatomy === 'major_issue' || issueText.includes('finger') || issueText.includes('hand') || issueText.includes('anatomy')) {
        fixes.push('Every hand must show exactly 5 fingers. Natural human proportions only.');
      }
      if (lastQaResult.productIntegration === 'impossible' || issueText.includes('product') || issueText.includes('visible') || issueText.includes('small')) {
        fixes.push('Product must be large, centered, well-lit, and the dominant subject.');
      }
      if (issueText.includes('float') || issueText.includes('gravity') || issueText.includes('physics') || !lastQaResult.physicallyPlausible) {
        fixes.push('Everything must rest naturally on surfaces. Nothing floating.');
      }
      if (lastQaResult.hasRandomText || issueText.includes('text') || issueText.includes('watermark')) {
        fixes.push('No text anywhere except on the product itself.');
      }
      if (issueText.includes('face') || issueText.includes('skin') || issueText.includes('uncanny')) {
        fixes.push('Person must look completely photorealistic with natural skin texture.');
      }

      if (fixes.length > 0) {
        const suffix = `. CRITICAL FIXES: ${fixes.join(' ')}`;
        currentScenePrompt += suffix;
        currentBgPrompt += suffix;
      }
      console.info(JSON.stringify({ event: 'retry_with_fixes', attempt, fixCount: fixes.length, fixes }));
    }

    if (params.style === 'style_clean_white' || params.style === 'style_studio') {
      // ===== CLEAN WHITE / STUDIO: Use studio shot directly — no Flux needed =====
      console.info(JSON.stringify({ event: 'studio_direct', attempt }));
      adBuffer = studioBuffer;
    } else if (useTrackA) {
      // ===== TRACK A: Bria Product Shot + recomposite =====
      // Bria is purpose-built for product photography. We feed it the studio shot
      // (clean product on white), let it generate the scene, then paste the REAL
      // product cutout back on top — guaranteeing pixel-perfect preservation.
      try {
        console.info(JSON.stringify({ event: 'track_a_bria_start', attempt }));

        // Use studio shot URL as input to Bria (clean product on white)
        const briaResult = await runBriaProductShot({
          imageUrl: studioShotUrl,
          sceneDescription: currentScenePrompt,
          placement: 'bottom_center',
        });

        // Download Bria's output
        const briaBuffer = await downloadBuffer(briaResult.outputUrl);

        // RE-COMPOSITE: paste real product cutout back on top
        // This guarantees pixel-perfect product preservation
        adBuffer = await recompositeProduct(briaBuffer, cutoutBuffer);

        console.info(JSON.stringify({ event: 'track_a_complete', attempt }));
      } catch (err) {
        console.error(JSON.stringify({ event: 'track_a_error', attempt, error: err instanceof Error ? err.message : String(err) }));
      }
    } else {
      // ===== TRACK B: Unbranded / With Model — Seedream full generation =====
      try {
        console.info(JSON.stringify({ event: 'track_b_seedream_start', attempt }));
        adBuffer = await generateReferenceScene(studioShotUrl, currentScenePrompt);
        console.info(JSON.stringify({ event: 'track_b_complete', attempt, hasOutput: !!adBuffer }));
      } catch (err) {
        console.error(JSON.stringify({ event: 'track_b_error', attempt, error: err instanceof Error ? err.message : String(err) }));
      }
    }

    if (!adBuffer) continue;

    // Refinement pipeline: Kontext → CodeFormer (faces, retry only) → IC-Light → ESRGAN → post-process → label
    // SKIP Kontext for Track A — it alters the real product cutout we carefully preserved
    console.info(JSON.stringify({ event: 'refinement_pipeline_start', attempt, skipKontext: useTrackA }));
    if (!useTrackA) {
      adBuffer = await refineWithKontext(adBuffer, isWithModel);
    }
    // CodeFormer is slow (30-90s) — only run on retry when attempt 1 had face issues
    if (forceTrackB && attempt > 1 && lastQaResult?.humanAnatomy !== 'natural') {
      adBuffer = await restoreFaces(adBuffer);
    }

    // IC-Light V2 harmonization: unify lighting across the entire composited image.
    // Only for creative styles — clean white and studio look better without it.
    // Re-composite after IC-Light because it may subtly shift the product pixels.
    if (params.style !== 'style_clean_white' && params.style !== 'style_studio') {
      try {
        const lightPrompt = plan.analysis?.recommendedScene?.lighting ?? 'soft professional studio lighting';
        adBuffer = await harmonizeLighting(adBuffer, lightPrompt);
        // RE-COMPOSITE again after IC-Light to restore exact product pixels
        adBuffer = await recompositeProduct(adBuffer, cutoutBuffer);
      } catch (err) {
        console.warn(JSON.stringify({ event: 'iclight_failed_continuing', error: err instanceof Error ? err.message : String(err) }));
      }
    }

    adBuffer = await upscaleDownscale(adBuffer);
    adBuffer = await postProcessFinal(adBuffer, params.style);
    adBuffer = await addAILabel(adBuffer);
    console.info(JSON.stringify({ event: 'refinement_pipeline_complete', attempt }));

    // QA check
    const qa = await combinedQualityCheck(processedBuffer, adBuffer, {
      checkFidelity: useTrackA,
    });
    lastQaResult = qa;

    console.info(JSON.stringify({
      event: 'qa_result',
      attempt,
      pass: qa.pass,
      score: qa.score,
      fidelity: qa.productFidelity,
      fidelityScore: qa.productFidelityScore,
      hasRandomText: qa.hasRandomText,
      hasFundamentalError: qa.hasFundamentalError,
      humanAnatomy: qa.humanAnatomy,
      productIntegration: qa.productIntegration,
      issues: qa.issues,
    }));

    // Hard rejection — fundamental errors cannot be fixed by retry, but we still
    // try once more in case it's a random generation artifact
    if (qa.hasFundamentalError) {
      console.warn(JSON.stringify({
        event: 'fundamental_error_detected',
        attempt,
        description: qa.fundamentalErrorDescription,
      }));
      // Don't save this as best — it's unusable
      continue;
    }

    // Track best result across attempts
    if (qa.score > bestQaScore) {
      bestQaScore = qa.score;
      bestFidelityScore = qa.productFidelityScore;
      bestAdBuffer = adBuffer;
    }

    // Check if it passes
    if (qa.pass && qa.score >= QA_PASS_SCORE &&
        (!useTrackA || qa.productFidelityScore >= QA_FIDELITY_MIN) &&
        qa.humanAnatomy !== 'major_issue' &&
        qa.productIntegration !== 'impossible') {
      // QA passed — return this result
      const outputUrl = await uploadToStorage(adBuffer, `output_${Date.now()}.jpg`);
      const cutoutUrl = await uploadToStorage(cutoutBuffer, `cutout_${Date.now()}.png`, 'image/png');
      return {
        outputUrl, cutoutUrl, studioShotUrl,
        qaScore: qa.score, pipeline: 'composite', attempts: totalAttempts,
        durationMs: Date.now() - totalStart,
        inputAssessment: { usable: true, productCategory: plan.productCategory },
        productAnalysis: plan.analysis, adPrompt: plan.scenePrompt,
      };
    }

    console.info(JSON.stringify({ event: 'attempt_failed_qa', attempt, score: qa.score, willRetry: attempt < MAX_GENERATION_ATTEMPTS }));
  }

  // If we have a best attempt that scored reasonably (>= 55), use it rather than falling to generic Bria
  // But for Track A (branded), also require minimum fidelity — don't send destroyed branding
  if (bestAdBuffer && bestQaScore >= 55 && (!useTrackA || bestFidelityScore >= QA_FIDELITY_MIN)) {
    console.info(JSON.stringify({ event: 'using_best_attempt', score: bestQaScore, fidelity: bestFidelityScore }));
    const outputUrl = await uploadToStorage(bestAdBuffer, `output_${Date.now()}.jpg`);
    const cutoutUrl = await uploadToStorage(cutoutBuffer, `cutout_${Date.now()}.png`, 'image/png');
    return {
      outputUrl, cutoutUrl, studioShotUrl,
      qaScore: bestQaScore, pipeline: 'composite', attempts: totalAttempts,
      durationMs: Date.now() - totalStart,
      inputAssessment: { usable: true, productCategory: plan.productCategory },
      productAnalysis: plan.analysis, adPrompt: plan.scenePrompt,
    };
  }

  // All attempts failed QA
  console.info(JSON.stringify({ event: 'all_attempts_failed_trying_fallback', bestScore: bestQaScore }));

  // -------------------------------------------------------------------------
  // Stage 5: Fallback — Bria Product Shot
  // -------------------------------------------------------------------------

  totalAttempts++;
  let fallbackBuffer: Buffer | null = null;

  try {
    console.info(JSON.stringify({ event: 'fallback_bria_start' }));
    const { fal } = await import('@fal-ai/client');
    const key = process.env['FAL_KEY'] ?? process.env['FAL_API_KEY'] ?? '';
    fal.config({ credentials: key });

    const briaResult = (await fal.subscribe('fal-ai/bria/product-shot' as string, {
      input: {
        image_url: params.imageUrl,
        scene_description: plan.scenePrompt,
        optimize_description: true,
        num_results: 1,
        fast: true,
        placement_type: 'manual_padding',
        padding_values: [80, 80, 80, 40],  // [left, right, top, bottom] — tight padding = bigger product
        shot_size: [1024, 1024],
      },
      logs: false,
    })) as { data: { images?: Array<{ url: string }> } };

    const briaUrl = briaResult.data?.images?.[0]?.url;
    if (briaUrl) {
      const rawBria = await downloadBuffer(briaUrl);
      fallbackBuffer = await postProcessFinal(rawBria, params.style);
      fallbackBuffer = await addAILabel(fallbackBuffer);
      console.info(JSON.stringify({ event: 'fallback_bria_complete' }));
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'fallback_bria_error', error: err instanceof Error ? err.message : String(err) }));
  }

  if (fallbackBuffer) {
    // Quick QA on Bria output (no fidelity check — Bria handles product internally)
    const briaQa = await combinedQualityCheck(processedBuffer, fallbackBuffer, { checkFidelity: false });

    if (briaQa.pass && !briaQa.hasFundamentalError) {
      const outputUrl = await uploadToStorage(fallbackBuffer, `output_${Date.now()}.jpg`);
      const cutoutUrl = await uploadToStorage(cutoutBuffer, `cutout_${Date.now()}.png`, 'image/png');
      return {
        outputUrl, cutoutUrl, studioShotUrl,
        qaScore: briaQa.score, pipeline: 'composite', attempts: totalAttempts,
        durationMs: Date.now() - totalStart,
        inputAssessment: { usable: true, productCategory: plan.productCategory },
        productAnalysis: plan.analysis, adPrompt: plan.scenePrompt,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Stage 6: Ultimate fallback — studio shot
  // -------------------------------------------------------------------------

  console.info(JSON.stringify({ event: 'ultimate_fallback_studio_shot' }));
  // Apply post-processing + label to studio shot fallback
  let labeledStudio = await postProcessFinal(studioBuffer, params.style);
  labeledStudio = await addAILabel(labeledStudio);
  const labeledStudioUrl = await uploadToStorage(labeledStudio, `output_${Date.now()}.jpg`);
  const cutoutUrl = await uploadToStorage(cutoutBuffer, `cutout_${Date.now()}.png`, 'image/png');

  return {
    outputUrl: labeledStudioUrl, cutoutUrl, studioShotUrl,
    qaScore: 50, pipeline: 'composite', attempts: totalAttempts,
    durationMs: Date.now() - totalStart,
    inputAssessment: { usable: true, productCategory: plan.productCategory },
    productAnalysis: plan.analysis, adPrompt: plan.scenePrompt,
  };
}

import { preprocessImage } from './preprocess.js';
import { analyzeAndPlanV3, type AnalyzeAndPlanV3Result } from './product-analyzer-v3.js';
import { geminiGenerateImage, geminiEditImage } from './gemini-generate.js';
import { verifyAndFixBranding } from './gemini-branding-fix.js';
import { postProcessFinal, addAILabel, addAdOverlay, uploadToStorage, downloadBuffer, createStudioShot } from './fallback.js';
import { createStyledStudioShot } from './styled-studio.js';
import { combinedQualityCheck } from '../qa/combined-qa.js';
import { runDeterministicChecks } from '../qa/deterministic-checks.js';
import { runFocusedChecks } from '../qa/focused-checks.js';
import { generateKenBurnsVideo } from '../video/ken-burns.js';
import type { ProcessImageParams, ProcessImageResult } from './orchestrator.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_GENERATION_ATTEMPTS = 4; // 3 parallel + 1 retry
const PARALLEL_CANDIDATES = 3;     // V3 uses 3 candidates for bolder creative choices

// ---------------------------------------------------------------------------
// Border Detection & Auto-Crop
// ---------------------------------------------------------------------------

/**
 * Detects decorative borders/frames added by Gemini and crops them.
 * Samples edge strips and checks for near-uniform color (low variance).
 * ~50ms sharp operation, zero API cost.
 */
async function detectAndCropBorder(buffer: Buffer): Promise<{ cropped: boolean; buffer: Buffer }> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  if (w < 200 || h < 200) return { cropped: false, buffer };

  // Sample raw pixel data
  const raw = await sharp(buffer).raw().toBuffer();
  const channels = meta.channels ?? 3;

  // Check each edge strip (3% of dimension)
  const stripW = Math.max(4, Math.round(w * 0.03));
  const stripH = Math.max(4, Math.round(h * 0.03));

  function getStripVariance(pixels: number[]): number {
    if (pixels.length === 0) return 999;
    const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    return pixels.reduce((sum, v) => sum + (v - mean) ** 2, 0) / pixels.length;
  }

  function sampleEdge(edge: 'top' | 'bottom' | 'left' | 'right'): number[] {
    const values: number[] = [];
    const sampleStep = 3; // sample every 3rd pixel for speed

    if (edge === 'top') {
      for (let y = 0; y < stripH; y += sampleStep) {
        for (let x = 0; x < w; x += sampleStep) {
          const idx = (y * w + x) * channels;
          values.push(raw[idx]!, raw[idx + 1]!, raw[idx + 2]!);
        }
      }
    } else if (edge === 'bottom') {
      for (let y = h - stripH; y < h; y += sampleStep) {
        for (let x = 0; x < w; x += sampleStep) {
          const idx = (y * w + x) * channels;
          values.push(raw[idx]!, raw[idx + 1]!, raw[idx + 2]!);
        }
      }
    } else if (edge === 'left') {
      for (let y = 0; y < h; y += sampleStep) {
        for (let x = 0; x < stripW; x += sampleStep) {
          const idx = (y * w + x) * channels;
          values.push(raw[idx]!, raw[idx + 1]!, raw[idx + 2]!);
        }
      }
    } else {
      for (let y = 0; y < h; y += sampleStep) {
        for (let x = w - stripW; x < w; x += sampleStep) {
          const idx = (y * w + x) * channels;
          values.push(raw[idx]!, raw[idx + 1]!, raw[idx + 2]!);
        }
      }
    }
    return values;
  }

  // Check all 4 edges
  const variances = {
    top: getStripVariance(sampleEdge('top')),
    bottom: getStripVariance(sampleEdge('bottom')),
    left: getStripVariance(sampleEdge('left')),
    right: getStripVariance(sampleEdge('right')),
  };

  // Low variance = uniform color = likely a border
  // Threshold: variance < 150 suggests near-uniform (white/grey/colored border)
  const VARIANCE_THRESHOLD = 150;
  const hasBorderEdges =
    (variances.top < VARIANCE_THRESHOLD ? 1 : 0) +
    (variances.bottom < VARIANCE_THRESHOLD ? 1 : 0) +
    (variances.left < VARIANCE_THRESHOLD ? 1 : 0) +
    (variances.right < VARIANCE_THRESHOLD ? 1 : 0);

  // Need at least 2 edges to be border-like (a single uniform edge could be intentional)
  if (hasBorderEdges < 2) {
    return { cropped: false, buffer };
  }

  // Determine crop amounts — progressively sample inward to find where content starts
  const cropTop = variances.top < VARIANCE_THRESHOLD ? stripH + Math.round(h * 0.01) : 0;
  const cropBottom = variances.bottom < VARIANCE_THRESHOLD ? stripH + Math.round(h * 0.01) : 0;
  const cropLeft = variances.left < VARIANCE_THRESHOLD ? stripW + Math.round(w * 0.01) : 0;
  const cropRight = variances.right < VARIANCE_THRESHOLD ? stripW + Math.round(w * 0.01) : 0;

  const newW = w - cropLeft - cropRight;
  const newH = h - cropTop - cropBottom;

  if (newW < w * 0.8 || newH < h * 0.8) {
    // Cropping too much — likely not a border but a genuine light background
    return { cropped: false, buffer };
  }

  const cropped = await sharp(buffer)
    .extract({ left: cropLeft, top: cropTop, width: newW, height: newH })
    .resize(Math.max(newW, newH), Math.max(newW, newH), { fit: 'cover' })
    .jpeg({ quality: 92 })
    .toBuffer();

  console.info(JSON.stringify({
    event: 'v3_border_detected_and_cropped',
    variances,
    borderEdges: hasBorderEdges,
    crop: { top: cropTop, bottom: cropBottom, left: cropLeft, right: cropRight },
    originalSize: `${w}x${h}`,
    newSize: `${newW}x${newH}`,
  }));

  return { cropped: true, buffer: cropped };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * V3 pipeline — World-class creative ad generation.
 *
 * Built on V2's Gemini generation engine but with a fundamentally different
 * creative direction system. V2 generates "nice product photos." V3 generates
 * "ads that make people WANT the product."
 *
 * Key differences from V2:
 *   - Creative Concept System: heroMoment, dynamicElements, storyScene drive generation
 *   - Story-first generation prompt (scene → product → realism → rules)
 *   - 3 parallel candidates at different creative temperatures
 *   - Border detection & auto-crop
 *   - Selector evaluates emotional impact, not just photorealism
 */
function getStyleDirection(style: string): string {
  const directions: Record<string, string> = {
    style_clean_white: 'Pure white background, soft diffused lighting, e-commerce style. No props, no shadows.',
    style_studio: 'Bold saturated colored backdrop that complements the product. Three-point studio lighting with visible shadow on the colored surface.',
    style_gradient: 'Pitch black background, reflective dark surface with mirror reflection. Rim lighting creating glowing edges. Bold dramatic dynamic elements — splashes, particles, mist.',
    style_lifestyle: 'Warm, believable indoor environment (kitchen, cafe, living room). Natural window light, shallow DOF with creamy bokeh. 2-3 contextual props telling a story.',
    style_outdoor: 'Genuinely outdoors with real sky and foliage. Golden hour backlight with rim glow. Weathered natural surface. Extreme shallow DOF.',
    style_festive: 'Indian festival celebration — diyas, marigolds, rangoli, brass elements, silk fabric. Warm golden-amber tones (2700-3200K). Multiple warm light sources creating layered bokeh.',
    style_minimal: '60-70% intentional negative space. Rule of thirds placement. ONE hard directional light creating a long dramatic shadow. Zero props.',
    style_with_model: 'Person actively holding/wearing/using the product in a natural setting. Shallow DOF, editorial lifestyle feel.',
  };
  return directions[style] ?? directions['style_lifestyle']!;
}

export async function processProductImageV3(
  params: ProcessImageParams,
): Promise<ProcessImageResult> {
  const totalStart = Date.now();
  let totalAttempts = 0;

  console.info(JSON.stringify({ event: 'v3_pipeline_start', style: params.style, hasVoice: !!params.voiceInstructions }));

  // -------------------------------------------------------------------------
  // Stage 1: Download + Preprocess (same as V2)
  // -------------------------------------------------------------------------

  let rawBuffer: Buffer;
  try {
    rawBuffer = await downloadBuffer(params.imageUrl);
  } catch (err) {
    throw new Error(`Cannot download input image: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { buffer: processedBuffer, enhancedBuffer } = await preprocessImage(rawBuffer);
  const baseGenBuffer = enhancedBuffer ?? processedBuffer;

  // Force square input
  const sharp = (await import('sharp')).default;
  const genMeta = await sharp(baseGenBuffer).metadata();
  const genW = genMeta.width ?? 1024;
  const genH = genMeta.height ?? 1024;
  let generationBuffer = baseGenBuffer;
  if (Math.abs(genW - genH) / Math.max(genW, genH) > 0.05) {
    const maxDim = Math.max(genW, genH);
    generationBuffer = await sharp(baseGenBuffer)
      .resize(maxDim, maxDim, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .jpeg({ quality: 92 })
      .toBuffer();
    console.info(JSON.stringify({ event: 'v3_squared_input', from: `${genW}x${genH}`, to: `${maxDim}x${maxDim}` }));
  }

  // -------------------------------------------------------------------------
  // Stage 2: V3 Creative Concept Analysis
  // -------------------------------------------------------------------------

  console.info(JSON.stringify({ event: 'v3_stage2_start' }));

  const plan = await analyzeAndPlanV3(processedBuffer, params.voiceInstructions, params.style).catch(
    (err): AnalyzeAndPlanV3Result | null => {
      console.error(JSON.stringify({
        event: 'v3_analyze_error',
        error: err instanceof Error ? err.message : String(err),
      }));
      return null;
    },
  );

  console.info(JSON.stringify({
    event: 'v3_stage2_complete',
    usable: plan?.usable ?? false,
    heroMoment: plan?.heroMoment?.slice(0, 60),
    emotionalTrigger: plan?.emotionalTrigger,
  }));

  if (!plan || !plan.usable) {
    const reason = plan?.rejectionReason ?? 'Analysis failed — image may not contain a usable product';
    console.info(JSON.stringify({ event: 'v3_input_rejected', reason }));

    try {
      const styledBuffer = await createStyledStudioShot(rawBuffer, params.imageUrl, params.style ?? 'style_lifestyle', params.productCategory ?? 'other');
      let output = styledBuffer;
      output = await addAILabel(output);
      const outputUrl = await uploadToStorage(output, `output_${Date.now()}.jpg`);
      return { outputUrl, qaScore: 40, pipeline: 'styled-studio-fallback', attempts: 0, durationMs: Date.now() - totalStart, inputAssessment: { usable: false, productCategory: params.productCategory ?? 'other' }, rejected: true, rejectionReason: reason };
    } catch (studioErr) {
      console.error(JSON.stringify({ event: 'v3_rejection_studio_failed', error: studioErr instanceof Error ? studioErr.message : String(studioErr) }));
      // Last resort: enhanced original with AI label
      let output = await postProcessFinal(processedBuffer, params.style);
      output = await addAILabel(output);
      const outputUrl = await uploadToStorage(output, `output_${Date.now()}.jpg`);
      return { outputUrl, qaScore: 0, pipeline: 'composite', attempts: 0, durationMs: Date.now() - totalStart, inputAssessment: { usable: false, productCategory: params.productCategory ?? 'other' }, rejected: true, rejectionReason: reason };
    }
  }

  // -------------------------------------------------------------------------
  // Stage 3+4+5+6: Generate → Verify → Retry loop
  // -------------------------------------------------------------------------

  const validPlan = plan;
  const fillPct = Math.round((validPlan.recommendedCanvasFill ?? 0.6) * 100);
  const isSmall = validPlan.productPhysicalSize === 'tiny' || validPlan.productPhysicalSize === 'small';
  const productName = validPlan.analysis.productName;

  // -----------------------------------------------------------------------
  // STORY-FIRST Generation Prompt
  // -----------------------------------------------------------------------

  function getCameraSpec(style: string): string {
    const specs: Record<string, string> = {
      style_clean_white: 'Shot on Hasselblad X2D 100C, 90mm f/3.2, ISO 64. Tethered studio shooting. Razor-sharp focus across entire product. Even, diffused lighting.',
      style_studio: 'Shot on Hasselblad X2D 100C, 90mm f/3.2, ISO 64. Three-point studio lighting. Hard key light creating defined shadows. Medium aperture for full product sharpness.',
      style_gradient: 'Shot on Sony A7R V, 50mm f/1.2 wide open, ISO 400. Dramatic dark studio. Rim lights only. Cinematic shallow depth with crisp product focus.',
      style_lifestyle: 'Shot on Canon EOS R5, 85mm f/1.4L, ISO 100. Natural window light. Extremely shallow depth of field — beautiful creamy bokeh in background. Product sharp, environment dreamy.',
      style_outdoor: 'Shot on Fujifilm X-T5, 56mm f/1.2, Classic Chrome film simulation. Golden hour natural light. Ultra-shallow DOF — nature melts into warm bokeh. Organic, editorial feel.',
      style_festive: 'Shot on Canon EOS R5, 85mm f/1.4L, ISO 400. Multiple warm light sources (diyas, fairy lights) creating layered golden bokeh circles at different depths. Warm film-like rendering.',
      style_minimal: 'Shot on Hasselblad X2D 100C, 120mm f/4, ISO 64. Single hard light source. Clinical sharpness. Architectural precision. The shadow cast is as important as the product.',
      style_with_model: 'Shot on Canon EOS R5, 85mm f/1.4L, ISO 100. Shallow depth of field. Person and product sharp, background melting into bokeh. Warm, editorial fashion/lifestyle feel.',
    };
    return specs[style] ?? specs['style_lifestyle']!;
  }

  function buildGenerationPromptV3(warnings?: string[]): string {
    const warningBlock = warnings?.length
      ? `\nFIX THESE ISSUES FROM PREVIOUS ATTEMPT:\n${warnings.map(w => `- ${w}`).join('\n')}\n`
      : '';

    const dynamicList = validPlan.dynamicElements.length > 0
      ? `\nDynamic elements in the scene: ${validPlan.dynamicElements.join(', ')}`
      : '';

    const componentsList = validPlan.analysis?.productComponents?.length
      ? `Components: ${validPlan.analysis.productComponents.join(', ')}.`
      : '';

    // Condensation control
    const allowCondensation = validPlan.isColdBeverage ||
      ['food_beverage', 'beverage'].includes(validPlan.productCategory) ||
      /bottle|tumbler|flask|cup|glass|can|drink/i.test(validPlan.analysis?.productType ?? '');

    const isLifestyle = params.style === 'style_lifestyle';
    const isOutdoor = params.style === 'style_outdoor';

    // Style-specific direction (concise)
    const styleDirection = getStyleDirection(params.style ?? 'style_lifestyle');

    return `Create a professional product advertisement photograph.
${warningBlock}
THE SCENE:
${validPlan.creativeBrief}

THE MOMENT: ${validPlan.heroMoment}
${dynamicList}

THE PRODUCT (must match input photo EXACTLY):
${productName}. ${componentsList}
All text, logos, and brand marks must be legible and correctly spelled.
Every component visible in the input must appear in the output.
${isSmall ? 'Macro-style close crop — product DOMINATES the frame.' : `Product fills ~${isLifestyle || isOutdoor ? '35-55' : fillPct}% of frame.`}

${getCameraSpec(params.style ?? 'style_lifestyle')}

STYLE: ${styleDirection}

CONSTRAINTS:
- Product must look PHOTOGRAPHED (real materials, real light), not 3D rendered
- Exactly ONE product instance — never duplicated
- Edge-to-edge composition, NO borders or frames
- ZERO text except what is physically on the product
- Square 1:1 format${params.style !== 'style_with_model' ? '\n- NO people, hands, or body parts' : '\n- Exactly ONE Indian/South Asian person actively using the product. Natural anatomy: 2 arms, 2 hands (5 fingers each), realistic skin and expression.'}
${!allowCondensation ? '- Product surface must be completely DRY — no water droplets or condensation' : ''}`;
  }

  let adBuffer: Buffer | null = null;
  let qaResult: Awaited<ReturnType<typeof combinedQualityCheck>> | null = null;
  let lastDeterministic: Awaited<ReturnType<typeof runDeterministicChecks>> | null = null;
  let lastFocused: Awaited<ReturnType<typeof runFocusedChecks>> | null = null;
  let usedFallback = false;

  const retryWarnings: string[] = [];

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const isFirstAttempt = attempt === 0;

    console.info(JSON.stringify({
      event: 'v3_generation_attempt',
      attempt: attempt + 1,
      maxAttempts: MAX_GENERATION_ATTEMPTS,
      retryWarnings,
      productName,
    }));

    // ------- GENERATE -------
    const prompt = buildGenerationPromptV3(retryWarnings.length > 0 ? retryWarnings : undefined);
    totalAttempts++;

    try {
      if (isFirstAttempt) {
        // V3: 3 parallel candidates at different creative temperatures
        totalAttempts += (PARALLEL_CANDIDATES - 1);

        const candidates = await Promise.allSettled(
          [0.5, 0.8, 1.0].map(temp =>
            geminiGenerateImage({ inputImageBuffer: generationBuffer, prompt, temperature: temp })
          )
        );

        const successfulCandidates = candidates
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof geminiGenerateImage>>> => r.status === 'fulfilled')
          .map(r => r.value);

        if (successfulCandidates.length === 0) {
          console.warn(JSON.stringify({ event: 'v3_all_parallel_failed' }));
          continue;
        }

        if (successfulCandidates.length === 1) {
          adBuffer = successfulCandidates[0]!.imageBuffer;
        } else {
          // Use Gemini to pick the best candidate — evaluate on EMOTIONAL IMPACT + STORYTELLING
          adBuffer = await selectBestCandidate(generationBuffer, successfulCandidates.map(c => c.imageBuffer));
        }

        console.info(JSON.stringify({
          event: 'v3_parallel_complete',
          candidatesGenerated: successfulCandidates.length,
          attempt: attempt + 1,
        }));
      } else {
        // Retry: single generation
        const result = await geminiGenerateImage({
          inputImageBuffer: generationBuffer,
          prompt,
        });
        adBuffer = result.imageBuffer;
      }

      console.info(JSON.stringify({ event: 'v3_generation_success', attempt: attempt + 1 }));

      // ------- BORDER DETECTION & AUTO-CROP -------
      const borderResult = await detectAndCropBorder(adBuffer);
      if (borderResult.cropped) {
        adBuffer = borderResult.buffer;
      }

      // Auto-crop to square if non-square
      const outMeta = await sharp(adBuffer).metadata();
      const outW = outMeta.width ?? 0;
      const outH = outMeta.height ?? 0;
      if (outW > 0 && outH > 0 && Math.abs(outW - outH) / Math.max(outW, outH) > 0.05) {
        const minDim = Math.min(outW, outH);
        const cropLeft = Math.round((outW - minDim) / 2);
        const cropTop = Math.round((outH - minDim) / 2);
        adBuffer = await sharp(adBuffer)
          .extract({ left: cropLeft, top: cropTop, width: minDim, height: minDim })
          .jpeg({ quality: 92 })
          .toBuffer();
      }
    } catch (err) {
      console.warn(JSON.stringify({
        event: 'v3_generation_failed',
        attempt: attempt + 1,
        error: err instanceof Error ? err.message : String(err),
      }));
      continue;
    }

    // ------- LAYER 0: Deterministic Gates (<100ms) -------
    lastDeterministic = await runDeterministicChecks(processedBuffer, adBuffer);

    console.info(JSON.stringify({
      event: 'v3_layer0_complete',
      pass: lastDeterministic.pass,
      failReason: lastDeterministic.failReason,
      sceneNCC: Math.round(lastDeterministic.sceneNCC * 1000) / 1000,
      estimatedFillPct: lastDeterministic.estimatedFillPct,
    }));

    if (!lastDeterministic.pass) {
      const fr = lastDeterministic.failReason ?? '';
      if (fr.startsWith('no_scene_change')) {
        retryWarnings.push('Previous attempt was IDENTICAL to the input photo. You MUST create a COMPLETELY DIFFERENT scene — new background, new surface, new lighting, new dynamic elements.');
      } else if (fr.startsWith('product_too_small')) {
        retryWarnings.push(`Previous attempt had the product way too small (${lastDeterministic.estimatedFillPct}% fill). ZOOM IN dramatically. The product must FILL the frame at ${fillPct}%.`);
      } else if (fr.startsWith('output_is_blank')) {
        retryWarnings.push('Previous attempt produced a blank/empty image. Generate a detailed, dynamic scene with the product as hero.');
      } else if (fr.startsWith('output_blurry')) {
        retryWarnings.push('Previous attempt was blurry/smeared. Generate a SHARP, high-detail image with crisp textures and frozen dynamic elements.');
      } else if (fr.startsWith('likely_duplication')) {
        retryWarnings.push('Previous attempt DUPLICATED the product in a mirrored arrangement. Generate EXACTLY ONE product instance.');
      }
      adBuffer = null;
      continue;
    }

    if (lastDeterministic.warnings.length > 0) {
      retryWarnings.push(...lastDeterministic.warnings);
    }

    // ------- BRANDING FIX (conditional) -------
    const preBrandingBuffer = adBuffer;
    const brandingResult = await verifyAndFixBranding({
      originalProductBuffer: processedBuffer,
      generatedAdBuffer: adBuffer,
      brandElements: validPlan.brandElements,
      hasBranding: validPlan.hasBranding,
      brandingConfidence: validPlan.brandingConfidence,
    });
    adBuffer = brandingResult.imageBuffer;

    if (brandingResult.brandingFixed) {
      const brandingNCC = await runDeterministicChecks(preBrandingBuffer, adBuffer);
      if (brandingNCC.sceneNCC < 0.5) {
        console.warn(JSON.stringify({ event: 'v3_branding_fix_reverted', reason: 'scene_changed', ncc: brandingNCC.sceneNCC }));
        adBuffer = preBrandingBuffer;
      }
    }

    // ------- POST-PROCESS + AI LABEL -------
    // Post-processing is applied BEFORE QA checks so focused checks evaluate the final output.
    adBuffer = await postProcessFinal(adBuffer, params.style);
    adBuffer = await addAILabel(adBuffer);

    // ------- LAYER 1: Focused AI Binary Checks (~2s) -------
    lastFocused = await runFocusedChecks(processedBuffer, adBuffer, productName);

    console.info(JSON.stringify({
      event: 'v3_layer1_complete',
      pass: lastFocused.pass,
      productCount: lastFocused.productCount,
      hasFundamentalDefect: lastFocused.hasFundamentalDefect,
      hasRandomTextOrSketch: lastFocused.hasRandomTextOrSketch,
      hasAnatomyIssue: lastFocused.hasAnatomyIssue,
      anatomyDescription: lastFocused.anatomyDescription,
      hasComponentIssue: lastFocused.hasComponentIssue,
      componentDescription: lastFocused.componentDescription,
    }));

    if (!lastFocused.pass) {
      for (const reason of lastFocused.failReasons) {
        if (reason.startsWith('product_duplicated')) {
          retryWarnings.push('Previous attempt DUPLICATED the product. Generate EXACTLY ONE instance. The dynamic elements (splashes, crumbs) should NOT contain a second product.');
        } else if (reason === 'product_missing') {
          retryWarnings.push('Previous attempt had the product MISSING. The product MUST be the dominant subject, filling the frame.');
        } else if (reason.startsWith('fundamental_defect')) {
          retryWarnings.push(`Previous attempt had a critical defect: ${lastFocused.defectDescription ?? 'rendering artifact'}. Avoid this.`);
        } else if (reason === 'random_text_or_sketch') {
          retryWarnings.push('Previous attempt had random text, watermarks, or "AI Generated" labels. Output must be PURELY photorealistic with ZERO text except on the product itself.');
        } else if (reason.startsWith('anatomy_issue')) {
          if (params.style === 'style_with_model') {
            retryWarnings.push(`Previous attempt had a HUMAN ANATOMY ERROR: ${lastFocused.anatomyDescription ?? 'extra or missing limbs'}. The person MUST have exactly 2 arms, 2 legs, 2 hands (5 fingers each), 2 feet. Count every limb carefully. In seated/curled poses, ensure legs are CLEARLY separate and distinguishable.`);
          }
          // For non-model styles, don't push anatomy warnings — any "people" detected are likely printed imagery on the product
        } else if (reason.startsWith('component_accuracy')) {
          retryWarnings.push(`Previous attempt was MISSING or ALTERED product components: ${lastFocused.componentDescription}. ALL pieces from the original product photo must be present with their EXACT original design — same shape, proportions, and style.`);
        }
      }
      adBuffer = null;
      continue;
    }

    // ------- LAYER 2: AI Quality Scoring -------
    qaResult = await combinedQualityCheck(processedBuffer, adBuffer, {
      checkFidelity: true,
    });

    console.info(JSON.stringify({
      event: 'v3_layer2_complete',
      pass: qaResult.pass,
      score: qaResult.score,
      issues: qaResult.issues,
    }));

    if (qaResult.pass && qaResult.score >= 60) {
      // V3 uses slightly lower threshold (60 vs 65) to allow bolder creative choices
      console.info(JSON.stringify({ event: 'v3_all_layers_passed', attempt: attempt + 1, score: qaResult.score }));
      break;
    }

    // QA score low — try surgical edit
    if (qaResult.issues.length > 0 && attempt < MAX_GENERATION_ATTEMPTS - 1) {
      const issueText = qaResult.issues[0] ?? 'Improve overall quality';
      const fixPrompt = `You are given two images:
Image 1: The ORIGINAL product photo (reference)
Image 2: The current advertisement that needs ONE specific fix

THE SINGLE MOST IMPORTANT FIX:
${issueText}

Make ONLY this fix. Do not change the overall scene, composition, dynamic elements, or style. Do not alter parts of the image that are already good. The product must still match Image 1 exactly. The image must remain EDGE TO EDGE with no borders or frames. Generate the corrected image.`;

      try {
        const preEditBuffer = adBuffer;
        const fixed = await geminiEditImage({
          originalImageBuffer: processedBuffer,
          generatedImageBuffer: adBuffer,
          prompt: fixPrompt,
        });
        adBuffer = await postProcessFinal(fixed.imageBuffer, params.style);
        adBuffer = await addAILabel(adBuffer);

        // Re-check border after edit
        const editBorder = await detectAndCropBorder(adBuffer);
        if (editBorder.cropped) adBuffer = editBorder.buffer;

        const recheck = await runDeterministicChecks(processedBuffer, adBuffer);
        if (!recheck.pass) {
          adBuffer = preEditBuffer;
          break;
        }

        const recheckFocused = await runFocusedChecks(processedBuffer, adBuffer, productName);
        if (!recheckFocused.pass) {
          adBuffer = preEditBuffer;
          break;
        }

        console.info(JSON.stringify({ event: 'v3_surgical_edit_applied', issue: issueText }));
        break;
      } catch {
        console.warn(JSON.stringify({ event: 'v3_surgical_edit_failed' }));
        break;
      }
    }

    break;
  }

  // -------------------------------------------------------------------------
  // All attempts exhausted — studio shot fallback
  // -------------------------------------------------------------------------

  if (!adBuffer) {
    console.warn(JSON.stringify({ event: 'v3_all_attempts_exhausted', totalAttempts }));
    usedFallback = true;

    try {
      adBuffer = await createStyledStudioShot(rawBuffer, params.imageUrl, params.style ?? 'style_lifestyle', validPlan.productCategory);
      adBuffer = await addAdOverlay(adBuffer, { productName: validPlan.analysis?.productName, brandName: validPlan.analysis?.brandName ?? undefined, style: params.style });
      adBuffer = await addAILabel(adBuffer);
    } catch (styledErr) {
      console.warn(JSON.stringify({ event: 'v3_styled_fallback_failed', error: styledErr instanceof Error ? styledErr.message : String(styledErr) }));
      try {
        const studio = await createStudioShot(params.imageUrl, validPlan.productCategory, validPlan.recommendedCanvasFill);
        adBuffer = await postProcessFinal(studio.studioBuffer, params.style);
        adBuffer = await addAdOverlay(adBuffer, { productName: validPlan.analysis?.productName, brandName: validPlan.analysis?.brandName ?? undefined, style: params.style });
        adBuffer = await addAILabel(adBuffer);
      } catch (studioErr) {
        console.error(JSON.stringify({ event: 'v3_all_fallbacks_failed', error: studioErr instanceof Error ? studioErr.message : String(studioErr) }));
        adBuffer = await addAILabel(processedBuffer);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Stage 6.5: Ad Text Overlay (product name + brand)
  // -------------------------------------------------------------------------
  // Applied AFTER QA passes so QA evaluates the clean image, but BEFORE upload.
  adBuffer = await addAdOverlay(adBuffer, {
    productName: validPlan.analysis?.productName,
    brandName: validPlan.analysis?.brandName ?? undefined,
    style: params.style,
  });

  // -------------------------------------------------------------------------
  // Stage 7: Upload
  // -------------------------------------------------------------------------

  let outputUrl: string;
  try {
    outputUrl = await uploadToStorage(adBuffer, `output_${Date.now()}.jpg`);
  } catch (uploadErr) {
    console.error(JSON.stringify({ event: 'v3_upload_failed_retry', error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr) }));
    // Retry once after 2 seconds
    await new Promise(r => setTimeout(r, 2000));
    outputUrl = await uploadToStorage(adBuffer, `output_${Date.now()}.jpg`);
  }

  // -------------------------------------------------------------------------
  // Stage 8: Ken Burns Video (free, non-blocking)
  // -------------------------------------------------------------------------

  let videoUrl: string | undefined;
  try {
    const videoResult = await generateKenBurnsVideo(adBuffer, {
      productCategory: validPlan.productCategory,
      durationSec: 5,
    });
    videoUrl = await uploadToStorage(videoResult.videoBuffer, `video_${Date.now()}.mp4`, 'video/mp4');
    console.info(JSON.stringify({
      event: 'v3_video_complete',
      effect: videoResult.effect,
      durationMs: videoResult.durationMs,
    }));
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'v3_video_failed',
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  console.info(JSON.stringify({
    event: 'v3_pipeline_complete',
    totalAttempts,
    durationMs: Date.now() - totalStart,
    qaScore: qaResult?.score ?? 50,
    hasVideo: !!videoUrl,
    heroMoment: validPlan.heroMoment.slice(0, 60),
    emotionalTrigger: validPlan.emotionalTrigger,
    dynamicElements: validPlan.dynamicElements.length,
  }));

  return {
    outputUrl,
    videoUrl,
    cutoutUrl: undefined,
    qaScore: usedFallback ? 45 : (qaResult?.score ?? 50),
    pipeline: usedFallback ? 'styled-studio-fallback' : ('composite' as const),
    attempts: totalAttempts,
    durationMs: Date.now() - totalStart,
    inputAssessment: { usable: true, productCategory: validPlan.productCategory },
    productAnalysis: validPlan.analysis,
    adPrompt: validPlan.creativeBrief,
  };
}

// ---------------------------------------------------------------------------
// V3 Candidate Selector — evaluates EMOTIONAL IMPACT, not just photorealism
// ---------------------------------------------------------------------------

async function selectBestCandidate(
  inputBuffer: Buffer,
  candidates: Buffer[],
): Promise<Buffer> {
  if (candidates.length === 1) return candidates[0]!;

  const { GoogleGenAI } = await import('@google/genai');
  const genAI = new GoogleGenAI({
    apiKey: process.env['GOOGLE_AI_API_KEY'] ?? process.env['GOOGLE_GENAI_API_KEY'] ?? '',
  });

  function detectMime(buf: Buffer): string {
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
    return 'image/jpeg';
  }

  try {
    const inputMime = detectMime(inputBuffer);
    const inputBase64 = inputBuffer.toString('base64');

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: `You are a creative director at a top ad agency. Pick the candidate that would make someone STOP SCROLLING on Instagram and WANT this product.

EVALUATE EACH CANDIDATE ON THESE CRITERIA (IN ORDER OF IMPORTANCE):

1. PRODUCT ACCURACY (MOST IMPORTANT — DEALBREAKER) — Does the product match the original photo EXACTLY? Same shape, proportions, colors, components, details. If any candidate distorts the product (wrong shape, missing components, altered proportions, simplified details), it is AUTOMATICALLY ELIMINATED regardless of how beautiful the image is. A candidate with a perfect product in a simple scene BEATS a candidate with a distorted product in a stunning scene.
2. STYLE MATCH — Does the image match the requested style? (e.g., dark luxury should be DARK, outdoor should be genuinely OUTDOORS)
3. SCROLL-STOPPING POWER — Which remaining candidate is the most visually compelling? Bold lighting, dynamic elements, creative energy.
4. COMPOSITION — Dynamic, interesting composition? Off-center placement, rule of thirds.
5. DYNAMIC ELEMENTS — Are splashes, particles, props present and convincing?
6. LIGHTING & MOOD — Does the lighting create mood and dimension?
7. DEPTH — Foreground-midground-background separation?
8. PHOTOREALISM — Looks like a real photograph, not CGI?
9. NO DEFECTS — No borders, watermarks, text overlays, duplicate products?

CRITICAL: Product accuracy is NON-NEGOTIABLE. If only one candidate has the product right, pick that one even if it's less dramatic.

Reply with ONLY the letter: ${candidates.map((_, i) => String.fromCharCode(65 + i)).join(', ')}.` },
      { inlineData: { mimeType: inputMime, data: inputBase64 } },
    ];

    candidates.forEach((buf, i) => {
      const label = String.fromCharCode(65 + i);
      parts.push({ text: `Candidate ${label}:` });
      parts.push({ inlineData: { mimeType: detectMime(buf), data: buf.toString('base64') } });
    });

    const response = await Promise.race([
      genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('selector timed out')), 15_000)
      ),
    ]);

    const pick = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase() ?? 'A';
    const idx = pick.charCodeAt(0) - 65;
    const winner = idx >= 0 && idx < candidates.length ? idx : 0;

    console.info(JSON.stringify({
      event: 'v3_selector_complete',
      winner: String.fromCharCode(65 + winner),
      totalCandidates: candidates.length,
    }));

    return candidates[winner]!;
  } catch (err) {
    console.warn(JSON.stringify({ event: 'v3_selector_failed', error: String(err) }));
    return candidates[0]!;
  }
}

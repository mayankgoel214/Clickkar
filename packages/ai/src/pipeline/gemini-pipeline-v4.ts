import { getProviderKey } from '@autmn/keypool';

/**
 * V4 pipeline — Unified multi-reference creative ad generation.
 *
 * Key differences from V3:
 *   - Multi-reference support: passes up to 2 extra angle photos to Gemini
 *   - Uses pre-computed ProductProfileV4 from worker (skips analysis call)
 *   - Single unified QA call (replaces focused + combined + branding verify)
 *   - BiRefNet safety-net when branding QA fails after all retries
 *   - No Kontext refinement, ESRGAN upscale, CodeFormer, or video/story
 *   - Simplified tier: V4 → styled-studio-fallback → enhanced-original
 */

import { preprocessImage } from './preprocess.js';
import { analyzeProductV4, type ProductProfileV4 } from './product-analyzer-v4.js';
import { geminiGenerateImage } from './gemini-generate.js';
import { postProcessFinal, addAILabel, uploadToStorage, downloadBuffer, createStudioShot } from './fallback.js';
import { createStyledStudioShot } from './styled-studio.js';
import { runDeterministicChecks } from '../qa/deterministic-checks.js';
import { unifiedQualityCheck } from '../qa/unified-qa.js';
import type { ProcessImageParams, ProcessImageResult } from './orchestrator.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_GENERATION_ATTEMPTS = 3;
const PARALLEL_CANDIDATES = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessImageV4Params extends ProcessImageParams {
  /** Pre-downloaded buffers for any additional product angle images. */
  referenceImageBuffers?: Buffer[];
  /** Pre-computed product profile from analyzeProductV4() — skips re-analysis. */
  profileV4?: ProductProfileV4;
}

// ---------------------------------------------------------------------------
// Helpers — Border Detection (copied from V3, identical logic)
// ---------------------------------------------------------------------------

async function detectAndCropBorder(buffer: Buffer): Promise<{ cropped: boolean; buffer: Buffer }> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  if (w < 200 || h < 200) return { cropped: false, buffer };

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
    const sampleStep = 3;

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

  const variances = {
    top: getStripVariance(sampleEdge('top')),
    bottom: getStripVariance(sampleEdge('bottom')),
    left: getStripVariance(sampleEdge('left')),
    right: getStripVariance(sampleEdge('right')),
  };

  const VARIANCE_THRESHOLD = 150;
  const hasBorderEdges =
    (variances.top < VARIANCE_THRESHOLD ? 1 : 0) +
    (variances.bottom < VARIANCE_THRESHOLD ? 1 : 0) +
    (variances.left < VARIANCE_THRESHOLD ? 1 : 0) +
    (variances.right < VARIANCE_THRESHOLD ? 1 : 0);

  if (hasBorderEdges < 2) {
    return { cropped: false, buffer };
  }

  const cropTop = variances.top < VARIANCE_THRESHOLD ? stripH + Math.round(h * 0.01) : 0;
  const cropBottom = variances.bottom < VARIANCE_THRESHOLD ? stripH + Math.round(h * 0.01) : 0;
  const cropLeft = variances.left < VARIANCE_THRESHOLD ? stripW + Math.round(w * 0.01) : 0;
  const cropRight = variances.right < VARIANCE_THRESHOLD ? stripW + Math.round(w * 0.01) : 0;

  const newW = w - cropLeft - cropRight;
  const newH = h - cropTop - cropBottom;

  if (newW < w * 0.8 || newH < h * 0.8) {
    return { cropped: false, buffer };
  }

  const cropped = await sharp(buffer)
    .extract({ left: cropLeft, top: cropTop, width: newW, height: newH })
    .resize(Math.max(newW, newH), Math.max(newW, newH), { fit: 'cover' })
    .jpeg({ quality: 92 })
    .toBuffer();

  console.info(JSON.stringify({
    event: 'v4_border_detected_and_cropped',
    variances,
    borderEdges: hasBorderEdges,
    crop: { top: cropTop, bottom: cropBottom, left: cropLeft, right: cropRight },
    originalSize: `${w}x${h}`,
    newSize: `${newW}x${newH}`,
  }));

  return { cropped: true, buffer: cropped };
}

// ---------------------------------------------------------------------------
// Candidate selector — deterministic, no API cost (same as V3)
// ---------------------------------------------------------------------------

async function selectBestCandidate(inputBuffer: Buffer, candidates: Buffer[]): Promise<Buffer> {
  if (candidates.length === 1) return candidates[0]!;

  const checks = await Promise.all(candidates.map(c => runDeterministicChecks(inputBuffer, c)));

  let bestIdx = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const check = checks[i]!;
    let score = 0;

    if (check.pass) score += 100;
    score += (check.estimatedFillPct ?? 0);
    score -= (check.quadrantSymmetry ?? 0) * 50;
    if (check.sceneNCC < 0.8) score += 20;
    if (!check.failReason?.includes('blurry')) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  console.info(JSON.stringify({
    event: 'v4_deterministic_selector',
    winner: bestIdx,
    totalCandidates: candidates.length,
    scores: checks.map((c, i) => ({
      idx: i,
      pass: c.pass,
      fill: c.estimatedFillPct,
      ncc: Math.round(c.sceneNCC * 1000) / 1000,
    })),
  }));

  return candidates[bestIdx]!;
}

// ---------------------------------------------------------------------------
// Creative direction generator — lightweight Gemini text call
// ---------------------------------------------------------------------------

const CREATIVE_DIRECTION_SCHEMA_FIELDS = `{
  "heroMoment": string,
  "emotionalTrigger": "craving" | "desire" | "energy" | "comfort" | "luxury" | "freshness" | "joy" | "confidence" | "warmth" | "power" | "serenity" | "excitement" | "nostalgia" | "sophistication" | "playfulness" | "wonder",
  "storyScene": string,
  "creativeBrief": string,
  "dynamicElements": string[],
  "scenePrompt": string,
  "backgroundOnlyPrompt": string
}`;

export async function generateCreativeDirection(
  profile: ProductProfileV4,
  style: string,
  voiceInstructions?: string,
): Promise<{
  heroMoment: string;
  creativeBrief: string;
  scenePrompt: string;
  dynamicElements: string[];
  emotionalTrigger: string;
  storyScene: string;
  backgroundOnlyPrompt: string;
}> {
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

  const styleMandate = (() => {
    const mandates: Record<string, string> = {
      style_festive: `INDIAN FESTIVE — FESTIVAL-AWARE CELEBRATION. Current month: ${new Date().toLocaleString('en-US', { month: 'long' })}. Select the festival context that BEST matches THIS product and the current season: DIWALI (Oct-Nov) for gifts/candles/sweets; HOLI (March) for colorful/playful products; NAVRATRI (Sep-Oct) for fashion; EID for perfume/fashion/food; CHRISTMAS (Dec) for gifts/food; GENERIC FESTIVE when no specific festival fits. Do NOT default to Diwali for everything. Match the festival to the product's natural occasion. Warm golden lighting (2700-3500K). Festival elements are supporting cast — product is ALWAYS the hero.`,
      style_gradient: `DARK LUXURY — PRODUCT-SPECIFIC DARK TREATMENT. Select the sub-style that BEST matches THIS product: SPOTLIGHT ISOLATION for jewellery/small precious objects; WET OBSIDIAN for cold beverages/skincare/glass; SMOKE AND EMBER for candles/spices/hot beverages; NEON ACCENT for electronics/tech/energy drinks; INGREDIENT EXPLOSION for food/snacks; NOIR EDITORIAL for luxury bags/perfume/watches; CHROMATIC SPLIT for fashion/garments. Each product gets a DIFFERENT dark treatment — do NOT default to the same polished black acrylic with rim lighting for every product. Deep black background, dramatic directional lighting, premium cinematic feel.`,
      style_outdoor: 'NATURAL OUTDOOR: Golden-hour natural light, organic textures (wood, stone, leaves), real outdoor environment.',
      style_lifestyle: 'LIFESTYLE SETTING: Warm home/cafe/workspace environment, natural light, lived-in feel with contextual props. Aspirational but relatable.',
      style_studio: 'COLORED STUDIO: Clean colored backdrop (NEVER white or grey). Choose a BOLD color that complements the product. Professional studio lighting.',
      style_autmn_special: `AUTMN SPECIAL — PUSH BEYOND ALL LIMITS.
This is NOT a standard product photo. This is an AWARD-WINNING advertising campaign image.

Think like the world's most daring creative director:
- UNEXPECTED angles and compositions (not eye-level, not centered)
- DRAMATIC lighting that creates mood and emotion (not flat studio light)
- BOLD color choices that make the product EXPLODE off the screen
- ONE dynamic element that creates visual ENERGY (frozen splash, floating particles, dramatic shadow)
- The kind of image that wins Cannes Lions advertising awards

DO NOT default to "product on a table with nice lighting." That is BORING.
DO NOT create anything that looks like a standard lifestyle or outdoor shot.

Think: What would make a creative director at Ogilvy or Wieden+Kennedy say "THAT is brilliant"?

Examples of bold thinking:
- A soda bottle with an explosion of citrus and ice crystals against a pure black void with dramatic rim lighting
- A necklace draped over volcanic rock at sunset, waves crashing in background
- A skincare bottle floating in a pool of its own product, catching light like liquid gold
- A protein bar on the edge of a skyscraper ledge, city lights bokeh behind it

Be BRAVE. Be ORIGINAL. Be EXTRAORDINARY.`,
      style_clean_white: 'CLEAN WHITE: Pure white background, soft even lighting. Zero props. Only the product and its shadow.',
      style_minimal: 'MINIMAL: Muted neutral tones, vast negative space, one hard directional light creating a long dramatic shadow. Zero props.',
      style_with_model: "WITH MODEL: Show a person naturally interacting with this product. Their face must be visible — not just hands or feet. The product must be clearly visible and recognizable. The interaction should feel authentic and mid-action, not posed. You decide the best composition for THIS specific product — sometimes usage is the ad, sometimes lifestyle is the ad. Make it a professional advertisement.",
    };
    return mandates[style] ?? 'Follow the selected style closely.';
  })();

  const voiceBlock = voiceInstructions?.trim()
    ? `\nUser creative direction: "${voiceInstructions.trim().slice(0, 300)}"\nIntegrate what is relevant for this style.`
    : '';

  const prompt = `You are an elite advertising creative director. You already understand this product completely:

Product: "${profile.productName}" (${profile.productCategory})
Dominant colors: ${Array.isArray(profile.dominantColors) ? profile.dominantColors.join(', ') : profile.dominantColors}
Material: ${profile.material}
Target audience: ${profile.targetAudience}
Price segment: ${profile.priceSegment}
Has branding: ${profile.hasBranding}
Cold beverage: ${profile.isColdBeverage}
Physical size: ${profile.productPhysicalSize ?? 'unknown'}
Typical setting: ${profile.typicalSetting ?? 'not specified'}
Usage occasion: ${profile.usageOccasion ?? 'not specified'}

Now design the CREATIVE CONCEPT specifically for the "${style}" style.

STYLE MANDATE:
${styleMandate}
${voiceBlock}

Design the ONE creative concept that will make someone stop scrolling on Instagram and say "I need this."

Rules for dynamic elements:
- Gradient/dark: splashes, rim-light flares, particles, cold mist OK
- Lifestyle: steam, crumbs, ingredient scatter — contextual to product use
- Outdoor: wind-blown elements, natural light flares — no artificial mist
- Festive: diya smoke, floating petals, sparkles — no cold mist
- Clean white: subtle reflection/shadow ONLY
- Minimal: shadow ONLY — nothing else
- Studio: light play on colored surface, product shadow — no mist
- With model: person's natural environment — no artificial effects

Forbidden by category (never override):
- Jewellery: NO water, splashes, or moisture ever
- Electronics: NO water or liquid
- Garments: NO water or liquid
- Candles: NO water — only smoke wisps, warm glow, flame reflections

CRITICAL PRODUCT SEPARATION RULE: ALL fields (creativeBrief, scenePrompt, heroMoment, storyScene, backgroundOnlyPrompt) must describe ONLY the environment, lighting, props, and atmosphere — NEVER the product's appearance, text, labels, colors, materials, or design details. The product is sacred and immutable — it will be preserved pixel-perfect from the input photo. dynamicElements must describe environmental effects (splashes, particles, smoke) but NEVER effects ON the product surface (no "condensation on the can", no "light reflecting off the label", no "frost on the bottle").

CRITICAL: Return ONLY valid JSON with no markdown, no code fences, no explanation:
${CREATIVE_DIRECTION_SCHEMA_FIELDS}

The creativeBrief should be 60-100 words describing ONLY the scene environment: background surface/material, prop arrangement, lighting direction and quality, camera angle. Do NOT describe the product itself (its colors, text, labels, design, or materials) — the product will be composited exactly as-is from the reference photo. Focus entirely on what SURROUNDS the product.
End creativeBrief with: "Square format, 1:1 aspect ratio."`;

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('generateCreativeDirection timed out after 25s')), 25_000),
  );

  try {
    const response = await Promise.race([
      genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
      timeoutPromise,
    ]);

    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    const heroMoment = String(parsed.heroMoment ?? '');
    const creativeBrief = String(parsed.creativeBrief ?? '');
    const scenePrompt = String(parsed.scenePrompt ?? '');
    const dynamicElements: string[] = Array.isArray(parsed.dynamicElements)
      ? (parsed.dynamicElements as unknown[]).map(String)
      : [];
    const emotionalTrigger = String(parsed.emotionalTrigger ?? 'desire');
    const storyScene = String(parsed.storyScene ?? '');
    const backgroundOnlyPrompt = String(parsed.backgroundOnlyPrompt ?? '');

    console.info(JSON.stringify({
      event: 'creative_direction_generated',
      style,
      heroMoment: heroMoment.slice(0, 80),
      emotionalTrigger,
      dynamicElementCount: dynamicElements.length,
    }));

    return { heroMoment, creativeBrief, scenePrompt, dynamicElements, emotionalTrigger, storyScene, backgroundOnlyPrompt };
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'creative_direction_failed',
      style,
      error: err instanceof Error ? err.message : String(err),
      fallback: 'using style direction defaults',
    }));
    // Return empty strings — the pipeline falls back to getStyleDirection()
    return {
      heroMoment: '',
      creativeBrief: '',
      scenePrompt: '',
      dynamicElements: [],
      emotionalTrigger: 'desire',
      storyScene: '',
      backgroundOnlyPrompt: '',
    };
  }
}

// ---------------------------------------------------------------------------
// Style helpers (same as V3)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main V4 pipeline export
// ---------------------------------------------------------------------------

export async function processProductImageV4(
  params: ProcessImageV4Params,
): Promise<ProcessImageResult> {
  const totalStart = Date.now();
  let totalAttempts = 0;

  const style = params.style ?? 'style_lifestyle';

  console.info(JSON.stringify({
    event: 'v4_pipeline_start',
    style,
    hasVoice: !!params.voiceInstructions,
    hasProfile: !!params.profileV4,
    referenceCount: params.referenceImageBuffers?.length ?? 0,
  }));

  // -------------------------------------------------------------------------
  // Stage 1: Download + Preprocess
  // -------------------------------------------------------------------------

  let rawBuffer: Buffer;
  try {
    rawBuffer = await downloadBuffer(params.imageUrl);
  } catch (err) {
    throw new Error(`Cannot download input image: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { buffer: processedBuffer, enhancedBuffer } = await preprocessImage(rawBuffer);
  const baseGenBuffer = enhancedBuffer ?? processedBuffer;

  // Force square input (same padding logic as V3)
  const sharpMod = (await import('sharp')).default;
  const genMeta = await sharpMod(baseGenBuffer).metadata();
  const genW = genMeta.width ?? 1024;
  const genH = genMeta.height ?? 1024;
  let generationBuffer = baseGenBuffer;

  if (Math.abs(genW - genH) / Math.max(genW, genH) > 0.05) {
    const maxDim = Math.max(genW, genH);
    const padColor = (() => {
      switch (style) {
        case 'style_gradient': return { r: 0, g: 0, b: 0, alpha: 1 };
        case 'style_minimal': return { r: 240, g: 240, b: 240, alpha: 1 };
        case 'style_festive': return { r: 30, g: 20, b: 10, alpha: 1 };
        default: return { r: 255, g: 255, b: 255, alpha: 1 };
      }
    })();
    generationBuffer = await sharpMod(baseGenBuffer)
      .resize(maxDim, maxDim, { fit: 'contain', background: padColor })
      .jpeg({ quality: 92 })
      .toBuffer();
    console.info(JSON.stringify({
      event: 'v4_squared_input',
      from: `${genW}x${genH}`,
      to: `${maxDim}x${maxDim}`,
    }));
  }

  // -------------------------------------------------------------------------
  // Stage 2: Product Analysis (use pre-computed profile when available)
  // -------------------------------------------------------------------------

  let profile: ProductProfileV4;

  if (params.profileV4) {
    profile = params.profileV4;
    console.info(JSON.stringify({
      event: 'v4_using_precomputed_profile',
      productName: profile.productName,
      hasBranding: profile.hasBranding,
      primaryIndex: profile.primaryImageIndex,
      hasCreativeFields: !!(profile.creativeBrief && profile.heroMoment),
    }));

    // If creative fields were stripped from the cached profile (because they
    // were generated for a different style), check the per-style cache first,
    // then regenerate only if no cached direction exists for this style.
    if (!profile.creativeBrief || !profile.heroMoment) {
      const cachedForStyle = (profile as any).creativeDirectionByStyle?.[style];
      if (cachedForStyle?.creativeBrief && cachedForStyle?.heroMoment) {
        console.info(JSON.stringify({
          event: 'v4_reusing_cached_creative_direction',
          style,
        }));
        profile = { ...profile, ...cachedForStyle } as ProductProfileV4;
      } else {
        console.info(JSON.stringify({
          event: 'v4_regenerating_creative_direction',
          style,
          reason: 'no cached creative direction for this style',
        }));
        const creativeFields = await generateCreativeDirection(profile, style, params.voiceInstructions);
        profile = { ...profile, ...creativeFields } as ProductProfileV4;
      }
    }
  } else {
    // Fallback: analyze on the fly with the buffers we have
    const analysisBuffers = [processedBuffer, ...(params.referenceImageBuffers ?? [])];
    try {
      profile = await analyzeProductV4(analysisBuffers, params.voiceInstructions, style);
    } catch (err) {
      console.error(JSON.stringify({
        event: 'v4_analyze_error',
        error: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  }

  if (!profile.usable) {
    const reason = profile.rejectionReason ?? 'Image does not contain a usable product';
    console.info(JSON.stringify({ event: 'v4_input_rejected', reason }));

    try {
      const styledBuffer = await createStyledStudioShot(rawBuffer, params.imageUrl, style, params.productCategory ?? 'other');
      const labeled = await addAILabel(styledBuffer);
      const outputUrl = await uploadToStorage(labeled, `output_${Date.now()}.jpg`);
      return {
        outputUrl,
        qaScore: 40,
        pipeline: 'styled-studio-fallback',
        attempts: 0,
        durationMs: Date.now() - totalStart,
        inputAssessment: { usable: false, productCategory: params.productCategory ?? 'other' },
        rejected: true,
        rejectionReason: reason,
      };
    } catch {
      const labeled = await addAILabel(processedBuffer);
      const outputUrl = await uploadToStorage(labeled, `output_${Date.now()}.jpg`);
      return {
        outputUrl,
        qaScore: 0,
        pipeline: 'composite',
        attempts: 0,
        durationMs: Date.now() - totalStart,
        inputAssessment: { usable: false, productCategory: params.productCategory ?? 'other' },
        rejected: true,
        rejectionReason: reason,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Stage 3: Build generation prompt
  // -------------------------------------------------------------------------

  const productName = profile.productName;
  const productNameWithColor = profile.dominantColors?.length
    ? `${profile.dominantColors.slice(0, 2).join(' and ')} ${productName}`
    : productName;
  const fillPct = Math.round((profile.recommendedCanvasFill ?? 0.65) * 100);
  const isSmall = profile.productPhysicalSize === 'tiny' || profile.productPhysicalSize === 'small';
  const isFoodPackage = profile.productCategory === 'food' &&
    /bar|packet|pouch|sachet|bag|wrapper|can|bottle|box|jar/i.test(productName);
  const fillInstruction = isFoodPackage
    ? '85-90% of the frame in extreme close-up macro — the packaging fills nearly the entire image'
    : isSmall
      ? '70-80% of the frame in tight close-up macro'
      : null;

  // Paired/set products legitimately have 2+ pieces — used in prompt + QA productCount guard
  const isPairedProduct = /earring|jhumka|tops|pair|set|combo|kit|collection|shoe|sandal|bangle|chudi|cufflink|sock|glove/i.test(
    (profile.productType ?? '') + ' ' + (profile.productName ?? '')
  );

  // Real-world size description for scale grounding in the prompt and QA
  const physicalSizeDescription = (() => {
    switch (profile.productPhysicalSize) {
      case 'tiny': return 'fits entirely within a closed fist (ring, earring, coin-sized, ~2-5cm)';
      case 'small': return 'fits in one palm/hand (phone, wallet, stapler-sized, ~8-15cm)';
      case 'medium': return 'requires one hand to hold, forearm-length (bottle, book-sized, ~15-30cm)';
      case 'large': return 'requires two hands or larger (laptop, backpack-sized, ~30cm+)';
      default: return 'approximately hand-sized (~15cm)';
    }
  })();

  // Filter model instructions for non-model styles
  let filteredInstructions = params.voiceInstructions;
  if (style !== 'style_with_model' && filteredInstructions) {
    const modelPhrases = [
      /\b(make|have|use|add|show|include)\s+(the\s+)?(model|person|woman|man|girl|boy|lady|guy)\b[^.!?\n]*/gi,
      /\b(black|white|indian|european|asian|african)\s+(woman|man|model|person|girl|boy|lady)\b[^.!?\n]*/gi,
      /\b(blonde|brunette|redhead)\s+(hair|woman|model|person)\b[^.!?\n]*/gi,
      /\bmodel\s+(should|must|needs?\s+to)\b[^.!?\n]*/gi,
      /\b(holding|eating|drinking|wearing|using)\s+(the|a|an)\s+product\b[^.!?\n]*/gi,
    ];
    for (const pattern of modelPhrases) {
      filteredInstructions = filteredInstructions.replace(pattern, '').trim();
    }
    if (filteredInstructions.length < 5) filteredInstructions = undefined;
  }

  // Filter style-targeted instructions — strip sentences meant for other styles
  if (filteredInstructions) {
    const styleNames: Record<string, string[]> = {
      style_autmn_special: ['autmn special', 'special', 'autmn'],
      style_clean_white: ['clean white', 'white background', 'white'],
      style_lifestyle: ['lifestyle'],
      style_gradient: ['gradient', 'dark', 'luxury'],
      style_outdoor: ['outdoor', 'outside', 'nature'],
      style_studio: ['studio', 'colored studio'],
      style_festive: ['festive', 'festival', 'diwali', 'holi'],
      style_minimal: ['minimal'],
      style_with_model: ['model', 'person', 'with model'],
    };

    // Find sentences targeted at OTHER styles and remove them
    const otherStyles = Object.entries(styleNames).filter(([id]) => id !== style);
    for (const [, names] of otherStyles) {
      for (const name of names) {
        // Match patterns like "for the outdoor style, ..." or "in outdoor, ..." or "outdoor style should have..."
        const pattern = new RegExp(
          `(?:for\\s+(?:the\\s+)?${name}\\s+(?:style)?[,:]?|${name}\\s+style\\s+(?:should|must|needs?))[^.!?\\n]*[.!?]?`,
          'gi'
        );
        filteredInstructions = filteredInstructions!.replace(pattern, '').trim();
      }
    }
    if (filteredInstructions.length < 5) filteredInstructions = undefined;
  }

  // Dynamic elements — take only the single strongest
  const dynamicElements = (profile.dynamicElements ?? []).filter(el => {
    const waterKeywords = /water|splash|liquid|pour|drip|rain|ocean|wave|wet|mist|fog|steam|condensation|dew/i;
    const fireKeywords = /fire|flame|burn|ignite|spark|ember/i;
    const cat = profile.productCategory;
    const isCold = profile.isColdBeverage;

    if (!isCold && cat !== 'food' && waterKeywords.test(el)) return false;
    if (['electronics', 'skincare', 'garment'].includes(cat) && fireKeywords.test(el)) return false;
    return true;
  });

  // Bug 2 fix: compute allowCondensation/allowWaterEffects HERE (before heroDynamic) so
  // the same flags can be used to scrub product-surface effects from heroDynamic AND inside
  // buildGenerationPromptV4 (where they were previously computed for the first time).
  const _allowCondensation = profile.isColdBeverage ||
    profile.productCategory === 'food' ||
    /bottle|tumbler|flask|cup|glass|can|drink|beverage/i.test(profile.productType ?? '');

  const _allowWaterEffects = _allowCondensation ||
    /water|juice|soda|beer|wine|milk|shake|smoothie|coffee|tea|lassi|chai|nimbu|coconut|mug|thermos|kettle|pitcher|carafe|jug/i.test(profile.productType ?? '');

  let heroDynamic = dynamicElements.length > 0 ? `\nHero dynamic element: ${dynamicElements[0]}` : '';

  // Bug 2 fix: strip condensation/surface-effect words from heroDynamic using the
  // same logic applied to briefText inside buildGenerationPromptV4.
  if (!_allowCondensation && heroDynamic) {
    heroDynamic = heroDynamic
      .replace(/condensation/gi, '')
      .replace(/water\s*droplets/gi, '')
      .replace(/dew\s*drops/gi, '')
      .replace(/moisture/gi, '')
      .replace(/frost/gi, '')
      .replace(/ice\s*crystals/gi, '')
      .replace(/beaded\s*with/gi, '')
      .replace(/glistening\s*with/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    // If the entire element was purely a condensation effect, discard it
    if (heroDynamic.replace(/hero dynamic element:/i, '').trim().length < 5) {
      heroDynamic = '';
    }
  }
  if (!_allowWaterEffects && heroDynamic) {
    heroDynamic = heroDynamic
      .replace(/splash(es|ing)?/gi, '')
      .replace(/water/gi, '')
      .replace(/liquid/gi, '')
      .replace(/pour(ing)?/gi, '')
      .replace(/drip(ping|s)?/gi, '')
      .replace(/rain/gi, '')
      .replace(/wet/gi, '')
      .replace(/mist/gi, '')
      .replace(/fog/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (heroDynamic.replace(/hero dynamic element:/i, '').trim().length < 5) {
      heroDynamic = '';
    }
  }

  // Limit reference images by style — creative styles benefit less from pixel-matching references
  const effectiveReferences = (() => {
    if (!params.referenceImageBuffers?.length) return undefined;
    if (style === 'style_with_model') return params.referenceImageBuffers.slice(0, 1); // max 1
    if (
      style === 'style_autmn_special' ||
      style === 'style_outdoor' ||
      style === 'style_lifestyle'
    ) return undefined; // no refs for creative styles — let Gemini be free
    return params.referenceImageBuffers.slice(0, 2); // studio/white/gradient/etc get full refs
  })();

  const hasRefs = (effectiveReferences?.length ?? 0) > 0;
  const refCount = Math.min(effectiveReferences?.length ?? 0, 2);

  function buildMultiReferencePreamble(): string {
    if (!hasRefs) return '';
    const refLines = Array.from({ length: refCount }, (_, i) =>
      `Image ${i + 2} (REFERENCE): Additional angle showing extra product details. Use for verifying branding, texture, and surface details.`
    );
    return `MULTI-ANGLE PRODUCT REFERENCE:
Image 1 (PRIMARY): The main product photo — use this for composition and placement.
${refLines.join('\n')}

Cross-reference ALL provided angles to faithfully reproduce EVERY visible brand element, texture, and surface detail in the output.
`;
  }

  function buildBrandingInventoryBlock(): string {
    const inventory = profile.brandingInventory ?? [];
    const relevant = inventory.filter(b => b.prominence !== 'small_print');
    if (relevant.length === 0) return '';

    return `
COMPLETE BRANDING TEXT (verified from multiple product angles — reproduce EXACTLY):
${relevant.map(b => `- "${b.text}" [${b.type}]`).join('\n')}

Every text string listed above MUST appear correctly on the product in your output.
Treat each string as EXACT — do not rephrase, abbreviate, or modify any character.
`;
  }

  function buildUsageContextBlock(): string {
    const parts: string[] = [];

    const temp = profile.servingTemperature;
    if (temp && temp !== 'not_applicable') {
      if (temp === 'room_temperature') {
        parts.push('Temperature: ROOM TEMPERATURE — NO steam, NO heat effects, NO condensation, NO ice.');
      } else if (temp === 'hot') {
        parts.push('Temperature: HOT — steam and warmth effects are appropriate.');
      } else if (temp === 'cold' || temp === 'frozen') {
        parts.push('Temperature: COLD — condensation and frost are appropriate.');
      }
    }

    const method = profile.consumptionMethod;
    if (method && method.length > 3) {
      parts.push(`How consumed/used: ${method}`);
    }

    const setting = profile.typicalSetting;
    if (setting && setting.length > 3) {
      parts.push(`Typical setting: ${setting} — the scene MUST match this context`);
    }

    const vessel = profile.servingVessel;
    if (vessel && vessel !== 'not_applicable' && vessel.length > 3) {
      if (vessel.toLowerCase().includes('none') || vessel.toLowerCase().includes('wrapper') || vessel.toLowerCase().includes('package')) {
        parts.push(`Serving vessel: NONE — do NOT put this product on a plate or in a bowl. It is consumed from its original packaging.`);
      } else {
        parts.push(`Serving vessel: ${vessel}`);
      }
    }

    const utensils = profile.utensils;
    if (utensils && utensils !== 'not_applicable' && utensils.length > 3) {
      if (utensils.toLowerCase().includes('hands') || utensils.toLowerCase().includes('none')) {
        parts.push(`Utensils: HANDS ONLY — do NOT show fork, knife, spoon, or any cutlery near this product.`);
      } else {
        parts.push(`Utensils: ${utensils}`);
      }
    }

    if (parts.length === 0) return '';

    return `\nPRODUCT USAGE RULES (VIOLATING THESE MAKES THE AD UNUSABLE):\n${parts.map(p => `- ${p}`).join('\n')}\n`;
  }

  function buildAntiPatternGuards(): string {
    const category = profile.productCategory;
    const productType = (profile.productType ?? '').toLowerCase();
    const productNameLower = (profile.productName ?? '').toLowerCase();

    const guards: string[] = [];

    // Food guards
    if (category === 'food') {
      guards.push('PACKAGED PRODUCT: Show in ORIGINAL SEALED PACKAGING. Do NOT unwrap, open, cut, or break. Do NOT show contents outside wrapper.');
      guards.push('SINGLE UNIT: EXACTLY ONE package. No second bar/packet/pouch anywhere.');

      if (/chai|tea/i.test(productNameLower)) {
        guards.push('CHAI: Serve in kulhad or cutting chai glass. NEVER in a Western mug. Steam MUST be present.');
      }
      if (/coffee|filter/i.test(productNameLower)) {
        guards.push('COFFEE: If South Indian filter coffee, use davara-tumbler. NOT a paper cup.');
      }
      if (/protein|bar|energy|snack|chips|biscuit|cookie|namkeen/i.test(productNameLower)) {
        guards.push('SNACK: Grab-and-go product. Eaten BY HAND from packaging. NO plate, NO fork/knife, NO formal dining.');
      }
      if (/masala|spice|powder/i.test(productNameLower)) {
        guards.push('SPICE: Cooking INGREDIENT, not served food. Show with scattered whole spices. NEVER plated as food.');
      }
      if (/mithai|ladoo|barfi|halwa|sweet/i.test(productNameLower)) {
        guards.push('MITHAI: Serve on brass/steel thali. Marigold petals, diyas. NEVER Western plate with fork.');
      }
    }

    // Jewellery guards
    if (category === 'jewellery') {
      guards.push('JEWELLERY: NO water, condensation, or moisture EVER.');
      if (/necklace|chain|haar/i.test(productType)) {
        guards.push('NECKLACE: On velvet bust, neck, or draped on fabric. NEVER flat on desk.');
      }
      if (/bangle|chudi/i.test(productType)) {
        guards.push('BANGLE: Always show in SET (multiple). NEVER single bangle.');
      }
      if (/earring|jhumka/i.test(productType)) {
        guards.push('EARRING: Always show as PAIR.');
      }
    }

    // Garment guards
    if (category === 'garment' && /saree|sari/i.test(productType)) {
      guards.push('SAREE: MUST be draped or on mannequin. NEVER folded flat.');
    }

    // Skincare guards
    if (category === 'skincare' && /ayurved|herbal|natural/i.test(productNameLower)) {
      guards.push('AYURVEDIC: Rustic natural setting (herbs, clay, wood). NOT clinical sterile white.');
    }

    // Candle guards
    if (category === 'candle') {
      guards.push('CANDLE: MUST be shown LIT with visible flame. Indoor evening setting.');
    }

    // Home goods
    if (category === 'home_goods') {
      if (/deity|god|ganesh|lakshmi|krishna/i.test(productNameLower)) {
        guards.push('DEITY: Absolute reverence. Pooja room or altar ONLY. NEVER near food or casual settings.');
      }
      if (/frame|painting|art/i.test(productType)) {
        guards.push('WALL ART: Show on a wall in a room. NEVER flat on a table.');
      }
    }

    // Generic/other product guards (utility, stationery, tools, electronics, etc.)
    if (!['food', 'jewellery', 'garment', 'skincare', 'candle', 'home_goods'].includes(category)) {
      guards.push(`UTILITY/OFFICE PRODUCT: Place in a contextually relevant setting (desk, workspace, shelf, counter). Do NOT place office/utility products in nature scenes, beaches, or fantasy environments unless the user explicitly requested it.`);
      if (isSmall) {
        guards.push(`SMALL PRODUCT: This is a small, handheld product (${physicalSizeDescription}). It must appear at its correct real-world scale. In any scene with a person, it should fit naturally in their hand.`);
      }
    }

    if (guards.length === 0) return '';
    return `\nPRODUCT-SPECIFIC GUARDS (VIOLATING THESE MAKES THE AD UNUSABLE):\n${guards.map(g => `- ${g}`).join('\n')}\n`;
  }

  function buildGenerationPromptV4(warnings?: string[]): string {
    const warningBlock = warnings?.length
      ? `\nFIX THESE FROM PREVIOUS ATTEMPT:\n${warnings.map(w => `- ${w}`).join('\n')}\n`
      : '';

    // Autmn Special — give Gemini maximum creative freedom, skip prescriptive blocks
    const isAutmnSpecial = style === 'style_autmn_special';

    // Reuse the outer _allowCondensation / _allowWaterEffects computed before heroDynamic
    // so the same flags control both heroDynamic stripping (Bug 2 fix) and briefText stripping.
    const allowCondensation = _allowCondensation;
    const allowWaterEffects = _allowWaterEffects;

    const isLifestyle = style === 'style_lifestyle';
    const isOutdoor = style === 'style_outdoor';

    const userInstructionBlock = filteredInstructions
      ? `\nUSER'S CREATIVE DIRECTION (apply ONLY what is relevant to this style — ${style}):
"${filteredInstructions.slice(0, 300)}"
RULES: Apply only the parts relevant to this style. Ignore references to other styles or products. Do NOT alter the product's colors, materials, or physical attributes unless explicitly named. Color instructions for the background/scene create a rich textured environment in that tone, not a flat solid wall.\n`
      : '';

    const studioRule = style === 'style_studio'
      ? `\nSTUDIO STYLE: Include 2-3 props DIRECTLY derived from this product's ingredients, materials, or use-case. Examples: deodorant → mint leaves + wood chips; face cream → flower petals + botanical elements; chips → scattered chips + chili peppers; jewellery → velvet fabric + loose gemstones. If the product has no obvious derived props, use a single complementary texture (velvet, marble, brushed metal) as a surface element. The product is ALWAYS the hero — props are supporting cast.\n`
      : style === 'style_clean_white'
        ? '\nCLEAN WHITE: ZERO props. Only the product on pure white. No objects, no decorations.\n'
        : style === 'style_gradient'
          ? `\nDARK LUXURY RULES:
- The background is DARK but the product must GLOW and POP against it
- STRONG rim lighting or edge light is MANDATORY — the product's outline must be clearly separated from the dark background
- The product should be the BRIGHTEST element in the frame
- Use dramatic contrast: the darkness makes the product shine MORE, not disappear into it
- Think of it like a spotlight on a stage — the darkness exists to make the product the star
- Add at least ONE dynamic element that creates visual energy (smoke, particles, liquid, reflections)
- The scene should feel LUXURIOUS and CINEMATIC, not just "product on black background"
- Dark luxury is NOT a colored studio with black color — it's a dramatic STORY told through light and shadow
- Select the dark sub-style from the creative brief and follow it exactly: SPOTLIGHT ISOLATION for jewellery/small objects; WET OBSIDIAN for beverages/skincare/glass; SMOKE AND EMBER for candles/spices; NEON ACCENT for electronics; INGREDIENT EXPLOSION for food/snacks; NOIR EDITORIAL for luxury items; CHROMATIC SPLIT for fashion.\n`
          : style === 'style_festive'
            ? `\nFESTIVE: The scene MUST feel CELEBRATORY and WARM. Use the festival context from the creative brief matching the current month and product type. Festival elements (diyas, flowers, rangoli, etc.) COMPLEMENT the product — do NOT overwhelm it. The product is STILL the hero. Warm golden lighting (2700-3500K) dominates. Do NOT default to Diwali for everything — match the festival to the product's natural occasion.\n`
            : '';

    const colorEnforcement = profile.dominantColors?.length
      ? `The product's colors are: ${profile.dominantColors.join(', ')}. These colors MUST be preserved EXACTLY — do not shift, desaturate, or change material finish under any lighting.`
      : '';

    const transparencyGuard = profile.isTransparent
      ? '\nTRANSPARENCY RULE: This product is transparent/glass. Preserve transparency — do NOT make it opaque.\n'
      : '';

    const productStateGuard = (profile.productState === 'sealed' ||
      (profile.productCategory === 'food' && /bar|packet|pouch|bag|wrapper|can|bottle/i.test(productName)))
      ? '\nPACKAGING INTEGRITY: Show the product in its ORIGINAL SEALED PACKAGING. Do NOT unwrap, open, or show contents.\n'
      : '';

    const antiDuplicationBlock = isPairedProduct
      ? `
PRODUCT SET RULE — CRITICAL:
Show the COMPLETE SET exactly as in the input photo — all pieces together (necklace with earrings, both shoes, both earrings, the full bangle set, etc.). Do NOT add extra copies beyond what's shown in the input. Do NOT omit any piece of the set.
`
      : `
SINGLE PRODUCT RULE — CRITICAL:
Exactly ONE physical copy of the product. NOT two, NOT a pair, NOT a stack. No second product in background, no mirror reflection, no smaller copy in the distance. Fill remaining space with SCENE ELEMENTS — not a second product.
`;

    const productSpecificContext = `This advertisement is designed specifically for "${productName}". The scene, props, lighting, and mood are all chosen for THIS exact product — not a generic "${profile.productCategory}" ad.\n\n`;

    // Strip condensation mentions from creative brief if product shouldn't have them
    let briefText = profile?.creativeBrief ?? getStyleDirection(style);
    if (!allowCondensation && briefText) {
      briefText = briefText
        .replace(/steam(ing)?/gi, '')
        .replace(/condensation/gi, '')
        .replace(/water\s*droplets/gi, '')
        .replace(/dew\s*drops/gi, '')
        .replace(/moisture/gi, '')
        .replace(/beaded\s*with/gi, '')
        .replace(/glistening\s*with/gi, '')
        .replace(/frost/gi, '')
        .replace(/ice\s*crystals/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    // Bug 4 fix: defensive scrub of product-surface descriptions that may have leaked
    // into the creative brief despite the CRITICAL PRODUCT SEPARATION RULE in the prompt.
    // These patterns match sentences where Gemini describes how the product itself looks
    // (its packaging, label colors, text, branding) rather than the surrounding scene.
    if (briefText) {
      briefText = briefText
        // "The product/bottle/can/jar is red with gold accents" type sentences
        .replace(/\bthe\s+(product|package|packaging|bottle|can|box|jar|tube|packet|pouch|bag|wrapper|container)\s+(is|shows|features|displays|has|with)\s+[^.!?\n]*/gi, '')
        // "The label reads..." / "The logo shows..." type sentences
        .replace(/\b(label|logo|text|branding|lettering|typography|font)\s+(reads|says|shows|displays|features)\s+[^.!?\n]*/gi, '')
        // Color stripe/accent/panel descriptions on the product surface
        .replace(/\b(red|blue|green|gold|silver|amber|crimson|teal|orange|yellow|purple|pink|black|white)\s+(stripe|band|accent|panel|section|border|label|packaging|wrapper|text)\b[^.!?\n]*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    // For Autmn Special: skip prescriptive usage/anti-pattern blocks to maximise creative freedom,
    // but keep a lightweight setting constraint so the creative concept stays contextually plausible.
    const usageContextBlock = isAutmnSpecial
      ? (() => {
          // Keep only the setting constraint for contextual grounding
          const setting = profile.typicalSetting;
          if (setting && setting.length > 3) {
            return `\nSCENE CONTEXT (creative interpretation encouraged, but must be relevant):\n- This product is typically found in: ${setting}. Your scene should be a BOLD, CREATIVE interpretation of this context — not a literal recreation. But it must be contextually plausible (don't put office supplies on a beach, don't put food in a server room).\n`;
          }
          return '';
        })()
      : buildUsageContextBlock();
    const antiPatternBlock = isAutmnSpecial ? '' : buildAntiPatternGuards();

    return `${productSpecificContext}${buildMultiReferencePreamble()}${getCameraSpec(style)}
${briefText}
${heroDynamic}
${studioRule}
${userInstructionBlock}
${productStateGuard}${antiDuplicationBlock}${transparencyGuard}
${buildBrandingInventoryBlock()}${usageContextBlock}${antiPatternBlock}
ABSOLUTE PRODUCT INTEGRITY RULES:
- Output product MUST be pixel-perfect recreation of the input. Same shape, proportions, colors, opacity, material finish.
- EMPTY containers STAY EMPTY. Do NOT add liquid inside transparent containers.
- Do NOT change the product's color under any circumstance.
- Do NOT add condensation, water droplets, frost unless the input photo already shows them.
- Do NOT change the product's proportions.
- PRODUCT IDENTITY IS IMMUTABLE: The product's text, labels, logos, font sizes, positions, stripe widths, color ratios, and overall design layout MUST match the input photo EXACTLY. Do NOT re-interpret, rearrange, or artistically modify ANY element on the product surface.
- If the creative brief mentions any product details, IGNORE THEM — the input photo is the ONLY source of truth for how the product looks.

Real-world product size: ${physicalSizeDescription}. Maintain realistic proportions relative to any scene elements.
A photograph of a product advertisement. Edge-to-edge composition, no borders or frames. Exactly one product instance.${style !== 'style_with_model' ? ' No people, hands, or body parts anywhere.' : ''} The product fills ${fillInstruction ?? (isLifestyle || isOutdoor ? '40-50%' : fillPct + '%')} of the frame.
PRODUCT ORIENTATION: The product MUST show its FRONT FACE — the side with the brand name, logo, and product name. NEVER show the back (ingredient list, nutrition facts, barcode). If the input photo shows the back or side, render the FRONT face of the product instead.
Product: ${productNameWithColor}. ${colorEnforcement} Every logo, text, and brand mark preserved exactly as in the input photo.${!allowCondensation ? ' Product surface is completely dry — no water or condensation.' : ''}${!allowWaterEffects ? '\nNo water, liquid, splashes, droplets, or moisture anywhere in the scene.' : ''}
${warningBlock}
Square format, 1:1 aspect ratio.

The product shows real material properties — surfaces have micro-texture at full resolution. The product looks PHOTOGRAPHED, not rendered.${style === 'style_with_model' ? `

One person naturally interacting with the product. Their face must be visible. The product must be clearly visible and recognizable. The interaction should feel authentic and mid-action. Make this look like a professional advertisement — you decide the best composition for THIS specific product.

CRITICAL SCALE REQUIREMENT: This product is ${physicalSizeDescription}. It MUST be rendered at this EXACT real-world scale relative to the person's hands and body. A person's hand is approximately 18cm long — use this as your reference. If the product is "small" (palm-sized), it should fit comfortably in one hand. NEVER make a small product appear laptop-sized or larger. Scale accuracy is MORE important than dramatic composition.` : ''}`;
  }

  // -------------------------------------------------------------------------
  // Stage 4: Generation loop
  // -------------------------------------------------------------------------

  let adBuffer: Buffer | null = null;
  let lastQA: Awaited<ReturnType<typeof unifiedQualityCheck>> | null = null;
  let bestAdBuffer: Buffer | null = null;
  let bestQaScore = 0;
  let bestQA: Awaited<ReturnType<typeof unifiedQualityCheck>> | null = null;
  let usedFallback = false;
  const retryWarnings: string[] = [];
  const maxAttempts = style === 'style_with_model' ? MAX_GENERATION_ATTEMPTS + 1 : MAX_GENERATION_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isFirstAttempt = attempt === 0;

    console.info(JSON.stringify({
      event: 'v4_generation_attempt',
      attempt: attempt + 1,
      maxAttempts,
      hasWarnings: retryWarnings.length > 0,
    }));

    const prompt = buildGenerationPromptV4(retryWarnings.length > 0 ? retryWarnings : undefined);
    totalAttempts++;

    try {
      if (isFirstAttempt) {
        totalAttempts += (PARALLEL_CANDIDATES - 1);

        const candidates = await Promise.allSettled(
          [0.4, 0.7].map(temp =>
            geminiGenerateImage({
              inputImageBuffer: generationBuffer,
              prompt,
              temperature: temp,
              referenceImageBuffers: effectiveReferences,
            })
          )
        );

        const successfulCandidates = candidates
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof geminiGenerateImage>>> => r.status === 'fulfilled')
          .map(r => r.value);

        if (successfulCandidates.length === 0) {
          console.warn(JSON.stringify({ event: 'v4_all_parallel_failed', attempt: attempt + 1 }));
          continue;
        }

        adBuffer = successfulCandidates.length === 1
          ? successfulCandidates[0]!.imageBuffer
          : await selectBestCandidate(generationBuffer, successfulCandidates.map(c => c.imageBuffer));
      } else {
        // Retry: single generation
        const result = await geminiGenerateImage({
          inputImageBuffer: generationBuffer,
          prompt,
          referenceImageBuffers: effectiveReferences,
        });
        adBuffer = result.imageBuffer;
      }

      // Border detection & auto-crop
      const borderResult = await detectAndCropBorder(adBuffer);
      if (borderResult.cropped) adBuffer = borderResult.buffer;

      const outMeta = await sharpMod(adBuffer).metadata();
      const outW = outMeta.width ?? 0;
      const outH = outMeta.height ?? 0;
      if (outW > 0 && outH > 0 && Math.abs(outW - outH) / Math.max(outW, outH) > 0.05) {
        const minDim = Math.min(outW, outH);
        adBuffer = await sharpMod(adBuffer)
          .extract({ left: Math.round((outW - minDim) / 2), top: Math.round((outH - minDim) / 2), width: minDim, height: minDim })
          .jpeg({ quality: 92 })
          .toBuffer();
      }
    } catch (err) {
      console.warn(JSON.stringify({
        event: 'v4_generation_failed',
        attempt: attempt + 1,
        error: err instanceof Error ? err.message : String(err),
      }));
      continue;
    }

    // ------- Deterministic gates (<100ms) -------
    const deterministicResult = await runDeterministicChecks(processedBuffer, adBuffer);

    console.info(JSON.stringify({
      event: 'v4_deterministic_check',
      pass: deterministicResult.pass,
      failReason: deterministicResult.failReason,
      fillPct: deterministicResult.estimatedFillPct,
    }));

    if (!deterministicResult.pass) {
      const fr = deterministicResult.failReason ?? '';
      if (fr.startsWith('no_scene_change')) {
        retryWarnings.push('Previous attempt was IDENTICAL to the input. Create a COMPLETELY DIFFERENT scene — new background, new surface, new lighting.');
      } else if (fr.startsWith('product_too_small')) {
        retryWarnings.push(`Previous attempt had the product too small (${deterministicResult.estimatedFillPct}% fill). ZOOM IN dramatically. Product must fill the frame at ${fillPct}%.`);
      } else if (fr.startsWith('output_is_blank')) {
        retryWarnings.push('Previous attempt produced a blank/empty image. Generate a detailed, dynamic scene with the product as hero.');
      } else if (fr.startsWith('output_blurry')) {
        retryWarnings.push('Previous attempt was blurry. Generate a SHARP, high-detail image with crisp textures.');
      } else if (fr.startsWith('likely_duplication')) {
        retryWarnings.push('Previous attempt DUPLICATED the product. Generate EXACTLY ONE product instance.');
      }
      adBuffer = null;
      continue;
    }

    if (deterministicResult.warnings.length > 0) {
      retryWarnings.push(...deterministicResult.warnings);
    }

    // ------- Post-process + label (before unified QA so QA sees final output) -------
    adBuffer = await postProcessFinal(adBuffer, style);
    adBuffer = await addAILabel(adBuffer);

    // ------- Unified QA (single Gemini call — replaces focused + combined + branding) -------
    // isPairedProduct is computed once in the outer scope (before the generation loop)
    // Only check instruction compliance if the instruction is relevant to THIS style
    let qaInstructions = filteredInstructions;
    if (qaInstructions) {
      const styleKeywords: Record<string, string[]> = {
        'style_studio': ['studio', 'colored studio', 'color studio', 'backdrop'],
        'style_clean_white': ['white', 'clean', 'minimal'],
        'style_outdoor': ['outdoor', 'outside', 'nature', 'park', 'forest'],
        'style_lifestyle': ['lifestyle', 'kitchen', 'home', 'real life'],
        'style_with_model': ['model', 'person', 'woman', 'man', 'holding'],
        'style_autmn_special': ['special', 'creative', 'bold'],
      };

      const currentStyleKeywords = styleKeywords[style] ?? [];
      const otherStyleKeywords = Object.entries(styleKeywords)
        .filter(([s]) => s !== style)
        .flatMap(([, kws]) => kws);

      // If instruction mentions ANOTHER style specifically, don't check compliance for THIS style
      const mentionsOtherStyle = otherStyleKeywords.some(kw =>
        qaInstructions!.toLowerCase().includes(kw)
      );
      const mentionsThisStyle = currentStyleKeywords.some(kw =>
        qaInstructions!.toLowerCase().includes(kw)
      );

      if (mentionsOtherStyle && !mentionsThisStyle) {
        qaInstructions = undefined; // Not relevant to this style — skip compliance check
      }
    }

    lastQA = await unifiedQualityCheck(processedBuffer, adBuffer, {
      checkFidelity: true,
      voiceInstructions: qaInstructions,  // style-filtered
      brandingInventory: profile.brandingInventory,
      isPairedProduct,
      style,  // for style-aware fidelity threshold
      productPhysicalSize: profile.productPhysicalSize,
    });

    console.info(JSON.stringify({
      event: 'v4_unified_qa',
      pass: lastQA.pass,
      score: lastQA.score,
      brandingAccurate: lastQA.brandingAccurate,
      hasFundamentalError: lastQA.hasFundamentalError,
      productFidelity: lastQA.productFidelity,
      issues: lastQA.issues,
    }));

    // Fundamental error or random text → always retry (don't deliver)
    if (lastQA.hasFundamentalError || lastQA.hasRandomText) {
      if (lastQA.hasFundamentalError && lastQA.fundamentalErrorDescription) {
        retryWarnings.push(`Previous attempt had a critical defect: ${lastQA.fundamentalErrorDescription}. Avoid this.`);
      }
      if (lastQA.hasRandomText) {
        retryWarnings.push('Previous attempt had random text, watermarks, or AI labels in the background. Output must be PURELY photorealistic with ZERO text except on the product itself.');
      }
      adBuffer = null;
      continue;
    }

    // Product count issue — paired/set products (earrings, shoe pairs, jewellery sets) legitimately
    // have 2-3 pieces. Only treat productCount > 1 as duplication for single-item products.
    if (lastQA.productCount > 1 && !isPairedProduct) {
      retryWarnings.push('Previous attempt DUPLICATED the product. Generate EXACTLY ONE instance. Dynamic elements should NOT contain a second product.');
      adBuffer = null;
      continue;
    }
    // Even a set should not have an absurd number of copies (> 5 = real duplication bug)
    if (lastQA.productCount > 5) {
      retryWarnings.push('Previous attempt had too many copies of the product. Show the COMPLETE SET as in the input — not additional copies. Maximum 4-5 pieces total.');
      adBuffer = null;
      continue;
    }

    // Anatomy issue (model style only)
    if (style === 'style_with_model' && (lastQA.humanAnatomy === 'major_issue')) {
      retryWarnings.push(`Previous attempt had a HUMAN ANATOMY ERROR. The person MUST have exactly 2 arms, 2 legs, 2 hands (5 fingers each). If anatomy cannot be perfect, generate the product ALONE.`);
      adBuffer = null;
      continue;
    }

    // Instruction compliance
    if (!lastQA.instructionFollowed && filteredInstructions && attempt < maxAttempts - 1) {
      retryWarnings.push(`Previous attempt IGNORED the user's instruction: "${filteredInstructions.slice(0, 100)}". The next attempt MUST incorporate this visibly.`);
      adBuffer = null;
      continue;
    }

    // DIAGNOSTIC: Log all gate check values to debug why break isn't firing
    console.info(JSON.stringify({
      event: 'v4_qa_gate_check',
      pass: lastQA.pass,
      score: lastQA.score,
      productCount: lastQA.productCount,
      isPairedProduct,
      hasFundamentalError: lastQA.hasFundamentalError,
      hasRandomText: lastQA.hasRandomText,
      humanAnatomy: lastQA.humanAnatomy,
      instructionFollowed: lastQA.instructionFollowed,
      attempt: attempt + 1,
      maxAttempts,
      willBreak: lastQA.pass && lastQA.score >= 60,
    }));

    if (lastQA.pass && lastQA.score >= 60) {
      console.info(JSON.stringify({ event: 'v4_qa_passed', attempt: attempt + 1, score: lastQA.score }));

      // QA passed — deliver the image even if branding has minor issues
      // BiRefNet rescue removed — it caused more problems than it solved
      // (double-layer on transparent products, absurd overlays on with_model)
      if (!lastQA.brandingAccurate && profile?.hasBranding) {
        console.info(JSON.stringify({
          event: 'v4_branding_imperfect_delivering_anyway',
          issues: lastQA.brandingIssues,
          score: lastQA.score,
          reason: 'BiRefNet rescue disabled — delivers AI output as-is'
        }));
      }
      break; // Deliver the image
    }

    // Score low — add to retry warnings and try again
    if (lastQA.issues.length > 0) {
      retryWarnings.push(...lastQA.issues.slice(0, 2));
    }

    // Last attempt — deliver whatever we have, even with branding issues
    // BiRefNet rescue removed — causes worse artifacts than branding blur
    if (attempt === maxAttempts - 1 && !lastQA.brandingAccurate && profile?.hasBranding) {
      console.info(JSON.stringify({
        event: 'v4_last_attempt_branding_imperfect',
        issues: lastQA.brandingIssues,
        reason: 'BiRefNet rescue disabled — delivering best attempt'
      }));
    }

    // Track best result across all attempts — on timeout or exhaustion, deliver the best we saw
    if (adBuffer && lastQA && lastQA.score > bestQaScore && !lastQA.hasFundamentalError && !lastQA.hasRandomText) {
      bestAdBuffer = adBuffer;
      bestQaScore = lastQA.score;
      bestQA = lastQA;
    }

    // If not the last attempt, discard and retry
    if (attempt < maxAttempts - 1) {
      adBuffer = null;
      continue;
    }

    // Last attempt — deliver whatever we have
    break;
  }

  // -------------------------------------------------------------------------
  // All attempts exhausted — use studio fallback
  // -------------------------------------------------------------------------

  // If loop ended without a delivered result, use the best attempt we saw
  if (!adBuffer && bestAdBuffer) {
    adBuffer = bestAdBuffer;
    lastQA = bestQA;
    console.info(JSON.stringify({ event: 'v4_using_best_attempt', score: bestQaScore }));
  }

  if (!adBuffer) {
    console.warn(JSON.stringify({ event: 'v4_all_attempts_exhausted', totalAttempts }));
    usedFallback = true;

    try {
      adBuffer = await createStyledStudioShot(rawBuffer, params.imageUrl, style, profile.productCategory);
    } catch (styledErr) {
      console.warn(JSON.stringify({
        event: 'v4_styled_fallback_failed',
        error: styledErr instanceof Error ? styledErr.message : String(styledErr),
      }));
      try {
        const studio = await createStudioShot(params.imageUrl, profile.productCategory, profile.recommendedCanvasFill);
        adBuffer = await postProcessFinal(studio.studioBuffer, style);
        adBuffer = await addAILabel(adBuffer);
      } catch {
        adBuffer = await addAILabel(processedBuffer);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  const outputUrl = await uploadToStorage(adBuffer, `output_${Date.now()}.jpg`).catch(async (uploadErr) => {
    console.error(JSON.stringify({ event: 'v4_upload_failed_retry', error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr) }));
    await new Promise(r => setTimeout(r, 2000));
    return uploadToStorage(adBuffer!, `output_${Date.now()}.jpg`);
  });

  console.info(JSON.stringify({
    event: 'v4_pipeline_complete',
    totalAttempts,
    durationMs: Date.now() - totalStart,
    qaScore: lastQA?.score ?? (usedFallback ? 45 : 50),
    usedFallback,
    productName,
  }));

  return {
    outputUrl,
    outputBuffer: adBuffer ?? undefined,
    cutoutUrl: undefined,
    qaScore: usedFallback ? 45 : (lastQA?.score ?? 50),
    pipeline: usedFallback ? 'styled-studio-fallback' : 'composite',
    attempts: totalAttempts,
    durationMs: Date.now() - totalStart,
    inputAssessment: { usable: true, productCategory: profile.productCategory },
    adPrompt: profile.creativeBrief,
    usedCreativeDirection: {
      heroMoment: profile.heroMoment ?? '',
      creativeBrief: profile.creativeBrief ?? '',
      scenePrompt: profile.scenePrompt ?? '',
      dynamicElements: profile.dynamicElements ?? [],
      emotionalTrigger: profile.emotionalTrigger ?? '',
      storyScene: profile.storyScene ?? '',
      backgroundOnlyPrompt: profile.backgroundOnlyPrompt ?? '',
    },
  };
}

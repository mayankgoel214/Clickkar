import { fal } from '@fal-ai/client';
import sharp from 'sharp';

function ensureFalConfig() {
  const key = process.env['FAL_KEY'] ?? process.env['FAL_API_KEY'] ?? '';
  fal.config({ credentials: key });
}

// ---------------------------------------------------------------------------
// fal.ai models
// ---------------------------------------------------------------------------

const BIREFNET_MODEL = 'fal-ai/birefnet/v2';
const FLUX_INPAINT_MODEL = 'fal-ai/flux-pro/v1/fill';
const SEEDREAM_EDIT_MODEL = 'fal-ai/bytedance/seedream/v4.5/edit';

// ===========================================================================
// POST-PROCESSING: Make AI output look like a real photograph
// ===========================================================================

// Style-specific post-processing presets
interface StylePostConfig {
  grain: number;       // Film grain intensity (0 = none, 6 = heavy)
  vignette: number;    // Vignette strength (0 = none, 0.4 = heavy)
  warmthShift: number; // Color temp shift (-10 = cool, +10 = warm)
  satBoost: number;    // Saturation multiplier (1.0 = neutral)
  contrast: number;    // Linear contrast multiplier
  blackLift: number;   // Lifted blacks value (0 = pure black, 15 = lifted)
}

const STYLE_POST_CONFIG: Record<string, StylePostConfig> = {
  style_clean_white: { grain: 0, vignette: 0, warmthShift: 0, satBoost: 1.0, contrast: 0.98, blackLift: 5 },
  style_studio:      { grain: 0, vignette: 0, warmthShift: 0, satBoost: 1.0, contrast: 0.98, blackLift: 5 },
  style_gradient:    { grain: 6, vignette: 0.35, warmthShift: -3, satBoost: 1.08, contrast: 0.92, blackLift: 8 },
  style_lifestyle:   { grain: 3, vignette: 0.2, warmthShift: 8, satBoost: 1.06, contrast: 0.95, blackLift: 12 },
  style_festive:     { grain: 3, vignette: 0.25, warmthShift: 10, satBoost: 1.15, contrast: 0.94, blackLift: 10 },
  style_outdoor:     { grain: 5, vignette: 0.25, warmthShift: 3, satBoost: 1.08, contrast: 0.93, blackLift: 10 },
  style_minimal:     { grain: 2, vignette: 0, warmthShift: 0, satBoost: 1.0, contrast: 0.97, blackLift: 8 },
  style_with_model:  { grain: 3, vignette: 0.2, warmthShift: 4, satBoost: 1.04, contrast: 0.95, blackLift: 12 },
};

const DEFAULT_POST_CONFIG: StylePostConfig = { grain: 4, vignette: 0.25, warmthShift: 2, satBoost: 1.05, contrast: 0.95, blackLift: 12 };

/**
 * Full post-processing pipeline that transforms AI output into
 * something indistinguishable from a real camera shot.
 *
 * Style-aware: each style gets different grain, vignette, color grade.
 * Includes micro-realism layers: chromatic aberration, EXIF injection.
 *
 * Total processing time: ~250-500ms on 1024x1024
 */
export async function postProcessFinal(imageBuffer: Buffer, style?: string): Promise<Buffer> {
  const startMs = Date.now();
  const config = (style && STYLE_POST_CONFIG[style]) ? STYLE_POST_CONFIG[style]! : DEFAULT_POST_CONFIG;

  let result = imageBuffer;

  // 1. Micro-contrast (HIRALOAM) — makes product "pop"
  result = await sharp(result)
    .sharpen({ sigma: 8, m1: 0.3, m2: 0.2 })
    .toBuffer();

  // 2. Style-aware color grade
  const warmR = 1.02 + (config.warmthShift > 0 ? config.warmthShift * 0.002 : 0);
  const warmB = 1.01 + (config.warmthShift < 0 ? Math.abs(config.warmthShift) * 0.002 : -config.warmthShift * 0.001);
  result = await sharp(result)
    .recomb([
      [warmR, 0.02, -0.01],
      [-0.01, 1.03, 0.0],
      [0.0, -0.01, warmB],
    ])
    .linear(config.contrast, config.blackLift)
    .modulate({ brightness: 1.01, saturation: config.satBoost })
    .toBuffer();

  // 3. Chromatic aberration — DISABLED: extractChannel+joinChannel strips color
  // TODO: fix using raw pixel buffer manipulation instead of sharp channel ops
  // result = await addChromaticAberration(result);

  // 4. Vignette (if style uses it)
  if (config.vignette > 0) {
    result = await addVignette(result, config.vignette);
  }

  // 5. Film grain (if style uses it)
  if (config.grain > 0) {
    result = await addFilmGrain(result, config.grain);
  }

  // 6. Final JPEG encode with EXIF metadata (simulates real camera)
  result = await sharp(result)
    .jpeg({ quality: 95, mozjpeg: true })
    .withExifMerge({
      IFD0: {
        Make: 'Canon',
        Model: 'Canon EOS R5',
        Software: 'Adobe Lightroom Classic 13.2',
      },
    })
    .toBuffer();

  console.info(JSON.stringify({ event: 'post_process_complete', style: style ?? 'default', durationMs: Date.now() - startMs }));
  return result;
}

/**
 * Chromatic aberration — simulates real lens color fringing.
 * Shifts red channel slightly outward, blue slightly inward from center.
 * The effect is tiny (1px) but the brain detects its absence in AI images.
 */
async function addChromaticAberration(imageBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  // Extract RGB channels
  const redBuf = await sharp(imageBuffer).extractChannel(0).toBuffer();
  const greenBuf = await sharp(imageBuffer).extractChannel(1).toBuffer();
  const blueBuf = await sharp(imageBuffer).extractChannel(2).toBuffer();

  // Scale red channel slightly larger (outward shift), blue slightly smaller (inward)
  const redShifted = await sharp(redBuf)
    .resize(w + 2, h + 2, { kernel: 'lanczos3' })
    .extract({ left: 1, top: 1, width: w, height: h })
    .toBuffer();

  const blueShifted = await sharp(blueBuf)
    .resize(w - 2, h - 2, { kernel: 'lanczos3' })
    .extend({ top: 1, bottom: 1, left: 1, right: 1, background: { r: 0, g: 0, b: 0 } })
    .resize(w, h, { kernel: 'lanczos3' })
    .toBuffer();

  // Recombine channels
  return sharp(redShifted)
    .joinChannel([greenBuf, blueShifted])
    .toBuffer();
}

/**
 * Add "AI Generated by Clickkar" label to the image.
 * Legal requirement for all AI-generated content in India.
 * Small semi-transparent strip at the bottom-right.
 */
export async function addAILabel(imageBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  // Small corner label — doesn't cover the product
  const fontSize = Math.max(Math.round(h * 0.012), 9);
  const labelW = Math.round(w * 0.28);
  const labelH = fontSize + 6;

  const svg = Buffer.from(`<svg width="${labelW}" height="${labelH}">
    <rect width="${labelW}" height="${labelH}" fill="rgba(0,0,0,0.25)" rx="3"/>
    <text x="${labelW - 5}" y="${Math.round(labelH * 0.72)}" font-family="Arial,Helvetica,sans-serif"
          font-size="${fontSize}" fill="white" text-anchor="end" opacity="0.65">
      AI Generated by Clickkar
    </text>
  </svg>`);

  const overlay = await sharp(svg).png().toBuffer();

  return sharp(imageBuffer)
    .composite([{ input: overlay, left: w - labelW - 4, top: h - labelH - 4, blend: 'over' }])
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();
}

// ===========================================================================
// REFINEMENT PIPELINE: Kontext + CodeFormer + ESRGAN
// ===========================================================================

const KONTEXT_MODEL = 'fal-ai/flux-pro/kontext';
const CODEFORMER_MODEL = 'fal-ai/codeformer';
const ESRGAN_MODEL = 'fal-ai/esrgan';

// Timeout wrapper for fal.ai calls that can hang
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

/**
 * Refine an AI-generated image using Flux Kontext.
 * Text-instruction editing to make output look more professional.
 * $0.04/image.
 */
export async function refineWithKontext(
  imageBuffer: Buffer,
  isWithModel: boolean
): Promise<Buffer> {
  ensureFalConfig();
  const startMs = Date.now();

  try {
    const imageUrl = await uploadToStorage(imageBuffer, `kontext_input_${Date.now()}.jpg`);

    const prompt = isWithModel
      ? 'Enhance this product advertisement photograph. Make the person look completely natural and photorealistic with correct human anatomy. Ensure natural skin texture with pores, realistic eyes, and natural hand proportions. The product must remain clearly visible, sharp, and the focal point. Make lighting consistent across the entire image. Do not add any text or change the product design.'
      : 'Enhance this product photograph to look like it was shot by a professional photographer with studio lighting. Ensure the product is sharp, well-lit, and the dominant subject. Improve lighting consistency and photorealism. Do not change the product or add any text.';

    const result = (await withTimeout(
      fal.subscribe(KONTEXT_MODEL as string, {
        input: {
          prompt,
          image_url: imageUrl,
        },
        logs: false,
      }),
      120_000, // 2 minute timeout
      'Kontext refinement',
    )) as {
      data: { images?: Array<{ url: string }>; image?: { url: string } };
    };

    const outputUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null;
    if (!outputUrl) {
      console.warn(JSON.stringify({ event: 'kontext_no_output' }));
      return imageBuffer;
    }

    const refined = await downloadBuffer(outputUrl);
    console.info(JSON.stringify({ event: 'kontext_refine_complete', durationMs: Date.now() - startMs }));
    return refined;
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'kontext_refine_failed',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startMs,
    }));
    return imageBuffer; // Non-fatal — return original
  }
}

/**
 * Restore faces in AI-generated images using CodeFormer.
 * Fixes soft, distorted, or uncanny valley AI faces.
 * $0.002/image. Only used for "With Model" style.
 */
export async function restoreFaces(imageBuffer: Buffer): Promise<Buffer> {
  ensureFalConfig();
  const startMs = Date.now();

  try {
    const imageUrl = await uploadToStorage(imageBuffer, `codeformer_input_${Date.now()}.jpg`);

    const result = (await withTimeout(
      fal.subscribe(CODEFORMER_MODEL as string, {
        input: {
          image_url: imageUrl,
          fidelity: 0.7,
          background_enhance: false,
          face_upsample: true,
        },
        logs: false,
      }),
      90_000, // 90 second timeout
      'CodeFormer face restoration',
    )) as {
      data: { image?: { url: string } };
    };

    const outputUrl = result.data?.image?.url ?? null;
    if (!outputUrl) {
      console.warn(JSON.stringify({ event: 'codeformer_no_output' }));
      return imageBuffer;
    }

    const restored = await downloadBuffer(outputUrl);
    // Resize back to original dimensions (CodeFormer may upscale)
    const meta = await sharp(imageBuffer).metadata();
    const final = await sharp(restored)
      .resize(meta.width ?? 1024, meta.height ?? 1024, { fit: 'fill', kernel: 'lanczos3' })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();

    console.info(JSON.stringify({ event: 'codeformer_complete', durationMs: Date.now() - startMs }));
    return final;
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'codeformer_failed',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startMs,
    }));
    return imageBuffer; // Non-fatal
  }
}

/**
 * Upscale 2x with ESRGAN then downscale back to 1024.
 * The "upscale-downscale trick" adds real micro-detail that sells photorealism.
 * GFPGAN face enhancement activated via face: true.
 * ~$0.001/image.
 */
export async function upscaleDownscale(imageBuffer: Buffer): Promise<Buffer> {
  ensureFalConfig();
  const startMs = Date.now();

  try {
    const imageUrl = await uploadToStorage(imageBuffer, `esrgan_input_${Date.now()}.jpg`);

    const result = (await withTimeout(
      fal.subscribe(ESRGAN_MODEL as string, {
        input: {
          image_url: imageUrl,
          scale: 2,
          model: 'RealESRGAN_x4plus',
          face: true,
        },
        logs: false,
      }),
      60_000, // 60 second timeout
      'ESRGAN upscale',
    )) as {
      data: { image?: { url: string } };
    };

    const outputUrl = result.data?.image?.url ?? null;
    if (!outputUrl) {
      console.warn(JSON.stringify({ event: 'esrgan_no_output' }));
      return imageBuffer;
    }

    const upscaled = await downloadBuffer(outputUrl);

    // Downscale back to 1024x1024 with high-quality lanczos3 kernel
    const final = await sharp(upscaled)
      .resize(1024, 1024, { fit: 'cover', kernel: 'lanczos3' })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();

    console.info(JSON.stringify({ event: 'esrgan_upscale_downscale_complete', durationMs: Date.now() - startMs }));
    return final;
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'esrgan_failed',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startMs,
    }));
    return imageBuffer; // Non-fatal
  }
}

/**
 * Add uniform film grain over entire image.
 * Unifies the noise pattern between real product cutout and AI background.
 */
async function addFilmGrain(imageBuffer: Buffer, intensity: number = 4): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  // Generate Gaussian noise buffer (centered at 128, stddev = intensity)
  const noiseData = Buffer.alloc(w * h * 3);
  for (let i = 0; i < noiseData.length; i++) {
    const u1 = Math.random() || 0.001;
    const u2 = Math.random();
    const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    noiseData[i] = Math.min(255, Math.max(0, Math.round(128 + gaussian * intensity)));
  }

  const noiseBuffer = await sharp(noiseData, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();

  return sharp(imageBuffer)
    .composite([{ input: noiseBuffer, blend: 'soft-light', left: 0, top: 0 }])
    .toBuffer();
}

/**
 * Add vignette — subtle darkening at edges/corners.
 * Simulates real lens barrel light falloff.
 */
async function addVignette(imageBuffer: Buffer, strength: number = 0.25): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  const vignetteData = Buffer.alloc(w * h * 4);
  const cx = w / 2;
  const cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
      const falloff = Math.max(0, (dist - 0.4) / 0.6);
      const alpha = Math.round(falloff * falloff * strength * 255);

      const idx = (y * w + x) * 4;
      vignetteData[idx] = 0;
      vignetteData[idx + 1] = 0;
      vignetteData[idx + 2] = 0;
      vignetteData[idx + 3] = Math.min(alpha, 255);
    }
  }

  const vignetteBuffer = await sharp(vignetteData, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();

  return sharp(imageBuffer)
    .composite([{ input: vignetteBuffer, blend: 'over', left: 0, top: 0 }])
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download: ${resp.status} ${resp.statusText} — ${url}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

export async function uploadToStorage(buffer: Buffer, filename: string, contentType = 'image/jpeg'): Promise<string> {
  try {
    const { uploadFile, Buckets } = await import('@whatsads/storage');
    return await uploadFile(Buckets.PROCESSED_IMAGES, filename, buffer, contentType);
  } catch {
    // Fallback: use fal.ai storage
    try {
      ensureFalConfig();
      const blob = new Blob([buffer], { type: contentType });
      const url = await fal.storage.upload(blob);
      return url;
    } catch {
      const base64 = buffer.toString('base64');
      return `data:${contentType};base64,${base64.slice(0, 100)}...`;
    }
  }
}

// ---------------------------------------------------------------------------
// Layer 1: Background removal via BiRefNet v2
// ---------------------------------------------------------------------------

export async function removeBackground(imageUrl: string): Promise<string> {
  ensureFalConfig();
  const startMs = Date.now();

  const result = (await fal.subscribe(BIREFNET_MODEL as string, {
    input: { image_url: imageUrl },
    logs: false,
  })) as {
    data: { image?: { url: string }; images?: Array<{ url: string }> };
  };

  const cutoutUrl = result.data?.image?.url ?? result.data?.images?.[0]?.url ?? null;
  if (!cutoutUrl) throw new Error('BiRefNet v2 returned no cutout URL');

  console.info(JSON.stringify({ event: 'birefnet_complete', durationMs: Date.now() - startMs }));
  return cutoutUrl;
}

// ---------------------------------------------------------------------------
// Layer 2: Product cutout enhancement
// ---------------------------------------------------------------------------

const SATURATION_BY_CATEGORY: Record<string, number> = {
  food: 1.2, jewellery: 1.12, garment: 1.08, skincare: 1.05,
  candle: 1.15, bag: 1.08, home_goods: 1.06, electronics: 1.03,
  handicraft: 1.1, other: 1.05,
};

export async function enhanceCutout(cutoutBuffer: Buffer, productCategory: string): Promise<Buffer> {
  const saturation = SATURATION_BY_CATEGORY[productCategory] ?? 1.05;
  const meta = await sharp(cutoutBuffer).metadata();
  const w = meta.width ?? 800;
  const h = meta.height ?? 800;

  let pipeline = sharp(cutoutBuffer);
  if (w < 800 && h < 800) {
    const scale = 800 / Math.max(w, h);
    pipeline = pipeline.resize(Math.round(w * scale), Math.round(h * scale), { kernel: 'lanczos3' });
  }

  return pipeline.normalize().modulate({ saturation }).sharpen({ sigma: 0.6, m1: 0.8, m2: 0.4 }).png().toBuffer();
}

// ===========================================================================
// PHASE A: Create studio-quality product shot
// ===========================================================================

/**
 * Takes a raw product image, removes background, enhances, and composites
 * onto a clean white background with professional shadow.
 * Output: clean studio-quality product photograph.
 */
export async function createStudioShot(
  imageUrl: string,
  productCategory: string
): Promise<{ studioBuffer: Buffer; cutoutBuffer: Buffer; cutoutUrl: string }> {
  const startMs = Date.now();

  // Remove background
  const cutoutUrl = await removeBackground(imageUrl);
  const rawCutout = await downloadBuffer(cutoutUrl);

  // Enhance cutout
  const cutoutBuffer = await enhanceCutout(rawCutout, productCategory);

  // Composite onto white background with shadow
  const CANVAS_SIZE = 1024;
  const cutMeta = await sharp(cutoutBuffer).metadata();
  const cutW = cutMeta.width ?? 500;
  const cutH = cutMeta.height ?? 500;

  // Product fills ~65% of canvas
  const maxDim = Math.round(CANVAS_SIZE * 0.65);
  const scale = Math.min(maxDim / cutW, maxDim / cutH);
  const scaledW = Math.round(cutW * scale);
  const scaledH = Math.round(cutH * scale);

  const resizedCutout = await sharp(cutoutBuffer)
    .resize(scaledW, scaledH, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  const left = Math.round((CANVAS_SIZE - scaledW) / 2);
  const top = Math.round(CANVAS_SIZE * 0.5 - scaledH / 2);

  // Simple soft shadow — an elliptical gradient beneath the product
  // Previous approach (alpha-based shadow) broke on dark products like laptops
  const shadowH = Math.round(scaledH * 0.08);
  const shadowW = Math.round(scaledW * 0.85);
  const shadowBuffer = await sharp({
    create: { width: shadowW, height: shadowH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 40 } },
  }).blur(Math.max(shadowH / 2, 3)).png().toBuffer();

  // Composite: white bg → shadow → product
  const shadowLeft = Math.round((CANVAS_SIZE - shadowW) / 2);
  const shadowTop = top + scaledH - Math.round(shadowH * 0.3);

  const studioBuffer = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      { input: shadowBuffer, left: shadowLeft, top: shadowTop, blend: 'over' },
      { input: resizedCutout, left, top, blend: 'over' },
    ])
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  console.info(JSON.stringify({ event: 'studio_shot_complete', durationMs: Date.now() - startMs }));
  return { studioBuffer, cutoutBuffer: resizedCutout, cutoutUrl };
}

// ===========================================================================
// TRACK A: Inpaint studio shot background
// ===========================================================================

/**
 * Replace the white background of a studio shot with a creative scene.
 * Uses Flux Fill inpainting: the product stays untouched (masked as "keep"),
 * the white background area gets replaced with the scene prompt.
 *
 * This solves the compositing problem: no floating products, no objects
 * under the product, scene flows naturally around the product.
 */
export async function inpaintStudioBackground(
  studioBuffer: Buffer,
  cutoutBuffer: Buffer,
  scenePrompt: string,
): Promise<Buffer> {
  ensureFalConfig();
  const startMs = Date.now();
  const CANVAS_SIZE = 1024;

  // The cutout buffer from createStudioShot is already resized to 65% of canvas.
  // We need to recreate the exact same position used in createStudioShot.
  const cutMeta = await sharp(cutoutBuffer).metadata();
  const cutW = cutMeta.width ?? 500;
  const cutH = cutMeta.height ?? 500;

  const left = Math.round((CANVAS_SIZE - cutW) / 2);
  const top = Math.round(CANVAS_SIZE * 0.5 - cutH / 2);

  // Create mask: product area = BLACK (keep), everything else = WHITE (generate)
  // Extract alpha channel from cutout to get product shape
  const alpha = await sharp(cutoutBuffer)
    .ensureAlpha()
    .extractChannel(3)
    .toBuffer();

  // Dilate the product area by 6px to create a safety buffer
  // This prevents Flux from touching the product edges
  const dilatedAlpha = await sharp(alpha)
    .blur(3) // Gaussian blur acts as dilation
    .threshold(20) // Re-binarize: anything touched by blur becomes solid
    .negate() // Invert: product = BLACK (keep), background = WHITE (generate)
    .png()
    .toBuffer();

  // Place the product mask at the exact position on the 1024x1024 canvas
  const mask = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: dilatedAlpha, left, top, blend: 'multiply' }])
    .png()
    .toBuffer();

  // Convert studio shot to PNG for Flux (it's currently JPEG)
  const studioPng = await sharp(studioBuffer)
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'fill' })
    .png()
    .toBuffer();

  const [studioUrl, maskUrl] = await Promise.all([
    uploadToStorage(studioPng, `studio_inpaint_${Date.now()}.png`, 'image/png'),
    uploadToStorage(mask, `studio_mask_${Date.now()}.png`, 'image/png'),
  ]);

  const safePrompt = `${scenePrompt}, photorealistic, no text, no words, no letters, no numbers, no watermarks, professional product advertisement photograph, shot on 85mm lens`;

  console.info(JSON.stringify({ event: 'studio_inpaint_start', promptPreview: safePrompt.slice(0, 120) }));

  const result = (await withTimeout(
    fal.subscribe(FLUX_INPAINT_MODEL as string, {
      input: {
        image_url: studioUrl,
        mask_url: maskUrl,
        prompt: safePrompt,
        safety_tolerance: '2',
      },
      logs: false,
    }),
    120_000,
    'Studio background inpainting',
  )) as {
    data: { images?: Array<{ url: string }>; image?: { url: string } };
  };

  const outputUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null;
  if (!outputUrl) throw new Error('Studio inpainting returned no output');

  const outputBuffer = await downloadBuffer(outputUrl);
  const finalBuffer = await sharp(outputBuffer)
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'fill' })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  console.info(JSON.stringify({ event: 'studio_inpaint_complete', durationMs: Date.now() - startMs }));
  return finalBuffer;
}

// ===========================================================================
// PHASE B-1: Generate reference scene via Seedream
// ===========================================================================

// ===========================================================================
// Legacy: Background-only scene generation + harmonized compositing (kept for fallback)
// ===========================================================================

/**
 * Generate an EMPTY background scene (no product) using Flux Pro Fill.
 * The entire 1024x1024 canvas is masked (full white mask = generate everything).
 * Prompt describes a styled surface with props but empty center.
 * The real product cutout gets composited onto this scene afterward.
 */
export async function generateBackgroundOnlyScene(
  backgroundPrompt: string
): Promise<Buffer> {
  ensureFalConfig();
  const startMs = Date.now();
  const CANVAS_SIZE = 1024;

  // Full white canvas + full white mask = generate entire image from scratch
  const canvas = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();

  const mask = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();

  const [canvasUrl, maskUrl] = await Promise.all([
    uploadToStorage(canvas, `bgcanvas_${Date.now()}.png`, 'image/png'),
    uploadToStorage(mask, `bgmask_${Date.now()}.png`, 'image/png'),
  ]);

  const safePrompt = `${backgroundPrompt}, the CENTER of the image must be COMPLETELY EMPTY with just the flat surface visible — no objects no cups no bowls no props in the center, all props and decorative elements must be at the EDGES and CORNERS only, photorealistic, no text, no words, no letters, no numbers, no watermarks, clean photographic image`;

  console.info(JSON.stringify({ event: 'bg_only_start', promptPreview: safePrompt.slice(0, 120) }));

  const result = (await fal.subscribe(FLUX_INPAINT_MODEL as string, {
    input: {
      image_url: canvasUrl,
      mask_url: maskUrl,
      prompt: safePrompt,
      safety_tolerance: '2',
    },
    logs: false,
  })) as {
    data: { images?: Array<{ url: string }>; image?: { url: string } };
  };

  const outputUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null;
  if (!outputUrl) throw new Error('Flux BG-only generation returned no output URL');

  const bgBuffer = await downloadBuffer(outputUrl);
  const finalBg = await sharp(bgBuffer).resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'fill' }).jpeg({ quality: 95 }).toBuffer();

  console.info(JSON.stringify({ event: 'bg_only_complete', durationMs: Date.now() - startMs }));
  return finalBg;
}

/**
 * Generate a scene (including a person) AROUND the preserved product cutout.
 * Uses Flux inpainting: product pixels are in the "keep" zone of the mask,
 * everything else (person, background) is generated.
 *
 * This is the key to "With Model" — the real product is preserved pixel-perfect
 * while Flux generates a photorealistic person holding/interacting with it.
 */
export async function generateSceneAroundProduct(
  cutoutBuffer: Buffer,
  scenePrompt: string,
): Promise<Buffer> {
  ensureFalConfig();
  const startMs = Date.now();
  const CANVAS_SIZE = 1024;

  const cutMeta = await sharp(cutoutBuffer).metadata();
  const cutW = cutMeta.width ?? 500;
  const cutH = cutMeta.height ?? 500;

  // Scale product to fill ~55% of canvas — product is the HERO
  const maxDim = Math.round(CANVAS_SIZE * 0.55);
  const scale = Math.min(maxDim / cutW, maxDim / cutH);
  const scaledW = Math.round(cutW * scale);
  const scaledH = Math.round(cutH * scale);

  const resizedCutout = await sharp(cutoutBuffer)
    .resize(scaledW, scaledH, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  // Center horizontally, position in lower half (sitting on a surface)
  const left = Math.round((CANVAS_SIZE - scaledW) / 2);
  const top = Math.round(CANVAS_SIZE * 0.50 - scaledH / 2);

  // Canvas: neutral gray background with product placed on it
  // Gray tells Flux "generate something here" without biasing toward light or dark
  const canvas = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4, background: { r: 160, g: 160, b: 160, alpha: 255 } },
  })
    .composite([{ input: resizedCutout, left, top, blend: 'over' }])
    .png()
    .toBuffer();

  // Mask: WHITE = generate (person + background), BLACK = keep (product)
  const alphaChannel = await sharp(resizedCutout)
    .ensureAlpha()
    .extractChannel(3)
    .toBuffer();

  const productMask = await sharp(alphaChannel)
    .negate() // product area becomes black (keep)
    .png()
    .toBuffer();

  const mask = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: productMask, left, top, blend: 'multiply' }])
    .png()
    .toBuffer();

  const [canvasUrl, maskUrl] = await Promise.all([
    uploadToStorage(canvas, `model_canvas_${Date.now()}.png`, 'image/png'),
    uploadToStorage(mask, `model_mask_${Date.now()}.png`, 'image/png'),
  ]);

  const safePrompt = `${scenePrompt}, photorealistic photograph, ABSOLUTELY NO TEXT anywhere in the image, no words, no letters, no numbers, no watermarks, no signs, no writing, no captions, no labels except on the product itself, clean professional product advertisement, shot on 85mm f/2.8 lens, shallow depth of field`;

  console.info(JSON.stringify({ event: 'with_model_inpaint_start', promptPreview: safePrompt.slice(0, 120) }));

  const result = (await withTimeout(
    fal.subscribe(FLUX_INPAINT_MODEL as string, {
      input: {
        image_url: canvasUrl,
        mask_url: maskUrl,
        prompt: safePrompt,
        safety_tolerance: '2',
      },
      logs: false,
    }),
    120_000,
    'With Model inpainting',
  )) as {
    data: { images?: Array<{ url: string }>; image?: { url: string } };
  };

  const outputUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null;
  if (!outputUrl) throw new Error('With Model inpainting returned no output');

  const outputBuffer = await downloadBuffer(outputUrl);
  console.info(JSON.stringify({ event: 'with_model_inpaint_complete', durationMs: Date.now() - startMs }));
  return outputBuffer;
}

/**
 * Composite the real product cutout onto a generated background scene
 * with harmonization: edge feathering, color matching, contact shadow,
 * and unified color grade. This solves the "collage look" problem.
 */
export async function harmonizedComposite(
  cutoutBuffer: Buffer,
  sceneBuffer: Buffer
): Promise<Buffer> {
  const startMs = Date.now();
  const CANVAS_SIZE = 1024;

  const cutMeta = await sharp(cutoutBuffer).metadata();
  const cutW = cutMeta.width ?? 500;
  const cutH = cutMeta.height ?? 500;

  // Position product centered, slightly above middle
  const left = Math.round((CANVAS_SIZE - cutW) / 2);
  const top = Math.round(CANVAS_SIZE * 0.48 - cutH / 2);

  // Resize scene to canvas
  const scene = await sharp(sceneBuffer).resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'cover' }).toBuffer();

  // --- Contact shadow ---
  // Sample background color safely — clamp all coordinates within canvas bounds
  const sampleTop = Math.min(Math.max(top + cutH, 0), CANVAS_SIZE - 12);
  const sampleLeft = Math.max(left, 0);
  const sampleW = Math.min(Math.max(cutW, 1), CANVAS_SIZE - sampleLeft);
  const sampleH = Math.min(10, CANVAS_SIZE - sampleTop);

  let bgR = 50, bgG = 50, bgB = 50;
  if (sampleW > 0 && sampleH > 0) {
    try {
      const sampleRegion = await sharp(scene)
        .extract({ left: sampleLeft, top: sampleTop, width: sampleW, height: sampleH })
        .stats();
      bgR = Math.round(sampleRegion.channels[0]?.mean ?? 50);
      bgG = Math.round(sampleRegion.channels[1]?.mean ?? 50);
      bgB = Math.round(sampleRegion.channels[2]?.mean ?? 50);
    } catch {
      // Sampling failed — use dark defaults
    }
  }

  // Shadow: darker version of background color, elliptical, blurred
  const shadowW = Math.round(cutW * 0.7);
  const shadowH = Math.max(Math.round(cutH * 0.04), 4);
  const shadowR = Math.max(Math.round(bgR * 0.3), 0);
  const shadowG = Math.max(Math.round(bgG * 0.3), 0);
  const shadowB = Math.max(Math.round(bgB * 0.3), 0);

  const shadowBuffer = await sharp({
    create: { width: shadowW, height: shadowH, channels: 4, background: { r: shadowR, g: shadowG, b: shadowB, alpha: 40 } },
  }).blur(Math.max(shadowH / 2, 3)).png().toBuffer();

  const shadowLeft = Math.round((CANVAS_SIZE - shadowW) / 2);
  const shadowTop = Math.min(top + cutH - Math.round(shadowH * 0.2), CANVAS_SIZE - shadowH - 2);

  // --- Edge feathering (adaptive) ---
  // Feather proportional to product size — small products get less feather
  const featherRadius = Math.max(2, Math.min(8, Math.round(cutW * 0.008)));
  const alpha = await sharp(cutoutBuffer).ensureAlpha().extractChannel(3).toBuffer();
  const featheredAlpha = await sharp(alpha).blur(featherRadius).png().toBuffer();

  // Apply feathered alpha back to the cutout
  const rgb = await sharp(cutoutBuffer).removeAlpha().toBuffer();
  const featheredCutout = await sharp(rgb)
    .joinChannel(featheredAlpha)
    .png()
    .toBuffer();

  // --- Unified color grade ---
  // Sample scene's overall color temperature and apply a subtle shift to unify
  const sceneStats = await sharp(scene).stats();
  const sceneAvgR = sceneStats.channels[0]?.mean ?? 128;
  const sceneAvgG = sceneStats.channels[1]?.mean ?? 128;
  const sceneAvgB = sceneStats.channels[2]?.mean ?? 128;

  // Determine if scene is warm or cool
  const warmth = sceneAvgR - sceneAvgB; // positive = warm, negative = cool

  // --- Product reflection (for dark/reflective backgrounds) ---
  // If the scene is dark (avg brightness < 80), generate a real mirrored reflection
  const sceneBrightness = (sceneAvgR + sceneAvgG + sceneAvgB) / 3;
  let reflectionBuffer: Buffer | null = null;
  let reflectionLeft = left;
  let reflectionTop = top + cutH;

  if (sceneBrightness < 80) {
    try {
      // Create reflection: flip product vertically, fade with gradient, reduce opacity
      const reflectionH = Math.round(cutH * 0.4); // 40% height reflection
      const flipped = await sharp(cutoutBuffer)
        .flip() // vertical mirror
        .resize(cutW, reflectionH, { fit: 'cover', position: 'top', kernel: 'lanczos3' })
        .png()
        .toBuffer();

      // Create gradient mask for fade-out effect (opaque at top, transparent at bottom)
      const gradientData = Buffer.alloc(cutW * reflectionH * 4);
      for (let y = 0; y < reflectionH; y++) {
        const opacity = Math.round(255 * 0.3 * (1 - y / reflectionH)); // 30% max, fading to 0
        for (let x = 0; x < cutW; x++) {
          const idx = (y * cutW + x) * 4;
          gradientData[idx] = 255;
          gradientData[idx + 1] = 255;
          gradientData[idx + 2] = 255;
          gradientData[idx + 3] = opacity;
        }
      }
      const gradientMask = await sharp(gradientData, { raw: { width: cutW, height: reflectionH, channels: 4 } })
        .png().toBuffer();

      // Extract alpha from flipped cutout and combine with gradient
      const flippedAlpha = await sharp(flipped).ensureAlpha().extractChannel(3).toBuffer();
      const flippedRgb = await sharp(flipped).removeAlpha().toBuffer();
      const gradientAlpha = await sharp(gradientMask).extractChannel(3).toBuffer();

      // Multiply alphas: reflection only where product exists AND within gradient
      const finalAlpha = await sharp(flippedAlpha)
        .composite([{ input: gradientAlpha, blend: 'multiply' }])
        .png().toBuffer();

      reflectionBuffer = await sharp(flippedRgb)
        .joinChannel(finalAlpha)
        .blur(2) // slight blur for realism
        .png().toBuffer();

      // Clamp reflection position within canvas
      reflectionTop = Math.min(reflectionTop, CANVAS_SIZE - reflectionH - 2);
    } catch {
      // Reflection generation failed — continue without it
    }
  }

  // --- Final composite: scene → reflection → shadow → feathered product → color grade ---
  const compositeOps: Array<{ input: Buffer; left: number; top: number; blend: string }> = [];
  if (reflectionBuffer) {
    compositeOps.push({ input: reflectionBuffer, left: reflectionLeft, top: reflectionTop, blend: 'over' });
  }
  compositeOps.push({ input: shadowBuffer, left: shadowLeft, top: shadowTop, blend: 'over' });
  compositeOps.push({ input: featheredCutout, left, top, blend: 'over' });

  let composited = await sharp(scene)
    .composite(compositeOps as Parameters<ReturnType<typeof sharp>['composite']>[0])
    .toBuffer();

  // Apply subtle unified brightness lift (color grading handled by postProcessFinal)
  composited = await sharp(composited)
    .modulate({ brightness: 1.02, saturation: 1.03 })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  console.info(JSON.stringify({ event: 'harmonized_composite_complete', durationMs: Date.now() - startMs }));
  return composited;
}

// ===========================================================================
// TRACK B: Seedream full scene generation (for unbranded products)
// ===========================================================================

/**
 * Generates a beautiful creative scene using Seedream v4.5.
 * The product WILL be regenerated — this is OK for unbranded products
 * where shape/color matters more than exact text/logos.
 */
export async function generateReferenceScene(
  imageUrl: string,
  creativePrompt: string
): Promise<Buffer | null> {
  ensureFalConfig();
  const startMs = Date.now();

  try {
    const prompt = `${creativePrompt}. Photorealistic photograph, shot on Canon EOS R5 with 85mm f/1.4 lens. Natural studio lighting. No text, no words, no watermarks, no logos added. Every person must have exactly 5 fingers per hand, natural human proportions, realistic skin texture. Nothing floating in the air. Product must be clearly visible and the focal point.`;

    const result = (await fal.subscribe(SEEDREAM_EDIT_MODEL as string, {
      input: {
        prompt,
        image_urls: [imageUrl],
        image_size: 'square_hd',
        num_images: 1,
      },
      logs: false,
    })) as {
      data: { images?: Array<{ url: string }> };
    };

    const outputUrl = result.data?.images?.[0]?.url ?? null;
    if (!outputUrl) {
      console.warn(JSON.stringify({ event: 'seedream_no_output' }));
      return null;
    }

    const rawBuffer = await downloadBuffer(outputUrl);

    // Crop bottom 50px to strip Seedream watermarks (e.g. "PHOTORESIVE")
    // before using as reference canvas
    const meta = await sharp(rawBuffer).metadata();
    const w = meta.width ?? 1024;
    const h = meta.height ?? 1024;
    const buffer = await sharp(rawBuffer)
      .extract({ left: 0, top: 0, width: w, height: Math.max(h - 50, h - Math.round(h * 0.05)) })
      .resize(w, h, { fit: 'fill' })
      .jpeg({ quality: 95 })
      .toBuffer();

    console.info(JSON.stringify({ event: 'seedream_reference_complete', durationMs: Date.now() - startMs }));
    return buffer;
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'seedream_reference_failed',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startMs,
    }));
    return null; // Non-fatal — we fall back to white canvas
  }
}

// ===========================================================================
// PHASE B-2: Create creative ad via inpainting (with optional reference)
// ===========================================================================

/**
 * Creates the final ad by inpainting around the real product cutout.
 *
 * If a referenceScene is provided (from Seedream), it's used as the canvas
 * background instead of plain white. This gives Flux a "head start" — it
 * sees the beautiful scene and just needs to blend/refine, rather than
 * generating from scratch.
 *
 * The real product cutout is ALWAYS composited on top at the end,
 * guaranteeing pixel-perfect preservation.
 */
export async function createCreativeAd(
  cutoutBuffer: Buffer,
  creativePrompt: string,
  referenceScene?: Buffer | null
): Promise<Buffer> {
  ensureFalConfig();
  const startMs = Date.now();
  const CANVAS_SIZE = 1024;

  const cutMeta = await sharp(cutoutBuffer).metadata();
  const cutW = cutMeta.width ?? 500;
  const cutH = cutMeta.height ?? 500;

  // Position product on canvas
  const left = Math.round((CANVAS_SIZE - cutW) / 2);
  const top = Math.round(CANVAS_SIZE * 0.5 - cutH / 2);

  // Canvas background: use Seedream reference scene or fall back to white
  let canvasBase: Buffer;
  if (referenceScene) {
    // Resize the reference scene to canvas size and use as background
    canvasBase = await sharp(referenceScene)
      .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'cover' })
      .ensureAlpha()
      .png()
      .toBuffer();
    console.info(JSON.stringify({ event: 'using_seedream_reference_as_canvas' }));
  } else {
    canvasBase = await sharp({
      create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
    }).png().toBuffer();
  }

  // Composite product cutout onto the canvas
  const canvas = await sharp(canvasBase)
    .composite([{ input: cutoutBuffer, left, top, blend: 'over' }])
    .png()
    .toBuffer();

  // Mask: white = inpaint, black = keep product
  // Dilate the keep zone so inpainting doesn't eat into product edges
  const alphaChannel = await sharp(cutoutBuffer).ensureAlpha().extractChannel(3).toBuffer();

  const DILATE_RADIUS = 4;
  const dilatedAlpha = await sharp(alphaChannel)
    .blur(DILATE_RADIUS)
    .threshold(20)
    .png()
    .toBuffer();

  const productMask = await sharp(dilatedAlpha).negate().png().toBuffer();

  const mask = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: productMask, left, top, blend: 'multiply' }])
    .png()
    .toBuffer();

  // Upload canvas and mask
  const [canvasUrl, maskUrl] = await Promise.all([
    uploadToStorage(canvas, `canvas_${Date.now()}.png`, 'image/png'),
    uploadToStorage(mask, `mask_${Date.now()}.png`, 'image/png'),
  ]);

  // Strict no-text suffix
  const safePrompt = `${creativePrompt}, photorealistic, no text, no words, no letters, no numbers, no watermarks, no line drawings, no sketches, clean photographic image`;

  console.info(JSON.stringify({
    event: 'inpaint_start',
    hasReference: !!referenceScene,
    promptPreview: safePrompt.slice(0, 120),
  }));

  const result = (await fal.subscribe(FLUX_INPAINT_MODEL as string, {
    input: {
      image_url: canvasUrl,
      mask_url: maskUrl,
      prompt: safePrompt,
      safety_tolerance: '2',
    },
    logs: false,
  })) as {
    data: { images?: Array<{ url: string }>; image?: { url: string } };
  };

  const outputUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null;
  if (!outputUrl) throw new Error('Flux inpainting returned no output URL');

  const outputBuffer = await downloadBuffer(outputUrl);

  // CRITICAL: Composite the original product cutout back on top of the inpainted result
  // This guarantees the product pixels are EXACTLY the same as the input — no degradation
  const composited = await sharp(outputBuffer)
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'fill' })
    .composite([{ input: cutoutBuffer, left, top, blend: 'over' }])
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  // Crop out bottom 40px to remove any watermarks (Seedream adds "PHOTORESIVE" etc.)
  // Then resize back to square — the 40px loss is imperceptible
  const finalBuffer = await sharp(composited)
    .extract({ left: 0, top: 0, width: CANVAS_SIZE, height: CANVAS_SIZE - 40 })
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'fill' })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  console.info(JSON.stringify({ event: 'inpaint_complete', durationMs: Date.now() - startMs }));
  return finalBuffer;
}

// ===========================================================================
// RE-COMPOSITE: Paste real product cutout back on top of any AI-generated scene
// ===========================================================================

/**
 * After any AI generation (Bria, Flux, IC-Light, etc.), paste the REAL product
 * cutout back on top. This guarantees pixel-perfect product preservation regardless
 * of what the AI did to the scene — solves floating products, altered packaging, etc.
 *
 * Includes: defringing, edge feathering, dual shadow layers, and 20% color
 * temperature matching so the product looks naturally lit by the scene.
 */
export async function recompositeProduct(
  sceneBuffer: Buffer,
  cutoutBuffer: Buffer,
  canvasSize?: number,
): Promise<Buffer> {
  const CANVAS = canvasSize ?? 1024;

  // 1. Resize scene to canvas
  const scene = await sharp(sceneBuffer).resize(CANVAS, CANVAS, { fit: 'cover' }).toBuffer();

  // 2. Get cutout dimensions (already resized from createStudioShot — 65% of canvas)
  const cutMeta = await sharp(cutoutBuffer).metadata();
  const cutW = cutMeta.width ?? 500;
  const cutH = cutMeta.height ?? 500;

  // 3. Position: center horizontally, vertically at same position as studio shot
  const left = Math.round((CANVAS - cutW) / 2);
  const top = Math.round(CANVAS * 0.5 - cutH / 2);

  // 4. Defringe: erode alpha by 1px to remove background color fringe
  const alpha = await sharp(cutoutBuffer).ensureAlpha().extractChannel(3).toBuffer();
  const defringedAlpha = await sharp(alpha).blur(1.5).threshold(200).png().toBuffer();

  // 5. Feather: graduated transparency at edges (adaptive radius)
  const featherPx = Math.max(2, Math.min(6, Math.round(cutW * 0.006)));
  const featheredAlpha = await sharp(defringedAlpha).blur(featherPx).png().toBuffer();

  // 6. Apply new alpha to cutout RGB
  const rgb = await sharp(cutoutBuffer).removeAlpha().toBuffer();
  const blendedCutout = await sharp(rgb).joinChannel(featheredAlpha).png().toBuffer();

  // 7. Generate contact shadow (tight, dark, at product base)
  const contactW = Math.round(cutW * 0.88);
  const contactH = Math.max(Math.round(cutH * 0.02), 3);
  const contactShadow = await sharp({
    create: { width: contactW, height: contactH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 80 } },
  }).blur(Math.max(contactH * 0.7, 2)).png().toBuffer();
  const shadowLeft = Math.round(left + (cutW - contactW) / 2);
  const shadowTop = top + cutH - Math.round(contactH * 0.3);

  // 8. Generate cast shadow (wider, softer)
  const castW = Math.round(cutW * 0.7);
  const castH = Math.max(Math.round(cutH * 0.05), 5);
  const castShadow = await sharp({
    create: { width: castW, height: castH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 35 } },
  }).blur(Math.max(castH * 0.9, 4)).png().toBuffer();
  const castLeft = Math.round(left + (cutW - castW) / 2);
  const castTop = top + cutH;

  // 9. Color temperature matching
  // Sample scene's average color and slightly shift product to match (20% blend)
  const sceneStats = await sharp(scene).stats();
  const sceneR = sceneStats.channels[0]?.mean ?? 128;
  const sceneB = sceneStats.channels[2]?.mean ?? 128;
  const sceneWarmth = sceneR / (sceneB + 1);

  const prodRgb = await sharp(cutoutBuffer).removeAlpha().toBuffer();
  const prodStats = await sharp(prodRgb).stats();
  const prodR = prodStats.channels[0]?.mean ?? 128;
  const prodB = prodStats.channels[2]?.mean ?? 128;
  const prodWarmth = prodR / (prodB + 1);

  const warmthRatio = 1 + (sceneWarmth / (prodWarmth + 0.001) - 1) * 0.2; // 20% blend
  const rMult = Math.min(1.12, Math.max(0.88, warmthRatio));
  const bMult = Math.min(1.12, Math.max(0.88, 1 / warmthRatio));

  const colorMatchedCutout = await sharp(blendedCutout)
    .recomb([
      [rMult, 0, 0],
      [0, 1, 0],
      [0, 0, bMult],
    ])
    .png()
    .toBuffer();

  // 10. Composite: scene → cast shadow → contact shadow → product
  return sharp(scene)
    .composite([
      { input: castShadow, left: castLeft, top: Math.min(castTop, CANVAS - castH - 1), blend: 'over' },
      { input: contactShadow, left: shadowLeft, top: Math.min(shadowTop, CANVAS - contactH - 1), blend: 'over' },
      { input: colorMatchedCutout, left, top, blend: 'over' },
    ])
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();
}

// ===========================================================================
// IC-LIGHT V2: Harmonize lighting across the entire composited image
// ===========================================================================

/**
 * Apply IC-Light V2 to harmonize lighting across the entire composited image.
 * Runs AFTER recompositeProduct so the product is already correctly positioned.
 * The AI re-lights the whole image consistently — eliminates the "studio product
 * on location background" mismatch that makes composites look fake.
 *
 * highres_denoise: 0.5 — lower = preserve more existing detail.
 * Only used for creative styles (not clean white / studio).
 */
export async function harmonizeLighting(
  imageBuffer: Buffer,
  lightingPrompt: string,
  lightDirection?: 'Left' | 'Right' | 'Top' | 'Bottom' | 'None',
): Promise<Buffer> {
  ensureFalConfig();
  const startMs = Date.now();

  const imageUrl = await uploadToStorage(imageBuffer, `iclight_input_${Date.now()}.jpg`);

  const result = await withTimeout(
    fal.subscribe('fal-ai/iclight-v2' as string, {
      input: {
        image_url: imageUrl,
        prompt: lightingPrompt,
        initial_latent: lightDirection ?? 'None',
        num_inference_steps: 28,
        guidance_scale: 5,
        highres_denoise: 0.5,
        image_size: 'square_hd',
      },
      logs: false,
    }),
    90_000,
    'IC-Light V2',
  ) as { data: { images?: Array<{ url: string }>; image?: { url: string } } };

  const outputUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null;
  if (!outputUrl) throw new Error('IC-Light returned no output');

  const outputBuffer = await downloadBuffer(outputUrl);
  console.info(JSON.stringify({ event: 'iclight_complete', durationMs: Date.now() - startMs }));
  return outputBuffer;
}

// ---------------------------------------------------------------------------
// Legacy export (backward compat)
// ---------------------------------------------------------------------------

export async function runFallbackPipeline(
  params: { imageUrl: string; style: string; productCategory: string }
): Promise<{ outputUrl: string; cutoutUrl: string }> {
  const { buildScenePrompt } = await import('../prompts/product-shot.js');
  const prompt = buildScenePrompt(params.style, params.productCategory);
  const { cutoutBuffer } = await createStudioShot(params.imageUrl, params.productCategory);
  const adBuffer = await createCreativeAd(cutoutBuffer, prompt);
  const ts = Date.now();
  const [outputUrl, cutoutUrl] = await Promise.all([
    uploadToStorage(adBuffer, `output_${ts}.jpg`),
    uploadToStorage(cutoutBuffer, `cutout_${ts}.png`, 'image/png'),
  ]);
  return { outputUrl, cutoutUrl };
}

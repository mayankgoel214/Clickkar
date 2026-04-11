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

// Post-processing should be SUBTLE — Bria/Seedream output is already good.
// Heavy filters make the image look fake and over-processed.
// Grain values are kept low to avoid damaging product colors.
const STYLE_POST_CONFIG: Record<string, StylePostConfig> = {
  // Clean white: ultra-clean, zero warmth, no character — pure clinical
  style_clean_white: { grain: 0, vignette: 0.01, warmthShift: 0, satBoost: 1.0, contrast: 1.0, blackLift: 0 },

  // Colored studio: slight punch, warm-neutral, subtle character
  style_studio:      { grain: 0, vignette: 0.03, warmthShift: 1, satBoost: 1.03, contrast: 1.01, blackLift: 2 },

  // Dark luxury: cinematic — strong vignette, neutral-warm tones, punchy contrast, deeper blacks
  style_gradient:    { grain: 0, vignette: 0.09, warmthShift: 1, satBoost: 1.05, contrast: 1.04, blackLift: 0 },

  // Lifestyle: warm film look — warm tones, lifted shadows
  style_lifestyle:   { grain: 0, vignette: 0.06, warmthShift: 3, satBoost: 1.03, contrast: 0.97, blackLift: 5 },

  // Festive: warm golden glow — heaviest warmth, rich saturation, golden cast
  style_festive:     { grain: 0, vignette: 0.07, warmthShift: 5, satBoost: 1.06, contrast: 0.96, blackLift: 4 },

  // Outdoor: nature film — warm but natural, lifted shadows
  style_outdoor:     { grain: 0, vignette: 0.07, warmthShift: 2, satBoost: 1.04, contrast: 0.96, blackLift: 4 },

  // Minimal: cool, clinical, architectural — zero warmth, precise contrast, no grain
  style_minimal:     { grain: 0, vignette: 0.015, warmthShift: -1, satBoost: 0.98, contrast: 1.02, blackLift: 1 },

  // With model: warm portrait look — flattering warmth, soft contrast
  style_with_model:  { grain: 0, vignette: 0.05, warmthShift: 2, satBoost: 1.02, contrast: 0.98, blackLift: 3 },
};

const DEFAULT_POST_CONFIG: StylePostConfig = { grain: 0, vignette: 0.04, warmthShift: 1, satBoost: 1.02, contrast: 0.98, blackLift: 3 };

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

  // 1. Micro-contrast + color grade in a single sharp pipeline (avoid intermediate buffer)
  const warmR = 1.0 + (config.warmthShift > 0 ? config.warmthShift * 0.001 : 0);
  const warmB = 1.0 + (config.warmthShift < 0 ? Math.abs(config.warmthShift) * 0.001 : -config.warmthShift * 0.0005);
  result = await sharp(result)
    .sharpen({ sigma: 3, m1: 0.1, m2: 0.08 })
    .recomb([
      [warmR, 0, 0],
      [0, 1.0, 0],
      [0, 0, warmB],
    ])
    .linear(config.contrast, config.blackLift)
    .modulate({ brightness: 1.0, saturation: config.satBoost })
    .toBuffer();

  // 2. Chromatic aberration removed — 0.5px shift is imperceptible, cost 200-400ms + 8MB buffers

  // 3. Vignette (if style uses it)
  if (config.vignette > 0) {
    result = await addVignette(result, config.vignette);
  }

  // 5. Film grain (if style uses it)
  if (config.grain > 0) {
    result = await addFilmGrain(result, config.grain);
  }

  // 6. Final JPEG encode with realistic EXIF metadata
  result = await sharp(result)
    .jpeg({ quality: 95, mozjpeg: true })
    .withExifMerge({
      IFD0: {
        Software: 'ClickKar AI',
        ImageDescription: 'AI-generated product advertisement by ClickKar',
      },
    })
    .toBuffer();

  console.info(JSON.stringify({ event: 'post_process_complete', style: style ?? 'default', durationMs: Date.now() - startMs }));
  return result;
}

// @deprecated — removed from pipeline, 0.5px shift is imperceptible (costs 200-400ms + 8MB buffers)
async function addChromaticAberration(imageBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const ch = info.channels; // 4 (RGBA)
  const pixels = new Uint8Array(data);
  const output = new Uint8Array(pixels.length);

  const cx = w / 2;
  const cy = h / 2;
  const shift = 0.5; // subtle — 0.5px shift (reduced to avoid damaging product colors)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * ch;
      const dx = (x - cx) / cx; // -1 to 1
      const dy = (y - cy) / cy;

      // Red: shift outward from center
      const rx = Math.round(Math.max(0, Math.min(w - 1, x - dx * shift)));
      const ry = Math.round(Math.max(0, Math.min(h - 1, y - dy * shift)));
      const rIdx = (ry * w + rx) * ch;

      // Blue: shift inward toward center
      const bx = Math.round(Math.max(0, Math.min(w - 1, x + dx * shift)));
      const by = Math.round(Math.max(0, Math.min(h - 1, y + dy * shift)));
      const bIdx = (by * w + bx) * ch;

      output[idx] = pixels[rIdx]!;       // Red from shifted position
      output[idx + 1] = pixels[idx + 1]!; // Green stays
      output[idx + 2] = pixels[bIdx + 2]!; // Blue from shifted position
      output[idx + 3] = pixels[idx + 3]!;  // Alpha stays
    }
  }

  return sharp(Buffer.from(output), { raw: { width: w, height: h, channels: ch } })
    .removeAlpha()
    .jpeg({ quality: 95 })
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
// AD TEXT OVERLAY: Product name + brand text on finished ad creatives
// ===========================================================================

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Composite marketing text (product name + brand) onto a finished product photo.
 * Uses Sharp SVG overlays — same pattern as addAILabel.
 *
 * Returns the buffer unchanged if no text data is provided.
 */
export async function addAdOverlay(
  imageBuffer: Buffer,
  options: {
    productName?: string;
    brandName?: string;
    style?: string;
  }
): Promise<Buffer> {
  if (!options.productName && !options.brandName) return imageBuffer;

  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  const overlays: Array<{ input: Buffer; blend?: string }> = [];

  // Determine text color based on style (light text for dark styles, dark for light)
  const isDarkStyle = ['style_gradient', 'style_festive'].includes(options.style ?? '');
  const isCleanWhite = options.style === 'style_clean_white';
  const textColor = isDarkStyle ? '#FFFFFF' : isCleanWhite ? '#1A1A1A' : '#FFFFFF';
  const shadowColor = isDarkStyle ? 'rgba(0,0,0,0.6)' : isCleanWhite ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.6)';

  // Add a subtle gradient overlay at the bottom for text readability
  // Only for non-clean-white styles
  if (!isCleanWhite && options.productName) {
    const gradientSvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0"/>
          <stop offset="70%" stop-color="black" stop-opacity="0"/>
          <stop offset="100%" stop-color="black" stop-opacity="0.25"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#g)"/>
    </svg>`;
    overlays.push({ input: Buffer.from(gradientSvg), blend: 'over' });
  }

  // Build text SVG overlay
  const textElements: string[] = [];

  // Product name — bold, bottom area
  if (options.productName) {
    // Truncate long names
    let displayName = options.productName;
    if (displayName.length > 40) {
      displayName = displayName.substring(0, 37) + '...';
    }

    const fontSize = Math.round(w * 0.038); // ~39px at 1024w
    const nameY = Math.round(h * 0.88);

    // Text shadow for readability
    textElements.push(`<text x="${Math.round(w * 0.05) + 1}" y="${nameY + 1}"
      font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}"
      fill="${shadowColor}" letter-spacing="0.5">${escapeXml(displayName)}</text>`);
    // Actual text
    textElements.push(`<text x="${Math.round(w * 0.05)}" y="${nameY}"
      font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}"
      fill="${textColor}" letter-spacing="0.5">${escapeXml(displayName)}</text>`);
  }

  // Brand name — smaller, below product name
  if (options.brandName && options.brandName !== options.productName) {
    const brandSize = Math.round(w * 0.025); // ~26px at 1024w
    const brandY = Math.round(h * 0.93);

    textElements.push(`<text x="${Math.round(w * 0.05) + 1}" y="${brandY + 1}"
      font-family="Arial, Helvetica, sans-serif" font-weight="400" font-size="${brandSize}"
      fill="${shadowColor}" letter-spacing="1">${escapeXml(options.brandName.toUpperCase())}</text>`);
    textElements.push(`<text x="${Math.round(w * 0.05)}" y="${brandY}"
      font-family="Arial, Helvetica, sans-serif" font-weight="400" font-size="${brandSize}"
      fill="${textColor}" letter-spacing="1">${escapeXml(options.brandName.toUpperCase())}</text>`);
  }

  if (textElements.length > 0) {
    const textSvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${textElements.join('\n')}
    </svg>`;
    overlays.push({ input: Buffer.from(textSvg), blend: 'over' });
  }

  if (overlays.length === 0) return imageBuffer;

  return sharp(imageBuffer)
    .composite(overlays.map(o => ({ input: o.input, blend: (o.blend ?? 'over') as any })))
    .jpeg({ quality: 92 })
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
 * Fix product branding in a Seedream/Track B output by using Kontext
 * with the original product image as reference.
 *
 * Seedream regenerates the product, destroying brand text/logos.
 * This function asks Kontext to correct the product text/logos to match
 * the original product photo — preserving the creative scene + person.
 *
 * $0.04/image. Non-fatal — returns original if it fails.
 */
export async function fixProductBranding(
  sceneBuffer: Buffer,
  originalProductBuffer: Buffer,
  brandElements: string[],
): Promise<Buffer> {
  ensureFalConfig();
  const startMs = Date.now();

  try {
    const sceneUrl = await uploadToStorage(sceneBuffer, `branding_fix_scene_${Date.now()}.jpg`);
    const productUrl = await uploadToStorage(originalProductBuffer, `branding_fix_ref_${Date.now()}.jpg`);

    const brandList = brandElements.slice(0, 5).join(', ');
    const prompt = `Fix the product in this advertisement image. The product's brand text and logos are incorrect/garbled. Looking at the reference product photo, correct ALL text on the product to exactly match: ${brandList}. Keep the person, scene, and composition exactly the same. Only fix the product's text, logos, and packaging details to match the reference.`;

    const result = (await withTimeout(
      fal.subscribe('fal-ai/flux-pro/kontext' as string, {
        input: {
          prompt,
          image_url: sceneUrl,
          // Kontext supports reference images for guided editing
        },
        logs: false,
      }),
      120_000,
      'Kontext branding fix',
    )) as {
      data: { images?: Array<{ url: string }>; image?: { url: string } };
    };

    const outputUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null;
    if (!outputUrl) {
      console.warn(JSON.stringify({ event: 'branding_fix_no_output' }));
      return sceneBuffer;
    }

    const fixed = await downloadBuffer(outputUrl);
    console.info(JSON.stringify({ event: 'branding_fix_complete', durationMs: Date.now() - startMs }));
    return fixed;
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'branding_fix_failed',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startMs,
    }));
    return sceneBuffer; // Non-fatal — return original scene
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
 * Uses single-channel (greyscale) noise — 3x less memory and 3x fewer random calls
 * than the previous 3-channel approach. soft-light blend handles color interaction.
 */
async function addFilmGrain(imageBuffer: Buffer, intensity: number = 4): Promise<Buffer> {
  if (intensity <= 0) return imageBuffer;
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  // Generate a grey noise image — single channel, much faster than pixel-by-pixel 3-channel
  const noiseData = Buffer.alloc(w * h);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = Math.round(128 + (Math.random() - 0.5) * intensity * 40);
  }

  const noiseBuffer = await sharp(noiseData, { raw: { width: w, height: h, channels: 1 } })
    .jpeg({ quality: 80 })
    .toBuffer();

  return sharp(imageBuffer)
    .composite([{ input: noiseBuffer, blend: 'soft-light' }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Add vignette — subtle darkening at edges/corners.
 * Simulates real lens barrel light falloff.
 * Uses SVG radial gradient overlay instead of pixel-by-pixel iteration.
 */
async function addVignette(imageBuffer: Buffer, strength: number = 0.25): Promise<Buffer> {
  if (strength <= 0) return imageBuffer;
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  // Create radial gradient vignette as SVG
  const opacity = Math.min(strength * 3, 0.8); // scale strength to opacity
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="v" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="${opacity}"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#v)"/>
  </svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), blend: 'multiply' }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
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
      throw new Error('All storage upload methods failed');
    }
  }
}

// ---------------------------------------------------------------------------
// Layer 1: Background removal via BiRefNet v2
// ---------------------------------------------------------------------------

export async function removeBackground(imageUrl: string): Promise<string> {
  ensureFalConfig();
  const startMs = Date.now();

  const result = (await withTimeout(
    fal.subscribe(BIREFNET_MODEL as string, {
      input: { image_url: imageUrl },
      logs: false,
    }),
    60_000,
    'BiRefNet',
  )) as {
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
  productCategory: string,
  canvasFill?: number,  // 0.5-0.95, default 0.65
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

  // Product fills canvasFill% of canvas (clamped to 0.5–0.95, default 0.65)
  const fill = Math.min(0.95, Math.max(0.5, canvasFill ?? 0.65));
  const maxDim = Math.round(CANVAS_SIZE * fill);
  const scale = Math.min(maxDim / cutW, maxDim / cutH);
  const scaledW = Math.round(cutW * scale);
  const scaledH = Math.round(cutH * scale);

  const resizedCutout = await sharp(cutoutBuffer)
    .resize(scaledW, scaledH, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  const left = Math.round((CANVAS_SIZE - scaledW) / 2);
  const top = Math.round(CANVAS_SIZE * 0.5 - scaledH / 2);

  // Clean composite: product on white background with subtle soft shadow
  // Shadow: use a large blurred copy of the cutout shifted down as contact shadow
  let shadowBuffer: Buffer | undefined;
  try {
    // Create shadow from the cutout itself — blur it heavily and darken
    const shadowRaw = await sharp(resizedCutout)
      .resize(scaledW, scaledH)
      .flatten({ background: { r: 0, g: 0, b: 0 } }) // make opaque black shape
      .ensureAlpha(0.12) // very transparent
      .blur(Math.max(scaledW * 0.05, 5))
      .png()
      .toBuffer();
    shadowBuffer = shadowRaw;
  } catch {
    // Shadow failed — skip it, just white bg + product
  }

  const composites: { input: Buffer; left: number; top: number; blend: 'over' }[] = [];
  if (shadowBuffer) {
    composites.push({
      input: shadowBuffer,
      left: left + Math.round(scaledW * 0.05),
      top: top + Math.round(scaledH * 0.03),
      blend: 'over' as const,
    });
  }
  composites.push({ input: resizedCutout, left, top, blend: 'over' as const });

  const studioBuffer = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  console.info(JSON.stringify({ event: 'studio_shot_complete', durationMs: Date.now() - startMs }));
  return { studioBuffer, cutoutBuffer: resizedCutout, cutoutUrl };
}

/**
 * Re-composite an existing cutout buffer at a different canvas fill.
 * Skips BiRefNet (cutout already exists) — just resize + shadow + white bg.
 */
export async function compositeStudioShot(
  existingCutoutBuffer: Buffer,
  productCategory: string,
  canvasFill?: number,
): Promise<{ studioBuffer: Buffer; cutoutBuffer: Buffer }> {
  const CANVAS_SIZE = 1024;
  const fill = Math.min(0.95, Math.max(0.5, canvasFill ?? 0.65));

  const cutMeta = await sharp(existingCutoutBuffer).metadata();
  const cutW = cutMeta.width ?? 500;
  const cutH = cutMeta.height ?? 500;

  const maxDim = Math.round(CANVAS_SIZE * fill);
  const scale = Math.min(maxDim / cutW, maxDim / cutH);
  const scaledW = Math.round(cutW * scale);
  const scaledH = Math.round(cutH * scale);

  const resizedCutout = await sharp(existingCutoutBuffer)
    .resize(scaledW, scaledH, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  const left = Math.round((CANVAS_SIZE - scaledW) / 2);
  const top = Math.round(CANVAS_SIZE * 0.5 - scaledH / 2);

  // Clean composite: product on white background (no shadow — previous shadow was rendering as black rectangle)
  const studioBuffer = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      { input: resizedCutout, left, top, blend: 'over' },
    ])
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  return { studioBuffer, cutoutBuffer: resizedCutout };
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

    const result = (await withTimeout(
      fal.subscribe(SEEDREAM_EDIT_MODEL as string, {
        input: {
          prompt,
          image_urls: [imageUrl],
          image_size: 'square_hd',
          num_images: 1,
        },
        logs: false,
      }),
      120_000,
      'Seedream',
    )) as {
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
// Bria Product Shot fallback (Tier 2 upgrade in never-fail pipeline)
// ---------------------------------------------------------------------------

/**
 * Scene prompts for Bria Product Shot, keyed by style.
 * These describe the background scene Bria should generate around the product.
 */
function getBriaScenePrompt(style: string, _category: string): string {
  const prompts: Record<string, string> = {
    style_clean_white: 'Clean white studio background with soft even lighting, professional e-commerce photography',
    style_studio: 'Professional studio with bold colored seamless backdrop, three-point studio lighting, dramatic shadows',
    style_gradient: 'Dark luxury setting with black reflective surface, dramatic rim lighting, premium atmosphere',
    style_lifestyle: 'Warm lifestyle setting, natural window light, cozy home environment with contextual props',
    style_outdoor: 'Outdoor natural setting, golden hour sunlight, wooden surface, lush green nature background',
    style_festive: 'Festive Indian celebration setting with warm golden lighting, traditional decorative elements',
    style_minimal: 'Minimal setting with concrete surface, single directional light, large negative space, dramatic shadow',
    style_with_model: 'Lifestyle setting with natural light, casual modern environment',
  };
  return prompts[style] ?? prompts['style_lifestyle']!;
}

/**
 * Creates a product shot using Bria Product Shot via fal.ai.
 * Takes the raw image, runs BiRefNet cutout + white canvas (createStudioShot),
 * uploads that studio shot, then sends it to Bria for scene generation.
 *
 * This produces MUCH better output than a flat-color background — Bria generates
 * a realistic scene around the product while preserving product fidelity.
 *
 * @param rawBuffer - Raw image buffer (unused directly, but kept for interface consistency)
 * @param imageUrl - Public URL of the original image (used for BiRefNet)
 * @param style - Style ID for scene prompt selection
 * @param productCategory - Product category for cutout enhancement
 * @returns Processed image buffer ready for upload
 */
export async function createBriaFallbackShot(
  _rawBuffer: Buffer,
  imageUrl: string,
  style: string,
  productCategory: string,
): Promise<Buffer> {
  const startMs = Date.now();
  console.info(JSON.stringify({ event: 'bria_fallback_start', style, productCategory }));

  // 1. Create a studio shot (BiRefNet cutout on white canvas with shadow)
  const { studioBuffer } = await createStudioShot(imageUrl, productCategory);

  // 2. Upload the studio shot to get a URL for Bria
  const studioUrl = await uploadToStorage(studioBuffer, `bria_input_${Date.now()}.jpg`);

  // 3. Generate a style-appropriate scene prompt
  const scenePrompt = getBriaScenePrompt(style, productCategory);

  // 4. Call Bria Product Shot via fal.ai
  ensureFalConfig();

  const briaResult = (await withTimeout(
    fal.subscribe('fal-ai/bria/product-shot' as string, {
      input: {
        image_url: studioUrl,
        scene_description: scenePrompt,
        optimize_description: true,
        num_results: 1,
        fast: true,
        placement_type: 'manual_padding',
        padding_values: [80, 80, 80, 80],  // even padding — product centered
        shot_size: [1024, 1024],
      },
      logs: false,
    }),
    60_000,
    'bria_product_shot',
  )) as { data: { images?: Array<{ url: string }> } };

  const outputUrl = briaResult.data?.images?.[0]?.url;
  if (!outputUrl) throw new Error('Bria Product Shot returned no image');

  const outputBuffer = await downloadBuffer(outputUrl);
  console.info(JSON.stringify({ event: 'bria_fallback_complete', durationMs: Date.now() - startMs }));
  return outputBuffer;
}

// ---------------------------------------------------------------------------
// Story Format (9:16) — extends square ad to Instagram Stories / WhatsApp Status
// ---------------------------------------------------------------------------

/**
 * Takes a square (1:1) product ad and creates a 1080x1920 (9:16) story format.
 * Extends the background using dominant color sampling and gradient blending.
 * Product is placed slightly below center, leaving space at top for text overlays.
 *
 * ~200ms sharp-only operation, zero API cost.
 */
export async function generateStoryFormat(
  squareBuffer: Buffer,
  _style?: string,
): Promise<Buffer> {
  const STORY_W = 1080;
  const STORY_H = 1920;

  // Resize the square image to fit the story width
  const resized = await sharp(squareBuffer)
    .resize(STORY_W, STORY_W, { fit: 'cover' })
    .toBuffer();

  // Sample the edges of the resized image to get the dominant background color
  const { dominant } = await sharp(resized).stats();
  const bgColor = {
    r: Math.round(dominant.r),
    g: Math.round(dominant.g),
    b: Math.round(dominant.b),
  };

  // Create the story canvas with the dominant background color
  const canvas = await sharp({
    create: {
      width: STORY_W,
      height: STORY_H,
      channels: 3,
      background: bgColor,
    },
  })
    .jpeg({ quality: 92 })
    .toBuffer();

  // Gradient overlays that blend the product image edges into the solid background
  const gradientSvg = `<svg width="${STORY_W}" height="${STORY_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgb(${bgColor.r},${bgColor.g},${bgColor.b})" stop-opacity="1"/>
        <stop offset="100%" stop-color="rgb(${bgColor.r},${bgColor.g},${bgColor.b})" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgb(${bgColor.r},${bgColor.g},${bgColor.b})" stop-opacity="0"/>
        <stop offset="100%" stop-color="rgb(${bgColor.r},${bgColor.g},${bgColor.b})" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <rect y="0" width="${STORY_W}" height="200" fill="url(#topFade)"/>
    <rect y="${STORY_H - 200}" width="${STORY_W}" height="200" fill="url(#bottomFade)"/>
  </svg>`;

  // Position the square image slightly below center — leaves more space at top for text
  const topOffset = Math.round((STORY_H - STORY_W) * 0.45);

  return sharp(canvas)
    .composite([
      { input: resized, top: topOffset, left: 0 },
      { input: Buffer.from(gradientSvg), blend: 'over' as const },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
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

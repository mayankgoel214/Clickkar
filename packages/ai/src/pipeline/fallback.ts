import { fal } from '@fal-ai/client';
import { getProviderKey } from '@autmn/keypool';
import sharp from 'sharp';

function ensureFalConfig() {
  fal.config({ credentials: getProviderKey('fal') });
}

// ---------------------------------------------------------------------------
// fal.ai models
// ---------------------------------------------------------------------------

const BIREFNET_MODEL = 'fal-ai/birefnet/v2';

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

// Post-processing should be SUBTLE — Gemini output is already good.
// Grain re-enabled at very low levels for anti-AI detection.
const STYLE_POST_CONFIG: Record<string, StylePostConfig> = {
  style_clean_white: { grain: 0.002, vignette: 0.005, warmthShift: 0, satBoost: 1.0, contrast: 1.0, blackLift: 0 },
  style_studio:      { grain: 0.003, vignette: 0.02, warmthShift: 1, satBoost: 1.02, contrast: 1.01, blackLift: 2 },
  style_gradient:    { grain: 0.003, vignette: 0.05, warmthShift: 1, satBoost: 1.0, contrast: 1.06, blackLift: 3 },
  style_lifestyle:   { grain: 0.004, vignette: 0.04, warmthShift: 3, satBoost: 1.02, contrast: 0.97, blackLift: 5 },
  style_festive:     { grain: 0.003, vignette: 0.05, warmthShift: 5, satBoost: 1.04, contrast: 0.96, blackLift: 4 },
  style_outdoor:     { grain: 0.004, vignette: 0.05, warmthShift: 2, satBoost: 1.03, contrast: 0.96, blackLift: 4 },
  style_minimal:     { grain: 0.002, vignette: 0.01, warmthShift: -1, satBoost: 0.95, contrast: 1.02, blackLift: 1 },
  style_with_model:       { grain: 0.003, vignette: 0.04, warmthShift: 2, satBoost: 1.01, contrast: 0.98, blackLift: 3 },
  style_autmn_special: { grain: 0.003, vignette: 0.10, warmthShift: 0, satBoost: 1.02, contrast: 1.0, blackLift: 3 },
  style_video_shoot:      { grain: 0, vignette: 0.02, warmthShift: 1, satBoost: 1.02, contrast: 1.0, blackLift: 0 },
};

const DEFAULT_POST_CONFIG: StylePostConfig = { grain: 0, vignette: 0.04, warmthShift: 1, satBoost: 1.02, contrast: 0.98, blackLift: 3 };

/**
 * Full post-processing pipeline that transforms AI output into
 * something indistinguishable from a real camera shot.
 *
 * Style-aware: each style gets different grain, vignette, color grade.
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
    .sharpen({ sigma: 1.5, m1: 0.05, m2: 0.04 })
    .recomb([
      [warmR, 0, 0],
      [0, 1.0, 0],
      [0, 0, warmB],
    ])
    .linear(config.contrast, config.blackLift)
    .modulate({ brightness: 1.0, saturation: config.satBoost })
    .toBuffer();

  // 2. Vignette (if style uses it)
  if (config.vignette > 0) {
    result = await addVignette(result, config.vignette);
  }

  // 3. Film grain (if style uses it)
  if (config.grain > 0) {
    result = await addFilmGrain(result, config.grain);
  }

  // 4. Final JPEG encode with realistic EXIF metadata
  result = await sharp(result)
    .jpeg({ quality: 95, mozjpeg: true })
    .withExifMerge({
      IFD0: {
        Software: 'Autmn AI',
        ImageDescription: 'AI-generated product advertisement by Autmn',
      },
    })
    .toBuffer();

  console.info(JSON.stringify({ event: 'post_process_complete', style: style ?? 'default', durationMs: Date.now() - startMs }));
  return result;
}

/**
 * Composite the Autmn logo watermark onto the image.
 */
export async function addAILabel(imageBuffer: Buffer): Promise<Buffer> {
  let workingBuffer = imageBuffer;

  // Upscale to at least 1280px for better WhatsApp delivery quality
  const metaCheck = await sharp(workingBuffer).metadata();
  const wCheck = metaCheck.width ?? 1024;
  const hCheck = metaCheck.height ?? 1024;
  if (wCheck < 1280 && hCheck < 1280) {
    const scale = Math.min(1280 / wCheck, 1280 / hCheck);
    workingBuffer = await sharp(workingBuffer)
      .resize(Math.round(wCheck * scale), Math.round(hCheck * scale), { kernel: 'lanczos3' })
      .toBuffer();
  }

  const meta = await sharp(workingBuffer).metadata();
  const w = meta.width ?? 1280;
  const h = meta.height ?? 1280;

  // --- Step 1: Bottom gradient scrim for consistent legibility ---
  const scrimHeight = Math.max(40, Math.round(h * 0.06));
  const scrimSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${scrimHeight}">
    <defs>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="black" stop-opacity="0"/>
        <stop offset="1" stop-color="black" stop-opacity="0.18"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${scrimHeight}" fill="url(#scrim)"/>
  </svg>`);
  const scrimPng = await sharp(scrimSvg).png().toBuffer();

  // --- Step 2: Logo badge ---
  const badgeW = Math.max(100, Math.min(200, Math.round(w * 0.12)));
  const badgeH = Math.round(badgeW * (52 / 200));
  const padX = Math.round(badgeW * 0.04);
  const padY = Math.round(badgeH * 0.12);
  const pillW = badgeW + padX * 2;
  const pillH = badgeH + padY * 2;

  const badgeSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pillW}" height="${pillH}" viewBox="0 0 ${pillW} ${pillH}">
    <rect width="${pillW}" height="${pillH}" fill="rgba(0,0,0,0.32)" rx="${Math.round(pillH * 0.15)}"/>
    <svg x="${padX}" y="${padY}" width="${badgeW}" height="${badgeH}" viewBox="0 0 200 52">
      <g opacity="0.9">
        <path d="M10 42 A20 20 0 0 1 10 18" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M10 18 L10 30 L22 18" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 30 L22 42" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="28" y1="12" x2="28" y2="46" stroke="#EF9F27" stroke-width="1.2" opacity="0.85"/>
        <text x="36" y="34" font-family="Arial,Helvetica,sans-serif" font-weight="600" font-size="18" fill="white" letter-spacing="-0.3">autmn</text>
      </g>
    </svg>
  </svg>`);
  const badgePng = await sharp(badgeSvg).png().toBuffer();

  // --- Step 3: Composite both layers ---
  const margin = Math.max(10, Math.round(w * 0.012));

  return sharp(workingBuffer)
    .composite([
      { input: scrimPng, left: 0, top: h - scrimHeight, blend: 'over' },
      { input: badgePng, left: w - pillW - margin, top: h - pillH - margin, blend: 'over' },
    ])
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();
}

/**
 * Add uniform film grain over entire image.
 * Uses single-channel (greyscale) noise — efficient and fast.
 */
async function addFilmGrain(imageBuffer: Buffer, intensity: number = 4): Promise<Buffer> {
  if (intensity <= 0) return imageBuffer;
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

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
 */
async function addVignette(imageBuffer: Buffer, strength: number = 0.25): Promise<Buffer> {
  if (strength <= 0) return imageBuffer;
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  const opacity = Math.min(strength * 3, 0.8);
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
    const { uploadFile, Buckets } = await import('@autmn/storage');
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
// Background removal via BiRefNet v2 (fal.ai)
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

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

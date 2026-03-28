import { fal } from '@fal-ai/client';
import sharp from 'sharp';
import { buildScenePrompt } from '../prompts/product-shot.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FallbackPipelineParams {
  imageUrl: string;
  style: string;
  productCategory: string;
}

interface FallbackPipelineOutput {
  outputUrl: string;
  cutoutUrl: string;
}

// ---------------------------------------------------------------------------
// fal.ai models
// ---------------------------------------------------------------------------

const RMBG_MODEL = 'fal-ai/bria/rmbg/v2';
const FLUX_SCHNELL_MODEL = 'fal-ai/flux/schnell';

// ---------------------------------------------------------------------------
// Step 1: Background removal
// ---------------------------------------------------------------------------

async function removeBackground(imageUrl: string): Promise<string> {
  const startMs = Date.now();

  const result = (await fal.subscribe(RMBG_MODEL, {
    input: { image_url: imageUrl },
    logs: false,
  })) as {
    data: {
      image?: { url: string };
      images?: Array<{ url: string }>;
    };
  };

  const cutoutUrl =
    result.data?.image?.url ?? result.data?.images?.[0]?.url ?? null;

  if (!cutoutUrl) {
    throw new Error('RMBG 2.0 returned no cutout URL');
  }

  console.info(
    JSON.stringify({
      event: 'fallback_rmbg_complete',
      cutoutUrl,
      durationMs: Date.now() - startMs,
    })
  );

  return cutoutUrl;
}

// ---------------------------------------------------------------------------
// Step 2: Product enhancement via sharp (on cutout PNG)
// ---------------------------------------------------------------------------

/** Category-specific saturation boost multipliers */
const SATURATION_BY_CATEGORY: Record<string, number> = {
  food: 1.25,
  jewellery: 1.15,
  garment: 1.1,
  skincare: 1.05,
  candle: 1.2,
  bag: 1.1,
  home_goods: 1.08,
  other: 1.05,
};

async function enhanceProductCutout(
  cutoutBuffer: Buffer,
  productCategory: string
): Promise<Buffer> {
  const saturation = SATURATION_BY_CATEGORY[productCategory] ?? 1.05;

  const enhanced = await sharp(cutoutBuffer)
    .normalize() // stretch histogram — improves washed-out product shots
    .modulate({ saturation }) // boost saturation by category
    .png() // keep transparency
    .toBuffer();

  return enhanced;
}

// ---------------------------------------------------------------------------
// Step 3: Background generation via Flux Schnell
// ---------------------------------------------------------------------------

async function generateBackground(
  style: string,
  productCategory: string
): Promise<string> {
  const startMs = Date.now();

  // Build a background-only prompt — no product, just the scene
  const scenePrompt = buildScenePrompt(style, productCategory);
  const bgPrompt = `${scenePrompt}, no product, no object, background only, photography backdrop`;

  const result = (await fal.subscribe(FLUX_SCHNELL_MODEL, {
    input: {
      prompt: bgPrompt,
      image_size: 'square_hd', // 1024x1024
      num_inference_steps: 4, // Schnell is optimised for low steps
      num_images: 1,
    },
    logs: false,
  })) as {
    data: {
      images?: Array<{ url: string }>;
    };
  };

  const bgUrl = result.data?.images?.[0]?.url ?? null;

  if (!bgUrl) {
    throw new Error('Flux Schnell returned no background URL');
  }

  console.info(
    JSON.stringify({
      event: 'fallback_bg_generated',
      bgUrl,
      style,
      durationMs: Date.now() - startMs,
    })
  );

  return bgUrl;
}

// ---------------------------------------------------------------------------
// Step 4: Composite cutout onto background via sharp
// ---------------------------------------------------------------------------

async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(
      `Failed to download image from ${url}: ${resp.status} ${resp.statusText}`
    );
  }
  return Buffer.from(await resp.arrayBuffer());
}

async function compositeImages(
  cutoutBuffer: Buffer,
  backgroundBuffer: Buffer
): Promise<Buffer> {
  // Get background dimensions
  const bgMeta = await sharp(backgroundBuffer).metadata();
  const bgW = bgMeta.width ?? 1024;
  const bgH = bgMeta.height ?? 1024;

  // Scale cutout to fit 80% of background area, centred
  const targetW = Math.round(bgW * 0.8);
  const targetH = Math.round(bgH * 0.8);

  const resizedCutout = await sharp(cutoutBuffer)
    .resize(targetW, targetH, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();

  // Get resized cutout dimensions to calculate centering offset
  const cutoutMeta = await sharp(resizedCutout).metadata();
  const cutW = cutoutMeta.width ?? targetW;
  const cutH = cutoutMeta.height ?? targetH;

  const left = Math.round((bgW - cutW) / 2);
  // Slightly below centre looks more natural for product shots
  const top = Math.round((bgH - cutH) / 2) + Math.round(bgH * 0.03);

  // Add a soft drop shadow by creating a blurred dark layer below the cutout
  const shadowBuffer = await sharp({
    create: {
      width: cutW,
      height: cutH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.3 },
    },
  })
    .png()
    .toBuffer();

  // Composite: background → shadow (offset down+right) → cutout
  const shadowOffsetX = Math.round(bgW * 0.015);
  const shadowOffsetY = Math.round(bgH * 0.02);

  const composited = await sharp(backgroundBuffer)
    .composite([
      {
        input: shadowBuffer,
        left: left + shadowOffsetX,
        top: top + shadowOffsetY,
        blend: 'multiply',
      },
      {
        input: resizedCutout,
        left,
        top,
        blend: 'over',
      },
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return composited;
}

// ---------------------------------------------------------------------------
// Upload helper — stores buffer to Supabase Storage and returns public URL
// ---------------------------------------------------------------------------

async function uploadToStorage(
  buffer: Buffer,
  filename: string
): Promise<string> {
  // Dynamic import to avoid hard dependency on @whatsads/storage
  // In production this uses the storage package. Falls back to a data URL for testing.
  try {
    const { uploadFile, Buckets } = await import('@whatsads/storage');
    return await uploadFile(Buckets.PROCESSED_IMAGES, filename, buffer, 'image/jpeg');
  } catch {
    // Fallback: return a data URL (only acceptable in dev/test)
    console.warn(
      JSON.stringify({
        event: 'fallback_storage_unavailable',
        filename,
        note: 'Using data URL fallback — set up @whatsads/storage for production',
      })
    );
    const base64 = buffer.toString('base64');
    return `data:image/jpeg;base64,${base64.slice(0, 100)}...`;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run the fallback pipeline when Bria Product Shot fails QA.
 *
 * Steps:
 * 1. Remove background via Bria RMBG 2.0
 * 2. Enhance product cutout via sharp (parallel-friendly after step 1)
 * 3. Generate background via Flux Schnell
 * 4. Composite cutout onto background with drop shadow
 *
 * Returns both the final composited URL and the cutout URL (for fast revisions).
 */
export async function runFallbackPipeline(
  params: FallbackPipelineParams
): Promise<FallbackPipelineOutput> {
  const startMs = Date.now();

  console.info(
    JSON.stringify({
      event: 'fallback_pipeline_start',
      style: params.style,
      productCategory: params.productCategory,
    })
  );

  // Step 1: Remove background (must complete before step 2 enhancement)
  const cutoutUrl = await removeBackground(params.imageUrl);

  // Steps 2 & 3 can run in parallel once we have the cutout URL
  const cutoutBufferPromise = downloadBuffer(cutoutUrl).then((buf) =>
    enhanceProductCutout(buf, params.productCategory)
  );

  const backgroundUrlPromise = generateBackground(
    params.style,
    params.productCategory
  );

  const [enhancedCutoutBuffer, backgroundUrl] = await Promise.all([
    cutoutBufferPromise,
    backgroundUrlPromise,
  ]);

  // Step 4: Download background and composite
  const backgroundBuffer = await downloadBuffer(backgroundUrl);
  const compositedBuffer = await compositeImages(
    enhancedCutoutBuffer,
    backgroundBuffer
  );

  // Upload both outputs
  const timestamp = Date.now();
  const [outputUrl, storedCutoutUrl] = await Promise.all([
    uploadToStorage(compositedBuffer, `output_${timestamp}.jpg`),
    uploadToStorage(enhancedCutoutBuffer, `cutout_${timestamp}.png`),
  ]);

  console.info(
    JSON.stringify({
      event: 'fallback_pipeline_complete',
      outputUrl,
      cutoutUrl: storedCutoutUrl,
      durationMs: Date.now() - startMs,
    })
  );

  return { outputUrl, cutoutUrl: storedCutoutUrl };
}

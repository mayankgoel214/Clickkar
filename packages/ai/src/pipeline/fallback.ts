import { fal } from '@fal-ai/client';
import sharp from 'sharp';
import { buildScenePrompt } from '../prompts/product-shot.js';

function ensureFalConfig() {
  const key = process.env['FAL_KEY'] ?? process.env['FAL_API_KEY'] ?? '';
  fal.config({ credentials: key });
}

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
// fal.ai models — upgraded from v1 pipeline
// ---------------------------------------------------------------------------

/** BiRefNet — state-of-the-art bilateral reference segmentation */
const BIREFNET_MODEL = 'fal-ai/birefnet/v2';
/** Flux Pro 1.1 — high-quality background generation */
const FLUX_PRO_MODEL = 'fal-ai/flux-pro/v1.1';
/** IC-Light V2 — relighting to match product with background */
const ICLIGHT_MODEL = 'fal-ai/ic-light/v2';

// ---------------------------------------------------------------------------
// Step 1: Background removal via BiRefNet v2
// ---------------------------------------------------------------------------

export async function removeBackground(imageUrl: string): Promise<string> {
  ensureFalConfig();
  const startMs = Date.now();

  const result = (await fal.subscribe(BIREFNET_MODEL as string, {
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
    throw new Error('BiRefNet v2 returned no cutout URL');
  }

  console.info(
    JSON.stringify({
      event: 'segmentation_birefnet_complete',
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
    .sharpen({ sigma: 0.8, m1: 1.0, m2: 0.5 }) // gentle sharpening for product detail
    .png() // keep transparency
    .toBuffer();

  return enhanced;
}

// ---------------------------------------------------------------------------
// Step 3: Background generation via Flux Pro 1.1
// ---------------------------------------------------------------------------

async function generateBackground(
  style: string,
  productCategory: string
): Promise<string> {
  const startMs = Date.now();

  const scenePrompt = buildScenePrompt(style, productCategory);
  const bgPrompt = `${scenePrompt}, empty scene, no product, no object, background only, photography backdrop, high quality studio photography`;

  const result = (await fal.subscribe(FLUX_PRO_MODEL as string, {
    input: {
      prompt: bgPrompt,
      image_size: 'square_hd', // 1024x1024
      num_images: 1,
      guidance_scale: 3.5,
    },
    logs: false,
  })) as {
    data: {
      images?: Array<{ url: string }>;
    };
  };

  const bgUrl = result.data?.images?.[0]?.url ?? null;

  if (!bgUrl) {
    throw new Error('Flux Pro returned no background URL');
  }

  console.info(
    JSON.stringify({
      event: 'segmentation_bg_generated',
      bgUrl,
      style,
      durationMs: Date.now() - startMs,
    })
  );

  return bgUrl;
}

// ---------------------------------------------------------------------------
// Step 4: Relighting via IC-Light V2 (optional, best-effort)
// ---------------------------------------------------------------------------

async function relightProduct(
  cutoutUrl: string,
  backgroundUrl: string
): Promise<string | null> {
  const startMs = Date.now();

  try {
    const result = (await fal.subscribe(ICLIGHT_MODEL as string, {
      input: {
        image_url: cutoutUrl,
        prompt: 'Product with natural lighting that matches the background scene, consistent shadows and highlights, photorealistic',
        background_image_url: backgroundUrl,
      },
      logs: false,
    })) as {
      data: {
        images?: Array<{ url: string }>;
        image?: { url: string };
      };
    };

    const relitUrl =
      result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null;

    if (relitUrl) {
      console.info(
        JSON.stringify({
          event: 'segmentation_relight_complete',
          durationMs: Date.now() - startMs,
        })
      );
      return relitUrl;
    }
  } catch (err) {
    // IC-Light is optional — log and continue without relighting
    console.warn(
      JSON.stringify({
        event: 'segmentation_relight_skipped',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startMs,
      })
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Step 5: Composite cutout onto background via sharp
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

  // Scale cutout to fit 75% of background area, centred
  const targetW = Math.round(bgW * 0.75);
  const targetH = Math.round(bgH * 0.75);

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
  const top = Math.round((bgH - cutH) / 2) + Math.round(bgH * 0.04);

  // Create a soft shadow from the cutout silhouette
  const shadowBuffer = await sharp({
    create: {
      width: cutW,
      height: cutH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.25 },
    },
  })
    .png()
    .toBuffer();

  // Shadow offset
  const shadowOffsetX = Math.round(bgW * 0.008);
  const shadowOffsetY = Math.round(bgH * 0.015);

  // Composite: background → shadow → cutout
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
  try {
    const { uploadFile, Buckets } = await import('@whatsads/storage');
    return await uploadFile(Buckets.PROCESSED_IMAGES, filename, buffer, 'image/jpeg');
  } catch {
    console.warn(
      JSON.stringify({
        event: 'segmentation_storage_unavailable',
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
 * Run the segmentation-first compositing pipeline.
 *
 * This pipeline PRESERVES the original product pixels — it never regenerates
 * the product. Steps:
 * 1. Remove background via BiRefNet v2 (state-of-the-art segmentation)
 * 2. Enhance product cutout via sharp (normalize, saturate, sharpen)
 * 3. Generate background via Flux Pro 1.1 (high-quality scene)
 * 4. Relight product to match background via IC-Light V2 (best-effort)
 * 5. Composite cutout onto background with natural shadow
 *
 * Returns both the final composited URL and the cutout URL (for fast revisions).
 */
export async function runFallbackPipeline(
  params: FallbackPipelineParams
): Promise<FallbackPipelineOutput> {
  ensureFalConfig();
  const startMs = Date.now();

  console.info(
    JSON.stringify({
      event: 'segmentation_pipeline_start',
      style: params.style,
      productCategory: params.productCategory,
    })
  );

  // Step 1: Remove background
  const cutoutUrl = await removeBackground(params.imageUrl);

  // Steps 2 & 3 run in parallel
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

  // Step 4: Try relighting the enhanced cutout (best-effort)
  // Upload enhanced cutout first so IC-Light can access it via URL
  const timestamp = Date.now();
  const tempCutoutUrl = await uploadToStorage(
    enhancedCutoutBuffer,
    `cutout_${timestamp}.png`
  );

  let finalCutoutBuffer = enhancedCutoutBuffer;
  const relitUrl = await relightProduct(tempCutoutUrl, backgroundUrl);
  if (relitUrl) {
    try {
      finalCutoutBuffer = await downloadBuffer(relitUrl);
    } catch {
      // Use non-relit cutout if download fails
    }
  }

  // Step 5: Download background and composite
  const backgroundBuffer = await downloadBuffer(backgroundUrl);
  const compositedBuffer = await compositeImages(
    finalCutoutBuffer,
    backgroundBuffer
  );

  // Upload final output
  const [outputUrl] = await Promise.all([
    uploadToStorage(compositedBuffer, `output_${timestamp}.jpg`),
  ]);

  console.info(
    JSON.stringify({
      event: 'segmentation_pipeline_complete',
      outputUrl,
      cutoutUrl: tempCutoutUrl,
      relightApplied: relitUrl !== null,
      durationMs: Date.now() - startMs,
    })
  );

  return { outputUrl, cutoutUrl: tempCutoutUrl };
}

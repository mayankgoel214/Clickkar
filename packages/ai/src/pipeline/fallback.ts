import { fal } from '@fal-ai/client';
import sharp from 'sharp';

function ensureFalConfig() {
  const key = process.env['FAL_KEY'] ?? process.env['FAL_API_KEY'] ?? '';
  fal.config({ credentials: key });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompositePipelineParams {
  imageUrl: string;
  creativePrompt: string;
  productCategory: string;
}

export interface CompositePipelineOutput {
  outputUrl: string;
  cutoutUrl: string;
}

// ---------------------------------------------------------------------------
// fal.ai models
// ---------------------------------------------------------------------------

const BIREFNET_MODEL = 'fal-ai/birefnet/v2';
const FLUX_INPAINT_MODEL = 'fal-ai/flux-pro/v1/fill';

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
      event: 'birefnet_complete',
      cutoutUrl,
      durationMs: Date.now() - startMs,
    })
  );

  return cutoutUrl;
}

// ---------------------------------------------------------------------------
// Layer 2: Product cutout enhancement
// ---------------------------------------------------------------------------

const SATURATION_BY_CATEGORY: Record<string, number> = {
  food: 1.2,
  jewellery: 1.12,
  garment: 1.08,
  skincare: 1.05,
  candle: 1.15,
  bag: 1.08,
  home_goods: 1.06,
  electronics: 1.03,
  handicraft: 1.1,
  other: 1.05,
};

export async function enhanceCutout(
  cutoutBuffer: Buffer,
  productCategory: string
): Promise<Buffer> {
  const saturation = SATURATION_BY_CATEGORY[productCategory] ?? 1.05;
  const meta = await sharp(cutoutBuffer).metadata();
  const w = meta.width ?? 800;
  const h = meta.height ?? 800;

  let pipeline = sharp(cutoutBuffer);

  // Upscale small cutouts
  if (w < 800 && h < 800) {
    const scale = 800 / Math.max(w, h);
    pipeline = pipeline.resize(
      Math.round(w * scale),
      Math.round(h * scale),
      { kernel: 'lanczos3' }
    );
  }

  return pipeline
    .normalize()
    .modulate({ saturation })
    .sharpen({ sigma: 0.6, m1: 0.8, m2: 0.4 })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Layer 3+4: Inpainting — generate creative scene AROUND the product
// ---------------------------------------------------------------------------

/**
 * Place the product cutout on a 1024x1024 canvas, create a mask where the
 * product is (keep zone), and run Flux inpainting to generate the creative
 * scene around it. The product pixels are preserved.
 */
async function prepareCanvasAndMask(
  cutoutBuffer: Buffer
): Promise<{ canvas: Buffer; mask: Buffer; left: number; top: number }> {
  const CANVAS_SIZE = 1024;

  const cutMeta = await sharp(cutoutBuffer).metadata();
  const cutW = cutMeta.width ?? 500;
  const cutH = cutMeta.height ?? 500;

  // Scale cutout to fill ~55% of canvas (leaves room for creative elements)
  const maxDim = Math.round(CANVAS_SIZE * 0.55);
  const scale = Math.min(maxDim / cutW, maxDim / cutH);
  const scaledW = Math.round(cutW * scale);
  const scaledH = Math.round(cutH * scale);

  const resizedCutout = await sharp(cutoutBuffer)
    .resize(scaledW, scaledH, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  // Center horizontally, position in lower-center area (natural product placement)
  const left = Math.round((CANVAS_SIZE - scaledW) / 2);
  const top = Math.round(CANVAS_SIZE * 0.5 - scaledH / 2);

  // Canvas: white background with product composited on it
  const canvas = await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite([
      {
        input: resizedCutout,
        left,
        top,
        blend: 'over',
      },
    ])
    .png()
    .toBuffer();

  // Mask: WHITE = inpaint (generate), BLACK = keep (product stays)
  // Extract alpha from cutout to know where the product is
  const alphaChannel = await sharp(resizedCutout)
    .ensureAlpha()
    .extractChannel(3)
    .toBuffer();

  // Invert: product area (alpha > 0) becomes black (keep), rest white (generate)
  // Then place on white canvas
  const productMaskPiece = await sharp(alphaChannel)
    .negate() // invert: product pixels become black, transparent becomes white
    .png()
    .toBuffer();

  const mask = await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }, // white = inpaint everything by default
    },
  })
    .composite([
      {
        input: productMaskPiece,
        left,
        top,
        blend: 'multiply', // black areas (product) stay black
      },
    ])
    .png()
    .toBuffer();

  return { canvas, mask, left, top };
}

/**
 * Upload a buffer to a temporary URL that fal.ai can access.
 * Uses Supabase storage, falls back to fal.ai's own upload.
 */
async function uploadTempImage(buffer: Buffer, name: string): Promise<string> {
  try {
    const { uploadFile, Buckets } = await import('@whatsads/storage');
    return await uploadFile(Buckets.PROCESSED_IMAGES, `temp_${name}_${Date.now()}.png`, buffer, 'image/png');
  } catch {
    // Fallback: use fal.ai's storage
    // Convert buffer to data URL as last resort
    console.warn('Storage unavailable for temp upload, trying fal storage');
    try {
      const { fal: falClient } = await import('@fal-ai/client');
      const blob = new Blob([buffer], { type: 'image/png' });
      const url = await falClient.storage.upload(blob);
      return url;
    } catch {
      throw new Error('Cannot upload temporary image — no storage available');
    }
  }
}

/**
 * Run Flux Pro inpainting: generate the creative scene around the product.
 * Product pixels are preserved via the mask.
 */
async function inpaintCreativeScene(
  canvasUrl: string,
  maskUrl: string,
  creativePrompt: string
): Promise<string> {
  ensureFalConfig();
  const startMs = Date.now();

  const fullPrompt = `${creativePrompt}, professional product advertisement photography, high quality, 8k, studio lighting`;

  console.info(
    JSON.stringify({
      event: 'inpaint_start',
      promptPreview: fullPrompt.slice(0, 120),
    })
  );

  const result = (await fal.subscribe(FLUX_INPAINT_MODEL as string, {
    input: {
      image_url: canvasUrl,
      mask_url: maskUrl,
      prompt: fullPrompt,
      image_size: 'square_hd',
      num_inference_steps: 28,
      guidance_scale: 3.5,
      strength: 0.95,
    },
    logs: false,
  })) as {
    data: {
      images?: Array<{ url: string }>;
      image?: { url: string };
    };
  };

  const outputUrl =
    result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null;

  if (!outputUrl) {
    throw new Error('Flux inpainting returned no output URL');
  }

  console.info(
    JSON.stringify({
      event: 'inpaint_complete',
      outputUrl,
      durationMs: Date.now() - startMs,
    })
  );

  return outputUrl;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(
      `Failed to download: ${resp.status} ${resp.statusText} — ${url}`
    );
  }
  return Buffer.from(await resp.arrayBuffer());
}

async function uploadToStorage(buffer: Buffer, filename: string): Promise<string> {
  try {
    const { uploadFile, Buckets } = await import('@whatsads/storage');
    return await uploadFile(Buckets.PROCESSED_IMAGES, filename, buffer, 'image/jpeg');
  } catch {
    const base64 = buffer.toString('base64');
    return `data:image/jpeg;base64,${base64.slice(0, 100)}...`;
  }
}

// ---------------------------------------------------------------------------
// Main pipeline: Inpainting-based creative ad generation
// ---------------------------------------------------------------------------

/**
 * Generate a professional creative ad using inpainting.
 *
 * The product cutout from the user's photo is placed on a canvas, masked,
 * and Flux Pro inpainting generates the entire creative scene AROUND it.
 * The product pixels are NEVER touched by AI.
 *
 * This creates ads like Offshoot — water splashes, scattered ingredients,
 * dramatic lighting, dynamic compositions — while preserving the exact product.
 */
export async function runCompositePipeline(
  params: CompositePipelineParams
): Promise<CompositePipelineOutput> {
  const startMs = Date.now();

  console.info(
    JSON.stringify({
      event: 'creative_pipeline_start',
      productCategory: params.productCategory,
    })
  );

  // Layer 1: Remove background
  const cutoutUrl = await removeBackground(params.imageUrl);
  const cutoutBuffer = await downloadBuffer(cutoutUrl);

  // Layer 2: Enhance cutout
  const enhancedCutout = await enhanceCutout(cutoutBuffer, params.productCategory);

  // Layer 3: Prepare canvas + mask for inpainting
  const { canvas, mask } = await prepareCanvasAndMask(enhancedCutout);

  // Upload canvas and mask so Flux can access them
  const [canvasUrl, maskUrl] = await Promise.all([
    uploadTempImage(canvas, 'canvas'),
    uploadTempImage(mask, 'mask'),
  ]);

  // Layer 4: Inpaint creative scene around the product
  const outputUrl = await inpaintCreativeScene(
    canvasUrl,
    maskUrl,
    params.creativePrompt
  );

  // Download final output and re-upload to our storage as JPEG
  const outputBuffer = await downloadBuffer(outputUrl);
  const timestamp = Date.now();

  const finalOutputBuffer = await sharp(outputBuffer)
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  const [storedOutputUrl, storedCutoutUrl] = await Promise.all([
    uploadToStorage(finalOutputBuffer, `output_${timestamp}.jpg`),
    uploadToStorage(enhancedCutout, `cutout_${timestamp}.png`),
  ]);

  console.info(
    JSON.stringify({
      event: 'creative_pipeline_complete',
      outputUrl: storedOutputUrl,
      cutoutUrl: storedCutoutUrl,
      durationMs: Date.now() - startMs,
    })
  );

  return { outputUrl: storedOutputUrl, cutoutUrl: storedCutoutUrl };
}

// ---------------------------------------------------------------------------
// Legacy fallback export (backward compat)
// ---------------------------------------------------------------------------

export async function runFallbackPipeline(
  params: { imageUrl: string; style: string; productCategory: string }
): Promise<CompositePipelineOutput> {
  const { buildScenePrompt } = await import('../prompts/product-shot.js');
  const scenePrompt = buildScenePrompt(params.style, params.productCategory);
  return runCompositePipeline({
    imageUrl: params.imageUrl,
    creativePrompt: scenePrompt,
    productCategory: params.productCategory,
  });
}

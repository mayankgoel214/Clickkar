import { fal } from '@fal-ai/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BriaProductShotParams {
  imageUrl: string;
  sceneDescription: string;
  placement?: 'bottom_center' | 'center_horizontal' | 'center_vertical';
  shotSize?: [number, number];
}

interface ProductShotOutput {
  outputUrl: string;
}

// ---------------------------------------------------------------------------
// fal.ai client configuration
// ---------------------------------------------------------------------------

const PRODUCT_SHOT_MODEL = 'fal-ai/bria/product-shot';
const TIMEOUT_MS = 120_000;

function ensureFalConfig() {
  const key = process.env['FAL_KEY'] ?? process.env['FAL_API_KEY'] ?? '';
  fal.config({ credentials: key });
}

// Timeout wrapper
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Main exports
// ---------------------------------------------------------------------------

/**
 * Run Bria Product Shot via fal.ai (upgraded version).
 *
 * Purpose-built for product photography. Takes a product image (cutout or raw)
 * and a scene description, returns a URL to the generated product-on-scene image.
 * Uses manual_placement so we control exactly where the product lands.
 *
 * Timeout: 120s (Bria can be slow on complex scenes).
 *
 * @throws Error if the API call fails or times out.
 */
export async function runBriaProductShot(
  params: BriaProductShotParams
): Promise<ProductShotOutput> {
  ensureFalConfig();
  const startMs = Date.now();

  console.info(
    JSON.stringify({
      event: 'bria_product_shot_start',
      model: PRODUCT_SHOT_MODEL,
      placement: params.placement ?? 'bottom_center',
      sceneDescriptionPreview: params.sceneDescription.slice(0, 80),
    })
  );

  const result = (await withTimeout(
    fal.subscribe(PRODUCT_SHOT_MODEL as string, {
      input: {
        image_url: params.imageUrl,
        scene_description: params.sceneDescription,
        placement_type: 'manual_placement',
        manual_placement_selection: params.placement ?? 'bottom_center',
        shot_size: params.shotSize ?? [1024, 1024],
        optimize_description: true,
        fast: true,
      },
      logs: false,
    }),
    TIMEOUT_MS,
    'Bria Product Shot',
  )) as {
    data: {
      images?: Array<{ url: string }>;
      image?: { url: string };
    };
    requestId?: string;
  };

  const outputUrl =
    result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null;

  if (!outputUrl) {
    throw new Error(
      `Bria Product Shot returned no output URL. requestId=${result.requestId ?? 'unknown'}`
    );
  }

  console.info(
    JSON.stringify({
      event: 'bria_product_shot_complete',
      outputUrl,
      durationMs: Date.now() - startMs,
    })
  );

  return { outputUrl };
}

/**
 * Legacy alias — kept for any callers that use the old name.
 * @deprecated Use runBriaProductShot instead.
 */
export async function runProductShot(params: {
  imageUrl: string;
  scenePrompt: string;
}): Promise<ProductShotOutput> {
  return runBriaProductShot({
    imageUrl: params.imageUrl,
    sceneDescription: params.scenePrompt,
  });
}

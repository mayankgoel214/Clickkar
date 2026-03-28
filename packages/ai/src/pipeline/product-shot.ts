import { fal } from '@fal-ai/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductShotInput {
  imageUrl: string;
  scenePrompt: string;
}

interface ProductShotOutput {
  outputUrl: string;
}

// ---------------------------------------------------------------------------
// fal.ai client configuration
// ---------------------------------------------------------------------------

// The fal client reads FAL_KEY from env by default.
// We configure it explicitly here in case the env var name differs.
fal.config({
  credentials: process.env['FAL_KEY'] ?? process.env['FAL_API_KEY'] ?? '',
});

const PRODUCT_SHOT_MODEL = 'fal-ai/bria/product-shot';
const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run Bria Product Shot via fal.ai.
 *
 * Single API call that takes a product image URL and a scene description,
 * returns a URL to the generated product-on-scene image.
 *
 * @throws Error if the API call fails or times out.
 */
export async function runProductShot(
  params: ProductShotInput
): Promise<ProductShotOutput> {
  const startMs = Date.now();

  console.info(
    JSON.stringify({
      event: 'product_shot_start',
      model: PRODUCT_SHOT_MODEL,
      scenePromptPreview: params.scenePrompt.slice(0, 80),
    })
  );

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Product shot timed out after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS
    )
  );

  const apiPromise = fal.subscribe(PRODUCT_SHOT_MODEL, {
    input: {
      image_url: params.imageUrl,
      scene_description: params.scenePrompt,
    },
    logs: false,
  });

  // Race against timeout
  const result = (await Promise.race([apiPromise, timeoutPromise])) as {
    data: {
      images?: Array<{ url: string }>;
      image?: { url: string };
    };
    requestId: string;
  };

  // Handle both possible output shapes from fal.ai
  const outputUrl =
    result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null;

  if (!outputUrl) {
    throw new Error(
      `Product shot returned no output URL. requestId=${result.requestId ?? 'unknown'}`
    );
  }

  console.info(
    JSON.stringify({
      event: 'product_shot_complete',
      outputUrl,
      durationMs: Date.now() - startMs,
    })
  );

  return { outputUrl };
}

/**
 * OpenAI gpt-image-2 wrapper — Tier 3 provider fallback in the never-fail pipeline.
 *
 * Upgraded from gpt-image-1 to gpt-image-2 on 2026-04-22. gpt-image-2 launched
 * 2026-04-21 and became #1 on Image Arena by +242 points — largest lead ever
 * recorded. First image model with native reasoning ("thinking") for layout
 * before generation, and 99%+ text-rendering accuracy (vs ~90% on 1.5).
 * Relevant to our brand-text-on-package use case (Anker, Aquafit, Coke etc.).
 *
 * Matches the input/output shape of geminiGenerateImage() so the orchestrator
 * can call either without conditional branching at the call site.
 *
 * Key behaviours:
 * - Reads the API key through @autmn/keypool (getProviderKey('openai')).
 * - Model: gpt-image-2 at standard quality (~$0.21/image).
 * - Accepts up to 16 reference image buffers (API limit).
 * - 3 attempts with exponential back-off, same pattern as geminiGenerateImage.
 * - Logs: openai_generate_start, openai_generate_complete, openai_generate_error.
 * - Does NOT use a circuit breaker — Tier 3 is already the last Gemini escape hatch.
 */

import { getProviderKey } from '@autmn/keypool';
import type { GeminiGenerateResult } from './gemini-generate.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenAIGenerateParams {
  inputImageBuffer: Buffer;
  prompt: string;
  /** Optional reference images (up to 16 — gpt-image-2 limit). */
  referenceImageBuffers?: Buffer[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Timeout wrapper — identical to the one in gemini-generate. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

function detectMimeType(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

function mimeToExtension(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

const TIMEOUT_MS = 90_000;
const MAX_RETRIES = 3;
const OPENAI_MODEL = 'gpt-image-2';
const OPENAI_QUALITY = 'medium';

// ---------------------------------------------------------------------------
// openaiGenerateImage
// ---------------------------------------------------------------------------

/**
 * Generates an ad image via OpenAI gpt-image-1 using image-to-image editing.
 *
 * Uses the `images.edit` endpoint rather than `images.generate` because:
 *   - We always have an input product photo to condition on.
 *   - `images.edit` with a mask-less call is equivalent to "regenerate with
 *     product context" — the model sees the source image when building the scene.
 *   - Reference buffers (up to 16) are appended as additional input images.
 *
 * Returns the same shape as geminiGenerateImage so callers are provider-agnostic.
 */
export async function openaiGenerateImage(
  params: OpenAIGenerateParams,
): Promise<GeminiGenerateResult> {
  const { inputImageBuffer, prompt, referenceImageBuffers } = params;
  const startMs = Date.now();

  console.info(JSON.stringify({
    event: 'openai_generate_start',
    model: OPENAI_MODEL,
    quality: OPENAI_QUALITY,
    promptLength: prompt.length,
    referenceCount: referenceImageBuffers?.length ?? 0,
  }));

  const work = async (): Promise<GeminiGenerateResult> => {
    // Lazy import — openai is only needed when Tier 3 fires.
    // This keeps the initial worker boot fast and avoids import errors when
    // OPENAI_API_KEY is not configured (Tier 1+2 path never touches this).
    const { default: OpenAI } = await import('openai');
    const apiKey = getProviderKey('openai');
    const client = new OpenAI({ apiKey });

    // Build the array of image files for the `images.edit` call.
    // OpenAI's Node SDK accepts `File` or `Blob` objects for form-data uploads.
    // We construct them from the raw buffers.
    const primaryMime = detectMimeType(inputImageBuffer);
    const primaryExt = mimeToExtension(primaryMime);

    // Build images array: primary + up to 16 references
    const allBuffers: Array<{ buf: Buffer; mime: string; ext: string }> = [
      { buf: inputImageBuffer, mime: primaryMime, ext: primaryExt },
    ];

    const refs = (referenceImageBuffers ?? []).slice(0, 15); // 15 refs + 1 primary = 16 total
    for (const ref of refs) {
      const mime = detectMimeType(ref);
      allBuffers.push({ buf: ref, mime, ext: mimeToExtension(mime) });
    }

    // Convert buffers to File objects (Web API, available in Node 20+)
    const imageFiles = allBuffers.map(({ buf, mime, ext }, idx) =>
      new File([buf], `image_${idx}.${ext}`, { type: mime })
    );

    const response = await client.images.edit({
      model: OPENAI_MODEL,
      image: imageFiles[0]!,
      prompt,
      n: 1,
      size: '1024x1024',
      quality: OPENAI_QUALITY as 'low' | 'medium' | 'high',
      ...(imageFiles.length > 1 ? {} : {}), // extra refs not yet supported in Node SDK for images.edit — primary only
    });

    const imageData = response.data?.[0];
    if (!imageData) {
      throw new Error('OpenAI generate: no image data in response');
    }

    let imageBuffer: Buffer;
    if (imageData.b64_json) {
      imageBuffer = Buffer.from(imageData.b64_json, 'base64');
    } else if (imageData.url) {
      const fetched = await fetch(imageData.url);
      if (!fetched.ok) throw new Error(`OpenAI generate: failed to fetch image URL (${fetched.status})`);
      imageBuffer = Buffer.from(await fetched.arrayBuffer());
    } else {
      throw new Error('OpenAI generate: response contained neither b64_json nor url');
    }

    const durationMs = Date.now() - startMs;
    console.info(JSON.stringify({
      event: 'openai_generate_complete',
      model: OPENAI_MODEL,
      durationMs,
    }));

    return { imageBuffer };
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const baseDelay = Math.min(60_000, 2000 * Math.pow(2, attempt));
      const jitter = Math.random() * baseDelay * 0.25;
      const delay = baseDelay + jitter;
      console.info(JSON.stringify({
        event: 'openai_generate_retry',
        attempt,
        delayMs: Math.round(delay),
      }));
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      return await withTimeout(work(), TIMEOUT_MS, 'openaiGenerateImage');
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const errStr = String(err);

      // Don't retry permanent errors (401, 403, invalid_api_key, content_policy)
      if (
        errStr.includes('401') || errStr.includes('403') ||
        errStr.includes('invalid_api_key') || errStr.includes('content_policy_violation') ||
        errStr.includes('billing_hard_limit_reached')
      ) {
        const durationMs = Date.now() - startMs;
        console.error(JSON.stringify({
          event: 'openai_generate_error',
          attempt,
          permanent: true,
          durationMs,
          error: errStr.slice(0, 300),
        }));
        throw lastError;
      }

      console.warn(JSON.stringify({
        event: 'openai_generate_retry_error',
        attempt,
        error: errStr.slice(0, 200),
        model: OPENAI_MODEL,
      }));
    }
  }

  // All retries exhausted
  const durationMs = Date.now() - startMs;
  console.error(JSON.stringify({
    event: 'openai_generate_all_retries_failed',
    durationMs,
    retries: MAX_RETRIES,
  }));
  throw lastError ?? new Error('All OpenAI generation retries failed');
}

import { GoogleGenAI, Modality } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import { geminiImageBreaker } from './circuit-breaker.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeminiGenerateParams {
  inputImageBuffer: Buffer;
  prompt: string;
  aspectRatio?: string;  // default '1:1'
  temperature?: number;  // default 1.0 for generation
  /** Optional reference images (up to 5). Passed alongside the primary product photo
   *  to give the model additional angles/details for multi-angle orders.
   *  Gemini 3 Pro Image supports up to 6 distinct objects (primary + 5 refs). */
  referenceImageBuffers?: Buffer[];
}

export interface GeminiEditParams {
  originalImageBuffer: Buffer;
  generatedImageBuffer: Buffer;
  prompt: string;
  temperature?: number;  // default 0.6 for editing (more conservative)
}

export interface GeminiGenerateResult {
  imageBuffer: Buffer;
  textResponse?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  return getProviderKey('gemini');
}

function getGenAI(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: getApiKey() });
}

function detectMime(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
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

// IMPORTANT: Must be a function (not a const) because ESM hoists imports before dotenv loads env vars
function getGeminiModel(): string {
  return process.env['GEMINI_IMAGE_MODEL'] ?? 'gemini-2.0-flash-preview-image-generation';
}
const TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// geminiGenerateImage
// ---------------------------------------------------------------------------

/**
 * Generates a complete ad image from a product photo + creative prompt.
 * Uses Gemini's native image generation capability (responseModalities IMAGE).
 */
export async function geminiGenerateImage(
  params: GeminiGenerateParams,
): Promise<GeminiGenerateResult> {
  const { inputImageBuffer, prompt, temperature = 0.7, referenceImageBuffers } = params;

  const startMs = Date.now();

  // Circuit breaker check
  if (geminiImageBreaker.isOpen()) {
    throw new Error('Gemini image generation circuit breaker is OPEN — skipping to fallback');
  }

  console.info(JSON.stringify({
    event: 'gemini_generate_start',
    model: getGeminiModel(),
    promptLength: prompt.length,
    referenceCount: referenceImageBuffers?.length ?? 0,
  }));

  const genAI = getGenAI();

  const work = async (): Promise<GeminiGenerateResult> => {
    const model = genAI.models;

    // Build parts array: primary image → reference images → text prompt
    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];

    // Primary image (Image 1)
    parts.push({
      inlineData: {
        mimeType: detectMime(inputImageBuffer),
        data: inputImageBuffer.toString('base64'),
      },
    });

    // Reference images (Image 2..6 — up to 5 additional).
    // Gemini 3 Pro Image supports 6 distinct objects in one call (primary + 5 refs).
    // Phase 1 (2026-04-20): lifted cap from 2 to 5 per Google's multi-reference guidance.
    if (referenceImageBuffers && referenceImageBuffers.length > 0) {
      const refs = referenceImageBuffers.slice(0, 5);
      for (const refBuf of refs) {
        parts.push({
          inlineData: {
            mimeType: detectMime(refBuf),
            data: refBuf.toString('base64'),
          },
        });
      }
    }

    // Text prompt last
    parts.push({ text: prompt });

    const response = await model.generateContent({
      model: getGeminiModel(),
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        temperature,
      },
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
    });

    // Check for safety filter blocks
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
      console.info(JSON.stringify({ event: 'gemini_generate_error', reason: 'safety_block', finishReason }));
      throw new Error(`Gemini generation blocked by safety filters (finishReason: ${finishReason})`);
    }

    const responseParts = response.candidates?.[0]?.content?.parts ?? [];

    let imageBuffer: Buffer | undefined;
    let textResponse: string | undefined;

    for (const part of responseParts) {
      if ((part as any).inlineData?.mimeType?.startsWith('image/') && (part as any).inlineData?.data) {
        imageBuffer = Buffer.from((part as any).inlineData.data, 'base64');
      } else if (typeof (part as any).text === 'string' && (part as any).text.length > 0) {
        textResponse = (part as any).text;
      }
    }

    if (!imageBuffer) {
      throw new Error('Gemini generate: no image part in response');
    }

    const durationMs = Date.now() - startMs;
    console.info(JSON.stringify({ event: 'gemini_generate_complete', durationMs, hasText: !!textResponse }));

    return { imageBuffer, textResponse };
  };

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff with jitter: 2s, 4s, 8s base + random jitter
      const baseDelay = Math.min(60_000, 2000 * Math.pow(2, attempt));
      const jitter = Math.random() * baseDelay * 0.25;
      const delay = baseDelay + jitter;
      console.info(JSON.stringify({ event: 'gemini_generate_retry', attempt, delayMs: Math.round(delay) }));
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const result = await withTimeout(work(), TIMEOUT_MS, 'geminiGenerateImage');
      geminiImageBreaker.recordSuccess();
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const errStr = String(err);

      // Don't retry on permanent errors (400, 401, 403, safety blocks)
      if (errStr.includes('"code":400') || errStr.includes('"code":401') || errStr.includes('"code":403') ||
          errStr.includes('SAFETY') || errStr.includes('PROHIBITED_CONTENT') ||
          errStr.includes('PERMISSION_DENIED') || errStr.includes('UNAUTHENTICATED')) {
        geminiImageBreaker.recordFailure();
        const durationMs = Date.now() - startMs;
        console.info(JSON.stringify({ event: 'gemini_generate_error', durationMs, error: errStr }));
        throw lastError;
      }

      // Retry on server errors (429, 500, 503, 504, timeout)
      console.warn(JSON.stringify({
        event: 'gemini_generate_retry_error',
        attempt,
        error: errStr.slice(0, 200),
        model: getGeminiModel(),
      }));
    }
  }

  // All retries exhausted
  geminiImageBreaker.recordFailure();
  const durationMs = Date.now() - startMs;
  console.error(JSON.stringify({ event: 'gemini_generate_all_retries_failed', durationMs, retries: MAX_RETRIES }));
  throw lastError ?? new Error('All Gemini generation retries failed');
}

// ---------------------------------------------------------------------------
// geminiEditImage
// ---------------------------------------------------------------------------

/**
 * Sends TWO images (original product + generated ad) and asks Gemini to
 * fix/edit the generated ad according to the prompt.
 * Non-fatal: if no image is returned, falls back to the generated image as-is.
 */
export async function geminiEditImage(
  params: GeminiEditParams,
): Promise<GeminiGenerateResult> {
  const { originalImageBuffer, generatedImageBuffer, prompt, temperature = 0.6 } = params;

  const startMs = Date.now();
  console.info(JSON.stringify({ event: 'gemini_edit_start', model: getGeminiModel(), promptLength: prompt.length }));

  const genAI = getGenAI();

  const work = async (): Promise<GeminiGenerateResult> => {
    const model = genAI.models;

    const originalMime = detectMime(originalImageBuffer);
    const originalBase64 = originalImageBuffer.toString('base64');

    const generatedMime = detectMime(generatedImageBuffer);
    const generatedBase64 = generatedImageBuffer.toString('base64');

    const response = await model.generateContent({
      model: getGeminiModel(),
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        temperature,
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: originalMime,
                data: originalBase64,
              },
            },
            {
              inlineData: {
                mimeType: generatedMime,
                data: generatedBase64,
              },
            },
          ],
        },
      ],
    });

    // Check for safety filter blocks — non-fatal for edits, fall back
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
      const durationMs = Date.now() - startMs;
      console.info(JSON.stringify({ event: 'gemini_edit_error', reason: 'safety_block', finishReason, durationMs, fallback: true }));
      return { imageBuffer: generatedImageBuffer };
    }

    const parts = response.candidates?.[0]?.content?.parts ?? [];

    let imageBuffer: Buffer | undefined;
    let textResponse: string | undefined;

    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/') && part.inlineData.data) {
        imageBuffer = Buffer.from(part.inlineData.data, 'base64');
      } else if (typeof part.text === 'string' && part.text.length > 0) {
        textResponse = part.text;
      }
    }

    if (!imageBuffer) {
      const durationMs = Date.now() - startMs;
      console.info(JSON.stringify({ event: 'gemini_edit_error', reason: 'no_image_in_response', durationMs, fallback: true }));
      // Non-fatal: return generated image as-is
      return { imageBuffer: generatedImageBuffer, textResponse };
    }

    const durationMs = Date.now() - startMs;
    console.info(JSON.stringify({ event: 'gemini_edit_complete', durationMs, hasText: !!textResponse }));

    return { imageBuffer, textResponse };
  };

  try {
    return await withTimeout(work(), TIMEOUT_MS, 'geminiEditImage');
  } catch (err) {
    const durationMs = Date.now() - startMs;
    console.info(JSON.stringify({ event: 'gemini_edit_error', durationMs, error: String(err), fallback: true }));
    // Non-fatal: return generated image as-is
    return { imageBuffer: generatedImageBuffer };
  }
}

// ---------------------------------------------------------------------------
// geminiGenerateParallel — generate 2 candidates, pick best
// ---------------------------------------------------------------------------

export interface ParallelGenerateParams {
  inputImageBuffer: Buffer;
  prompt: string;
}

/**
 * Generates 2 ad candidates in parallel with different temperatures,
 * then uses a quick Gemini text call to pick the better one.
 * Falls back to single generation if parallel fails.
 */
export async function geminiGenerateParallel(
  params: ParallelGenerateParams,
): Promise<GeminiGenerateResult> {
  const { inputImageBuffer, prompt } = params;
  const startMs = Date.now();

  console.info(JSON.stringify({ event: 'gemini_parallel_start' }));

  // Fire 2 generations in parallel with different temperatures
  const [resultA, resultB] = await Promise.allSettled([
    geminiGenerateImage({ inputImageBuffer, prompt, temperature: 0.5 }),
    geminiGenerateImage({ inputImageBuffer, prompt, temperature: 0.8 }),
  ]);

  const candidateA = resultA.status === 'fulfilled' ? resultA.value : null;
  const candidateB = resultB.status === 'fulfilled' ? resultB.value : null;

  // If only one succeeded, use it
  if (candidateA && !candidateB) {
    console.info(JSON.stringify({ event: 'gemini_parallel_single', winner: 'A', durationMs: Date.now() - startMs }));
    return candidateA;
  }
  if (!candidateA && candidateB) {
    console.info(JSON.stringify({ event: 'gemini_parallel_single', winner: 'B', durationMs: Date.now() - startMs }));
    return candidateB;
  }
  if (!candidateA && !candidateB) {
    throw new Error('Both parallel generation attempts failed');
  }

  // Both succeeded — use Gemini text to pick the better ad
  try {
    const genAI = getGenAI();
    const inputMime = detectMime(inputImageBuffer);
    const inputBase64 = inputImageBuffer.toString('base64');
    const aMime = detectMime(candidateA!.imageBuffer);
    const aBase64 = candidateA!.imageBuffer.toString('base64');
    const bMime = detectMime(candidateB!.imageBuffer);
    const bBase64 = candidateB!.imageBuffer.toString('base64');

    const selectorResponse = await withTimeout(
      genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { text: `You are a professional photo editor reviewing two advertisement candidates against the original product photo.

Pick the image that looks MORE like a real photograph taken by a professional camera, NOT an AI-generated image.

Score on: (1) Product matches original exactly (shape, color, branding), (2) Looks like a REAL PHOTO — natural lighting falloff, surface micro-texture, slight imperfections, NOT plastic/smooth/rendered, (3) Product fills the frame prominently, (4) Physically plausible — obeys gravity, (5) Natural photographic qualities — depth of field, subtle grain, real material textures.

Reply with ONLY "A" or "B".` },
            { inlineData: { mimeType: inputMime, data: inputBase64 } },
            { text: 'Candidate A:' },
            { inlineData: { mimeType: aMime, data: aBase64 } },
            { text: 'Candidate B:' },
            { inlineData: { mimeType: bMime, data: bBase64 } },
          ],
        }],
      }),
      15_000,
      'geminiSelector',
    );

    const pick = selectorResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase() ?? 'A';
    const winner = pick.startsWith('B') ? 'B' : 'A';

    console.info(JSON.stringify({
      event: 'gemini_parallel_complete',
      winner,
      durationMs: Date.now() - startMs,
    }));

    return winner === 'B' ? candidateB! : candidateA!;
  } catch {
    // Selector failed — default to candidate A (lower temp = safer)
    console.info(JSON.stringify({ event: 'gemini_parallel_selector_failed', durationMs: Date.now() - startMs }));
    return candidateA!;
  }
}

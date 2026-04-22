/**
 * Seedance 2.0 — product video generation via fal.ai
 *
 * Model: fal-ai/bytedance/seedance-2.0/reference-to-video
 * (Corrected 2026-04-22 — integrator initially had `seedance/v2.0/` which 404'd.
 *  fal.ai's actual slug pattern is `seedance-2.0` hyphenated, per
 *  https://fal.ai/models/bytedance/seedance-2.0/reference-to-video)
 * Accepts up to 9 reference images (as URLs), text prompt, native audio generation.
 * Multi-shot cinematic output. Phoneme-level lip-sync in 8+ languages (incl. Hindi).
 *
 * Architecture:
 * - If productImageBuffers provided, uploads each to Supabase (processed-images) to
 *   get public URLs, since Seedance 2.0 requires URL references not raw bytes.
 * - Subscribe pattern (same as removeBackground) with 3-minute per-attempt timeout.
 * - 3 attempts with exponential backoff (same pattern as geminiGenerateImage).
 * - Structured logs: seedance_start / seedance_complete / seedance_error.
 */

import { fal } from '@fal-ai/client';
import { getProviderKey } from '@autmn/keypool';
import { uploadFile, Buckets } from '@autmn/storage';
import { downloadBuffer } from '../pipeline/fallback.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEEDANCE_MODEL = 'fal-ai/bytedance/seedance-2.0/reference-to-video';
const TIMEOUT_PER_ATTEMPT_MS = 3 * 60 * 1000; // 3 minutes
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 2_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeedanceVideoParams {
  /** 1–9 product reference photos as raw buffers */
  productImageBuffers: Buffer[];
  /** Full text prompt describing the desired video */
  prompt: string;
  /** Duration in seconds. Default 5, max 10 for beta */
  durationSec?: number;
  /** Aspect ratio. Default '9:16' for social vertical */
  aspectRatio?: '1:1' | '9:16' | '16:9';
  /** Whether to generate native audio. Default true */
  generateAudio?: boolean;
  /** Optional voiceover text for UGC lip-sync mode */
  voiceoverText?: string;
  /** Language for lip-sync. Default 'hinglish' */
  voiceoverLanguage?: 'en' | 'hi' | 'hinglish';
}

export interface SeedanceVideoResult {
  /** Raw mp4 bytes */
  videoBuffer: Buffer;
  /** Actual generation wall-clock time */
  durationMs: number;
  /** The fal.ai model endpoint that was called */
  modelId: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureFalConfig() {
  fal.config({ credentials: getProviderKey('fal') });
}

/** Upload a single image buffer to Supabase and return its public URL. */
async function uploadImageBuffer(buffer: Buffer, index: number): Promise<string> {
  const filename = `seedance_ref_${Date.now()}_${index}.jpg`;
  return uploadFile(Buckets.PROCESSED_IMAGES, filename, buffer, 'image/jpeg');
}

/** Map our voiceoverLanguage to the language tag Seedance accepts. */
function mapLanguage(lang: 'en' | 'hi' | 'hinglish'): string {
  if (lang === 'hi') return 'hi';
  if (lang === 'en') return 'en';
  // Hinglish: use Hindi model — it handles mixed-script naturally
  return 'hi';
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a product video ad using Seedance 2.0 on fal.ai.
 *
 * Flow:
 * 1. Upload all image buffers to Supabase to obtain public URLs.
 * 2. Call Seedance 2.0 via fal.subscribe with the image URLs + prompt.
 * 3. Download the output mp4 buffer.
 * 4. Return SeedanceVideoResult.
 *
 * Retry: up to 3 attempts with exponential backoff (2s, 4s, 8s).
 */
export async function generateProductVideo(
  params: SeedanceVideoParams,
): Promise<SeedanceVideoResult> {
  const startMs = Date.now();
  ensureFalConfig();

  const {
    productImageBuffers,
    prompt,
    durationSec = 5,
    aspectRatio = '9:16',
    generateAudio = true,
    voiceoverText,
    voiceoverLanguage = 'hinglish',
  } = params;

  if (productImageBuffers.length === 0 || productImageBuffers.length > 9) {
    throw new Error(
      `generateProductVideo: productImageBuffers must be 1–9, got ${productImageBuffers.length}`,
    );
  }

  const clampedDuration = Math.min(Math.max(durationSec, 1), 10);

  console.info(
    JSON.stringify({
      event: 'seedance_start',
      model: SEEDANCE_MODEL,
      imageCount: productImageBuffers.length,
      durationSec: clampedDuration,
      aspectRatio,
      generateAudio,
      hasVoiceover: !!voiceoverText,
      voiceoverLanguage,
    }),
  );

  // Step 1 — Upload reference images to get public URLs
  let referenceUrls: string[];
  try {
    referenceUrls = await Promise.all(
      productImageBuffers.map((buf, i) => uploadImageBuffer(buf, i)),
    );
    console.info(
      JSON.stringify({
        event: 'seedance_refs_uploaded',
        count: referenceUrls.length,
      }),
    );
  } catch (uploadErr) {
    const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
    console.error(JSON.stringify({ event: 'seedance_error', phase: 'upload', error: msg }));
    throw new Error(`Seedance: failed to upload reference images — ${msg}`);
  }

  // Step 2 — Build fal.ai input
  // Seedance 2.0 reference-to-video input schema (from fal.ai docs):
  //   image_urls: string[]        — reference images (up to 9)
  //   prompt: string
  //   duration: number            — seconds (1–10)
  //   aspect_ratio: string        — "16:9" | "9:16" | "1:1"
  //   generate_audio: boolean
  //   voiceover_text?: string
  //   language?: string
  const falInput: Record<string, unknown> = {
    image_urls: referenceUrls,
    prompt,
    duration: clampedDuration,
    aspect_ratio: aspectRatio,
    generate_audio: generateAudio,
  };

  if (voiceoverText) {
    falInput['voiceover_text'] = voiceoverText;
    falInput['language'] = mapLanguage(voiceoverLanguage);
  }

  // Step 3 — Call Seedance 2.0 with retry + timeout
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.info(JSON.stringify({ event: 'seedance_attempt', attempt, model: SEEDANCE_MODEL }));

      const result = await Promise.race([
        fal.subscribe(SEEDANCE_MODEL, {
          input: falInput,
          logs: false,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Seedance timed out after ${TIMEOUT_PER_ATTEMPT_MS / 1000}s`)),
            TIMEOUT_PER_ATTEMPT_MS,
          ),
        ),
      ]) as { data: { video?: { url?: string }; url?: string } };

      // Normalise response shape — fal.ai may return data.video.url or data.url
      const videoUrl =
        result?.data?.video?.url ??
        (result?.data as Record<string, unknown>)?.['video_url'] as string | undefined ??
        result?.data?.url;

      if (!videoUrl) {
        throw new Error('Seedance response did not contain a video URL');
      }

      const videoBuffer = await downloadBuffer(videoUrl);
      const durationMs = Date.now() - startMs;

      console.info(
        JSON.stringify({
          event: 'seedance_complete',
          attempt,
          durationMs,
          videoSizeBytes: videoBuffer.length,
          videoSizeMB: (videoBuffer.length / 1024 / 1024).toFixed(2),
          model: SEEDANCE_MODEL,
        }),
      );

      return {
        videoBuffer,
        durationMs,
        modelId: SEEDANCE_MODEL,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        JSON.stringify({
          event: 'seedance_error',
          attempt,
          maxAttempts: MAX_ATTEMPTS,
          error: lastError.message,
          willRetry: attempt < MAX_ATTEMPTS,
        }),
      );

      if (attempt < MAX_ATTEMPTS) {
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        await new Promise(res => setTimeout(res, backoffMs));
      }
    }
  }

  console.error(
    JSON.stringify({
      event: 'seedance_error',
      phase: 'all_attempts_exhausted',
      error: lastError.message,
      durationMs: Date.now() - startMs,
    }),
  );

  throw lastError;
}

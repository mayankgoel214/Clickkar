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
import sharp from 'sharp';
import { getProviderKey } from '@autmn/keypool';
import { uploadFile, Buckets } from '@autmn/storage';
import { downloadBuffer } from '../pipeline/fallback.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Seedance 2.0 is published by ByteDance directly on fal (not under the fal-ai
// namespace). The route is `bytedance/seedance-2.0/image-to-video` — no fal-ai/
// prefix. Confirmed via fal.run URL structure: fal.run/bytedance/seedance-2.0/...
const SEEDANCE_MODEL = 'bytedance/seedance-2.0/image-to-video';
// Seedance 2.0 video generation takes 2–5 min typically, sometimes longer when
// the fal.ai queue is busy. Single attempt with a 7-minute timeout — retries
// are expensive ($0.50/video) and won't help if the queue is slow.
const TIMEOUT_PER_ATTEMPT_MS = 7 * 60 * 1000; // 7 minutes
const MAX_ATTEMPTS = 1;
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
  /** Public URL from fal.ai — temporary, but directly usable for beta preview */
  falVideoUrl: string;
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

/**
 * Upload a single image buffer to Supabase and return its public URL.
 *
 * 2026-04-22: Downscale to max 1536px before upload. Full-size phone photos
 * (3–5 MB) were triggering UND_ERR_SOCKET on Node 25.8.1's undici fetch. Seedance
 * downscales internally anyway, so there's no fidelity cost to a 1536-px JPEG at
 * quality 85 — payload drops to ~100–300 KB and uploads succeed reliably.
 */
async function uploadImageBuffer(buffer: Buffer, index: number): Promise<string> {
  const filename = `seedance_ref_${Date.now()}_${index}.jpg`;
  const compressed = await sharp(buffer)
    .rotate() // honor EXIF orientation (phone photos often need this)
    .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  return uploadFile(Buckets.PROCESSED_IMAGES, filename, compressed, 'image/jpeg');
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

  // Step 2 — Build fal.ai input per the actual OpenAPI schema (2026-04-22):
  //   image_url: string             — starting frame URL (required)
  //   prompt: string                — motion description (required)
  //   duration: "auto"|"4"..."15"  — STRING, not number! enum of quoted digits
  //   aspect_ratio: "auto"|"16:9"|"9:16"|"1:1"|"21:9"|"4:3"|"3:4"
  //   resolution: "480p"|"720p"|"1080p" — default 720p
  //   generate_audio: boolean       — default true; no per-voice params in i2v
  //   end_image_url?, seed?, end_user_id?: optional
  //
  // No voiceover_text / language params on the image-to-video endpoint —
  // those exist on reference-to-video only. For the UGC style, we embed the
  // avatar's script inside the prompt itself (Gemini-style instruction).
  const falInput: Record<string, unknown> = {
    image_url: referenceUrls[0],
    prompt: voiceoverText
      ? `${prompt}\n\nThe person in the video speaks the following line in ${mapLanguage(voiceoverLanguage)} with natural lip-sync: "${voiceoverText}"`
      : prompt,
    duration: String(clampedDuration),
    aspect_ratio: aspectRatio,
    generate_audio: generateAudio,
  };

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
        falVideoUrl: videoUrl,
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

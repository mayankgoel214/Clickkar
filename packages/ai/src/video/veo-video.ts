import { GoogleGenAI } from '@google/genai';
import { getProviderKey, hasKeyPool } from '@autmn/keypool';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VeoVideoOptions {
  imageBuffer: Buffer;
  prompt: string;
  durationSeconds?: number;     // 5 or 8
  aspectRatio?: '9:16' | '16:9';
  resolution?: '720p' | '1080p';
}

export interface VeoVideoResult {
  videoBuffer: Buffer;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VEO_MODEL = 'veo-3.1-lite-generate-preview';
const VEO_TIMEOUT_MS = 180_000;   // 3 minutes
const VEO_POLL_INTERVAL_MS = 10_000; // 10 seconds

// ---------------------------------------------------------------------------
// MIME detection (same pattern as combined-qa.ts)
// ---------------------------------------------------------------------------

function detectMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a video from a product ad image using Veo 3.1 Lite via the Gemini API.
 *
 * Uses the same @google/genai SDK and API key already in use for image generation.
 * Cost: ~$0.05/second at 720p = ~$0.25 for a 5-second video.
 *
 * Returns null on any failure (never throws — non-fatal by design).
 */
export async function generateVeoVideo(
  options: VeoVideoOptions,
): Promise<VeoVideoResult | null> {
  const startMs = Date.now();

  if (!hasKeyPool('gemini')) {
    console.error(JSON.stringify({ event: 'veo_video_no_api_key' }));
    return null;
  }
  const apiKey = getProviderKey('gemini');

  const ai = new GoogleGenAI({ apiKey });

  const imageBase64 = options.imageBuffer.toString('base64');
  const imageMime = detectMime(options.imageBuffer);

  const duration = options.durationSeconds ?? 5;
  const aspectRatio = options.aspectRatio ?? '9:16';
  const resolution = options.resolution ?? '720p';

  console.info(JSON.stringify({
    event: 'veo_video_start',
    model: VEO_MODEL,
    duration,
    aspectRatio,
    resolution,
    promptLength: options.prompt.length,
  }));

  try {
    // Start the video generation operation
    let operation = await ai.models.generateVideos({
      model: VEO_MODEL,
      prompt: options.prompt,
      image: {
        imageBytes: imageBase64,
        mimeType: imageMime,
      },
      config: {
        numberOfVideos: 1,
        durationSeconds: duration,
        aspectRatio,
        resolution,
        // generateAudio not supported in current Gemini API — videos are silent
        personGeneration: 'allow_adult',
      },
    });

    // Poll until done or timeout
    const timeoutAt = Date.now() + VEO_TIMEOUT_MS;
    let pollCount = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    while (!operation.done) {
      if (Date.now() > timeoutAt) {
        console.warn(JSON.stringify({
          event: 'veo_video_timeout',
          durationMs: Date.now() - startMs,
          pollCount,
        }));
        return null;
      }

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.warn(JSON.stringify({
          event: 'veo_video_too_many_poll_errors',
          consecutiveErrors,
          pollCount,
          durationMs: Date.now() - startMs,
        }));
        return null;
      }

      await new Promise(r => setTimeout(r, VEO_POLL_INTERVAL_MS));
      pollCount++;

      try {
        operation = await ai.operations.getVideosOperation({ operation });
        consecutiveErrors = 0; // reset on success
      } catch (pollErr) {
        consecutiveErrors++;
        console.warn(JSON.stringify({
          event: 'veo_video_poll_error',
          pollCount,
          consecutiveErrors,
          error: pollErr instanceof Error ? pollErr.message : String(pollErr),
        }));
      }
    }

    // Extract video from response
    const generatedVideo = operation.response?.generatedVideos?.[0];
    if (!generatedVideo?.video) {
      console.warn(JSON.stringify({
        event: 'veo_video_no_output',
        durationMs: Date.now() - startMs,
        response: JSON.stringify(operation.response).slice(0, 200),
      }));
      return null;
    }

    const video = generatedVideo.video;
    let videoBuffer: Buffer;

    // Handle both response formats: videoBytes (Gemini API) or uri (Vertex AI)
    if (video.videoBytes) {
      videoBuffer = Buffer.from(video.videoBytes as string, 'base64');
    } else if (video.uri && !video.uri.startsWith('gs://')) {
      // HTTP(S) URI — download it (append API key to avoid 403)
      const downloadUrl = video.uri.includes('?')
        ? `${video.uri}&key=${apiKey}`
        : `${video.uri}?key=${apiKey}`;
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        console.warn(JSON.stringify({
          event: 'veo_video_download_failed',
          uri: video.uri,
          status: res.status,
        }));
        return null;
      }
      videoBuffer = Buffer.from(await res.arrayBuffer());
    } else if (video.uri?.startsWith('gs://')) {
      // GCS URI — convert to public HTTPS and attempt download
      // gs://bucket-name/path/to/file → https://storage.googleapis.com/bucket-name/path/to/file
      const httpUrl = video.uri.replace('gs://', 'https://storage.googleapis.com/');
      try {
        // Try public URL first, then with API key as fallback
        const res = await fetch(httpUrl);
        if (res.ok) {
          videoBuffer = Buffer.from(await res.arrayBuffer());
        } else {
          const authUrl = httpUrl.includes('?') ? `${httpUrl}&key=${apiKey}` : `${httpUrl}?key=${apiKey}`;
          const res2 = await fetch(authUrl);
          if (res2.ok) {
            videoBuffer = Buffer.from(await res2.arrayBuffer());
          } else {
            console.warn(JSON.stringify({
              event: 'veo_video_gcs_download_failed',
              uri: video.uri,
              publicStatus: res.status,
              authStatus: res2.status,
            }));
            return null;
          }
        }
      } catch (gcsErr) {
        console.warn(JSON.stringify({
          event: 'veo_video_gcs_error',
          uri: video.uri,
          error: gcsErr instanceof Error ? gcsErr.message : String(gcsErr),
        }));
        return null;
      }
    } else {
      console.warn(JSON.stringify({ event: 'veo_video_no_bytes_or_uri' }));
      return null;
    }

    const durationMs = Date.now() - startMs;
    console.info(JSON.stringify({
      event: 'veo_video_complete',
      durationMs,
      pollCount,
      videoSizeBytes: videoBuffer.length,
      videoSizeMB: (videoBuffer.length / 1024 / 1024).toFixed(2),
    }));

    return { videoBuffer, durationMs };

  } catch (err) {
    const durationMs = Date.now() - startMs;
    console.error(JSON.stringify({
      event: 'veo_video_error',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 300) : undefined,
      durationMs,
    }));
    return null;
  }
}

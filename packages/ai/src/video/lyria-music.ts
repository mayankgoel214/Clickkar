// ---------------------------------------------------------------------------
// Lyria 3 Clip — background music generation via Gemini REST API.
//
// The @google/genai SDK v1.46.0 does not expose a typed method for
// lyria-3-clip-preview. We call the REST endpoint directly.
//
// Returns null on any failure (never throws — non-fatal by design).
// ---------------------------------------------------------------------------

import { getProviderKey, hasKeyPool } from '@autmn/keypool';

export interface LyriaMusicOptions {
  /** Free-text description of the music to generate. */
  prompt: string;
  /** Duration in seconds — Lyria 3 Clip supports 15–30 seconds. Default: 20. */
  durationSeconds?: number;
}

export interface LyriaMusicResult {
  audioBuffer: Buffer;
  /** MIME type returned by the API, typically "audio/wav" or "audio/mp3". */
  mimeType: string;
  durationMs: number;
}

const LYRIA_MODEL = 'lyria-3-clip-preview';
const LYRIA_TIMEOUT_MS = 60_000; // 1 minute — clip generation is fast

// ---------------------------------------------------------------------------
// Category → mood prompt mapping
// ---------------------------------------------------------------------------

const CATEGORY_PROMPTS: Record<string, string> = {
  jewellery: 'Elegant, cinematic instrumental with soft piano and strings. Luxury brand feel. Slow tempo, sophisticated mood.',
  food: 'Warm, upbeat acoustic guitar with light percussion. Appetizing and cheerful. Medium tempo.',
  skincare: 'Calm, airy ambient with soft synths and gentle piano. Serene, clean, premium beauty feel.',
  garment: 'Trendy, modern pop instrumental. Stylish and youthful. Upbeat with subtle beat.',
  candle: 'Warm, intimate lo-fi instrumental. Cozy, relaxing atmosphere. Soft ambient texture.',
  bag: 'Modern, stylish instrumental. Confident and sleek. Moderate tempo with clean production.',
  home_goods: 'Warm, pleasant instrumental. Comfortable and inviting. Light tempo.',
  general: 'Neutral, professional background instrumental. Clean and modern.',
};

export function getLyriaPrompt(productCategory: string, customPrompt?: string): string {
  if (customPrompt) return customPrompt;
  return CATEGORY_PROMPTS[productCategory] ?? CATEGORY_PROMPTS['general']!;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a short background music clip using Lyria 3 Clip (Gemini API).
 *
 * Uses a direct REST call since the SDK does not yet expose this endpoint.
 * The audio is returned as a Buffer for mixing into video via FFmpeg.
 *
 * Returns null on any failure — music is optional enhancement, never required.
 */
export async function generateLyriaMusic(
  options: LyriaMusicOptions,
): Promise<LyriaMusicResult | null> {
  const startMs = Date.now();

  if (!hasKeyPool('gemini')) {
    console.error(JSON.stringify({ event: 'lyria_music_no_api_key' }));
    return null;
  }
  const apiKey = getProviderKey('gemini');

  const durationSeconds = options.durationSeconds ?? 20;

  console.info(JSON.stringify({
    event: 'lyria_music_start',
    model: LYRIA_MODEL,
    durationSeconds,
    promptLength: options.prompt.length,
  }));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LYRIA_TIMEOUT_MS);

    // Direct REST call — Gemini generateContent endpoint supports Lyria
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${LYRIA_MODEL}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: options.prompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: undefined,
        },
        // Duration hint — Lyria may not strictly honor this but it steers length
        audioTimestamp: false,
      },
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(JSON.stringify({
        event: 'lyria_music_api_error',
        status: response.status,
        error: errText.slice(0, 300),
      }));
      return null;
    }

    const json = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { data: string; mimeType: string };
          }>;
        };
      }>;
    };

    const inlineData = json.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) {
      console.warn(JSON.stringify({
        event: 'lyria_music_no_audio_data',
        responseKeys: json.candidates ? JSON.stringify(Object.keys(json.candidates[0] ?? {})) : 'none',
      }));
      return null;
    }

    const audioBuffer = Buffer.from(inlineData.data, 'base64');
    const mimeType = inlineData.mimeType ?? 'audio/wav';
    const durationMs = Date.now() - startMs;

    console.info(JSON.stringify({
      event: 'lyria_music_complete',
      durationMs,
      audioSizeBytes: audioBuffer.length,
      audioSizeKB: (audioBuffer.length / 1024).toFixed(1),
      mimeType,
    }));

    return { audioBuffer, mimeType, durationMs };

  } catch (err) {
    const durationMs = Date.now() - startMs;
    // AbortError = timeout
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.warn(JSON.stringify({
      event: isTimeout ? 'lyria_music_timeout' : 'lyria_music_error',
      error: err instanceof Error ? err.message : String(err),
      durationMs,
    }));
    return null;
  }
}

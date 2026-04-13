import { fal } from '@fal-ai/client';

function ensureFalConfig() {
  const key = process.env['FAL_KEY'] ?? process.env['FAL_API_KEY'] ?? '';
  fal.config({ credentials: key });
}

// ---------------------------------------------------------------------------
// Video prompt templates per style
// ---------------------------------------------------------------------------

const VIDEO_PROMPTS: Record<string, string> = {
  style_clean_white: 'Slow gentle zoom in on the product. Clean white background stays static. Product catches subtle light reflections. Minimal, elegant camera movement.',
  style_studio: 'Smooth slow orbit around the product on colored backdrop. Dramatic studio lighting shifts subtly. Product gleams with studio highlights.',
  style_gradient: 'Cinematic slow push-in with dramatic rim lighting. Dark moody atmosphere with subtle particle effects. Product emerges from shadows into light.',
  style_lifestyle: 'Subtle life scene with gentle ambient motion — leaves rustling, steam rising, natural light shifting. Product is the hero anchor point.',
  style_outdoor: 'Natural environment comes alive — wind through grass, dappled sunlight shifting, gentle breeze. Product sits still as the world moves around it.',
  style_festive: 'Warm festive glow with flickering lamp light. Gentle floating elements — petals, sparkles. Warm, celebratory atmosphere with subtle motion.',
  style_with_model: 'Person naturally interacts with the product — slight smile, subtle head turn, confident gesture. Cinematic portrait photography feel.',
  style_clickkar_special: 'Cinematic reveal of the product with bold creative motion. Dramatic lighting shift, dynamic elements in motion, scroll-stopping visual energy.',
};

const DEFAULT_VIDEO_PROMPT =
  'Smooth slow zoom with subtle ambient motion. Product is the focal point. Cinematic product advertisement feel. Professional lighting.';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CinematicVideoOptions {
  /** Public URL of the finished ad image */
  imageUrl: string;
  style?: string;
  productName?: string;
  /** Duration in seconds — default 5 */
  duration?: number;
  /** Aspect ratio — default 9:16 for Reels/Status */
  aspectRatio?: '9:16' | '1:1' | '16:9';
}

export interface CinematicVideoResult {
  videoUrl: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a cinematic video ad from a still product image.
 * Uses LTX-2.3 Fast on fal.ai — ~15-25s generation time.
 *
 * Falls back gracefully on failure — video is never on the critical path.
 */
export async function generateCinematicVideo(
  options: CinematicVideoOptions,
): Promise<CinematicVideoResult | null> {
  const startMs = Date.now();
  ensureFalConfig();

  const stylePrompt = VIDEO_PROMPTS[options.style ?? ''] ?? DEFAULT_VIDEO_PROMPT;
  const productContext = options.productName ? `Product: ${options.productName}. ` : '';
  const fullPrompt = `${productContext}${stylePrompt} Smooth, professional motion. No text overlays. No glitches or artifacts.`;

  const duration = options.duration ?? 5;
  const aspectRatio = options.aspectRatio ?? '9:16';

  try {
    console.info(
      JSON.stringify({
        event: 'cinematic_video_start',
        style: options.style,
        duration,
        aspectRatio,
        promptLength: fullPrompt.length,
      }),
    );

    // 60-second timeout for the entire video generation
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Cinematic video generation timed out after 60s')),
        60_000,
      ),
    );

    const result = await Promise.race([
      fal.subscribe('fal-ai/ltx-2.3/image-to-video/fast', {
        input: {
          prompt: fullPrompt,
          image_url: options.imageUrl,
          num_frames: duration * 24, // 24fps
          fps: 24,
          aspect_ratio: aspectRatio,
        },
        logs: false,
      }),
      timeoutPromise,
    ]);

    // Handle both response shapes: result.data.video.url and result.video.url
    const videoUrl =
      (result as any)?.data?.video?.url ?? (result as any)?.video?.url ?? null;

    if (!videoUrl) {
      console.warn(
        JSON.stringify({
          event: 'cinematic_video_no_url',
          result: JSON.stringify(result).slice(0, 200),
        }),
      );
      return null;
    }

    const durationMs = Date.now() - startMs;
    console.info(
      JSON.stringify({
        event: 'cinematic_video_complete',
        durationMs,
        videoUrl: (videoUrl as string).slice(0, 100),
      }),
    );

    return { videoUrl: videoUrl as string, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const isTimeout = err instanceof Error && err.message.includes('timed out');
    console.warn(
      JSON.stringify({
        event: isTimeout ? 'cinematic_video_timeout' : 'cinematic_video_error',
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      }),
    );
    return null;
  }
}

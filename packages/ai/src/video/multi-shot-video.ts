import sharp from 'sharp';
import { fal } from '@fal-ai/client';
import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';

import { downloadBuffer, uploadToStorage } from '../pipeline/fallback.js';
import { generateSilentTrack } from './music.js';

function ensureFalConfig() {
  const key = process.env['FAL_KEY'] ?? process.env['FAL_API_KEY'] ?? '';
  fal.config({ credentials: key });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MultiShotVideoOptions {
  imageUrl: string;           // PUBLIC URL of the finished hero ad image
  imageBuffer?: Buffer;       // Optional: hero image buffer (avoids re-download)
  productName?: string;
  productCategory?: string;
  style?: string;
  lang?: 'hi' | 'en';
}

export interface MultiShotVideoResult {
  videoBuffer: Buffer;
  thumbnailBuffer: Buffer;
  durationMs: number;
  clipCount: number;
}

// ---------------------------------------------------------------------------
// Motion-only prompts — describe ONLY camera movement and ambient effects.
// Do NOT redescribe the scene/image content — the model already sees the frame.
// ---------------------------------------------------------------------------

const MOTION_PROMPTS: Record<string, string> = {
  style_clean_white: 'Very subtle slow push-in. Faint light reflections shift across product surface. Minimal, elegant movement. Background remains perfectly still.',
  style_studio: 'Gentle camera drift to the right. Studio lights create subtle moving highlights on product surface. Smooth, professional pace.',
  style_gradient: 'Slow dramatic push-in. Rim light intensifies slightly. Subtle particle motes drift through scene. Cinematic, moody atmosphere.',
  style_lifestyle: 'Natural ambient motion — leaves gently sway, light dapples shift. Product stays anchored. Warm, lived-in feel.',
  style_outdoor: 'Gentle breeze moves environmental elements. Sunlight shifts subtly. Natural, organic feel. Product is the steady anchor.',
  style_festive: 'Warm flickering light creates gentle shadows. Subtle sparkle effects. Festive, celebratory ambient motion.',
  style_with_model: 'Person subtly shifts weight, natural breathing motion. Eyes engage camera. Product held steady. Cinematic portrait feel.',
  style_clickkar_special: 'Cinematic slow push-in with subtle parallax depth. Light sweeps dramatically across product. Bold, premium motion.',
  style_video_shoot: 'Cinematic slow push-in with dramatic lighting shift. Product catches new highlights as camera moves. Professional ad motion.',
};

const DEFAULT_MOTION = 'Gentle camera push-in. Subtle light reflections shift across surfaces. Smooth, professional motion. No morphing or distortion.';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a professional video ad from an already-generated hero ad image.
 *
 * Architecture:
 * 1. Animate the hero image with i2v (motion-only prompt — NOT redescribing scene)
 *    Fallback chain: LTX-2.3 Fast → Kling 2.1 → Ken Burns (always works)
 * 2. Generate a text-overlay outro from the same image (Ken Burns zoom-out + FFmpeg drawtext)
 * 3. Assemble: animated clip (5s) + outro clip (3s) with optional background music
 *
 * This approach works because each frame starts from a photorealistic ad image,
 * avoiding the "cardboard cutout on gradient" problem of the old approach.
 */
export async function generateMultiShotVideo(
  options: MultiShotVideoOptions,
): Promise<MultiShotVideoResult> {
  const startMs = Date.now();
  ensureFalConfig();

  const productName = options.productName ?? 'Product';
  const category = options.productCategory ?? 'other';
  const style = options.style ?? 'style_video_shoot';
  const lang = options.lang ?? 'en';

  console.info(JSON.stringify({
    event: 'video_ad_v2_start',
    productName,
    category,
    style,
  }));

  // Get the hero image buffer — it must already be a processed ad image
  let heroBuffer: Buffer;
  if (options.imageBuffer) {
    heroBuffer = options.imageBuffer;
  } else {
    heroBuffer = await downloadBuffer(options.imageUrl);
  }

  // Convert hero to 9:16 vertical format (720x1280)
  const hero916 = await convertTo916(heroBuffer, 720, 1280);

  // ===== Step 1: Animate the hero image with i2v =====
  const motionPrompt = MOTION_PROMPTS[style] ?? DEFAULT_MOTION;
  const animatedClip = await animateImage(hero916, motionPrompt, 5);

  console.info(JSON.stringify({
    event: 'video_ad_v2_animated_clip_complete',
    durationMs: Date.now() - startMs,
    clipSizeBytes: animatedClip.length,
  }));

  // ===== Step 2: Generate outro with text overlay (non-fatal) =====
  let outroClip: Buffer | null = null;
  try {
    outroClip = await generateOutroClip(hero916, productName, lang, 3);
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'outro_clip_failed_using_animated_only',
      error: err instanceof Error ? err.message : String(err),
    }));
    // Continue without outro — deliver the animated clip alone
  }

  // ===== Step 3: Assemble final video =====
  let finalVideo: Buffer;
  if (outroClip) {
    // Full assembly: animated clip + outro
    const musicTrack = await generateSilentTrack(10).catch(() => undefined);
    finalVideo = await assembleVideoV2(animatedClip, outroClip, musicTrack);
  } else {
    // Outro failed — deliver the animated clip directly without re-encoding
    finalVideo = animatedClip;
  }

  const durationMs = Date.now() - startMs;
  console.info(JSON.stringify({
    event: 'video_ad_v2_complete',
    durationMs,
    videoSizeBytes: finalVideo.length,
    videoSizeMB: (finalVideo.length / 1024 / 1024).toFixed(2),
    hasOutro: !!outroClip,
  }));

  return {
    videoBuffer: finalVideo,
    thumbnailBuffer: heroBuffer,
    durationMs,
    clipCount: outroClip ? 2 : 1,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function convertTo916(buffer: Buffer, width: number, height: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  const ratio = w / h;
  // If already close to 9:16 (0.5625)
  if (ratio >= 0.5 && ratio <= 0.6) {
    return sharp(buffer)
      .resize(width, height, { fit: 'cover' })
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  // Create blurred background + centered image (magazine layout)
  const blurBg = await sharp(buffer)
    .resize(width, height, { fit: 'cover' })
    .blur(40)
    .modulate({ brightness: 0.4 })
    .jpeg({ quality: 80 })
    .toBuffer();

  const fitted = await sharp(buffer)
    .resize(width, Math.round(width * (h / w)), { fit: 'inside' })
    .jpeg({ quality: 92 })
    .toBuffer();

  const fittedMeta = await sharp(fitted).metadata();
  const fW = fittedMeta.width ?? width;
  const fH = fittedMeta.height ?? height;

  return sharp(blurBg)
    .composite([{
      input: fitted,
      left: Math.round((width - fW) / 2),
      top: Math.round((height - fH) / 2),
    }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// ---- Animate with i2v (3-tier fallback) ----

async function animateImage(frameBuffer: Buffer, prompt: string, durationSec: number): Promise<Buffer> {
  // Upload frame to get a public URL for the API
  const frameUrl = await uploadToStorage(frameBuffer, `tmp_video_frame_${Date.now()}.jpg`, 'image/jpeg');

  // Tier 1: LTX-2.3 Fast (cheapest, fastest — ~15-25s, ~$0.20)
  try {
    console.info(JSON.stringify({ event: 'i2v_start', model: 'ltx-2.3-fast', durationSec }));

    const result = await Promise.race([
      fal.subscribe('fal-ai/ltx-video/v0.9.7/image-to-video', {
        input: {
          prompt: `${prompt} No morphing, no distortion, no text changes.`,
          image_url: frameUrl,
          num_frames: durationSec * 24,
          fps: 24,
          aspect_ratio: '9:16',
        },
        logs: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LTX-2.3 timed out after 60s')), 60_000),
      ),
    ]) as any;

    const videoUrl = result?.data?.video?.url ?? result?.video?.url;
    if (videoUrl) {
      const videoBuffer = await downloadBuffer(videoUrl);
      console.info(JSON.stringify({ event: 'i2v_complete', model: 'ltx-2.3-fast', sizeBytes: videoBuffer.length }));
      return videoBuffer;
    }
    throw new Error('No video URL in LTX response');
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'i2v_ltx_failed',
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  // Tier 2: Kling 2.1 Standard (better quality, slower — ~60-120s)
  try {
    console.info(JSON.stringify({ event: 'i2v_start', model: 'kling-2.1', durationSec }));

    const result = await Promise.race([
      fal.subscribe('fal-ai/kling-video/v2.1/standard/image-to-video', {
        input: {
          prompt: `${prompt} No morphing, no distortion.`,
          image_url: frameUrl,
          duration: '5',
        },
        logs: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Kling timed out after 120s')), 120_000),
      ),
    ]) as any;

    const videoUrl = result?.data?.video?.url ?? result?.video?.url ?? result?.data?.videos?.[0]?.url;
    if (videoUrl) {
      const videoBuffer = await downloadBuffer(videoUrl);
      console.info(JSON.stringify({ event: 'i2v_complete', model: 'kling-2.1', sizeBytes: videoBuffer.length }));
      return videoBuffer;
    }
    throw new Error('No video URL in Kling response');
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'i2v_kling_failed',
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  // Tier 3: Ken Burns (free, always works)
  console.info(JSON.stringify({ event: 'i2v_fallback_ken_burns' }));
  return generateKenBurnsClip(frameBuffer, durationSec, 'zoom_in');
}

// ---- Generate outro clip with text overlay ----

async function generateOutroClip(
  heroBuffer: Buffer,
  productName: string,
  lang: 'hi' | 'en',
  durationSec: number,
): Promise<Buffer> {
  // Step 1: Composite text overlay onto the hero image using sharp + SVG.
  // This bypasses FFmpeg drawtext entirely — no libfreetype dependency.
  try {
    const meta = await sharp(heroBuffer).metadata();
    const w = meta.width ?? 720;
    const h = meta.height ?? 1280;

    const displayName = productName.length > 35 ? productName.slice(0, 33) + '...' : productName;
    const ctaText = lang === 'hi' ? 'WhatsApp pe order karein' : 'Order on WhatsApp';

    // Escape XML special characters for safe SVG embedding
    const safeName = displayName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const safeCTA = ctaText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const fontSize = Math.max(24, Math.round(w * 0.04));
    const ctaFontSize = Math.max(18, Math.round(w * 0.03));
    const barHeight = Math.round(h * 0.25);
    const barY = h - barHeight;

    const textOverlaySvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="black" stop-opacity="0"/>
            <stop offset="0.3" stop-color="black" stop-opacity="0.4"/>
            <stop offset="1" stop-color="black" stop-opacity="0.7"/>
          </linearGradient>
        </defs>
        <rect x="0" y="${barY}" width="${w}" height="${barHeight}" fill="url(#grad)"/>
        <text x="${w / 2}" y="${barY + Math.round(barHeight * 0.45)}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${fontSize}" fill="white" text-anchor="middle">${safeName}</text>
        <text x="${w / 2}" y="${barY + Math.round(barHeight * 0.70)}" font-family="Arial,Helvetica,sans-serif" font-weight="500" font-size="${ctaFontSize}" fill="rgba(255,255,255,0.85)" text-anchor="middle">${safeCTA}</text>
        <text x="${w - 10}" y="${h - 8}" font-family="Arial,Helvetica,sans-serif" font-size="12" fill="rgba(255,255,255,0.4)" text-anchor="end">Made with Clickkar</text>
      </svg>`,
    );

    const textOverlay = await sharp(textOverlaySvg).png().toBuffer();

    const heroWithText = await sharp(heroBuffer)
      .composite([{ input: textOverlay, left: 0, top: 0, blend: 'over' }])
      .jpeg({ quality: 92 })
      .toBuffer();

    console.info(JSON.stringify({ event: 'outro_text_overlay_applied', method: 'sharp_svg' }));

    // Step 2: Apply Ken Burns zoom-out to the composited image
    return await generateKenBurnsClip(heroWithText, durationSec, 'zoom_out');
  } catch (err) {
    // Fallback: plain Ken Burns without text — better than a broken outro
    console.warn(JSON.stringify({
      event: 'outro_text_overlay_failed',
      error: err instanceof Error ? err.message : String(err),
      fallback: 'plain_ken_burns',
    }));
    return generateKenBurnsClip(heroBuffer, durationSec, 'zoom_out');
  }
}

// ---- Ken Burns clip generator ----

async function generateKenBurnsClip(
  frameBuffer: Buffer,
  durationSec: number,
  effect: 'zoom_in' | 'zoom_out',
): Promise<Buffer> {
  const id = randomUUID().slice(0, 8);
  const tmpDir = tmpdir();
  const inputPath = join(tmpDir, `kb_${id}.jpg`);
  const outputPath = join(tmpDir, `kb_out_${id}.mp4`);

  const jpegBuffer = await sharp(frameBuffer).jpeg({ quality: 92 }).toBuffer();
  await writeFile(inputPath, jpegBuffer);

  const zoomExpr = effect === 'zoom_in'
    ? `z='min(zoom+0.002,1.3)'`
    : `z='if(eq(on,1),1.3,max(zoom-0.002,1.0))'`;

  return new Promise<Buffer>((resolve, reject) => {
    ffmpeg(inputPath)
      .loop(durationSec)
      .videoFilter(
        `zoompan=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${durationSec * 25}:s=720x1280:fps=25`,
      )
      .outputOptions([
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-t', String(durationSec),
        '-movflags', '+faststart', '-an',
      ])
      .output(outputPath)
      .on('end', async () => {
        try {
          const buf = await readFile(outputPath);
          await unlink(inputPath).catch(() => {});
          await unlink(outputPath).catch(() => {});
          resolve(buf);
        } catch (e) { reject(e); }
      })
      .on('error', (err) => {
        unlink(inputPath).catch(() => {});
        unlink(outputPath).catch(() => {});
        reject(new Error(`Ken Burns FFmpeg error: ${err.message}`));
      })
      .run();
  });
}

// ---- Assemble final video (animated clip + outro, optional music) ----

async function assembleVideoV2(
  mainClip: Buffer,
  outroClip: Buffer,
  musicTrack?: Buffer,
): Promise<Buffer> {
  const id = randomUUID().slice(0, 8);
  const tmpDir = tmpdir();

  const mainPath = join(tmpDir, `v2_main_${id}.mp4`);
  const outroPath = join(tmpDir, `v2_outro_${id}.mp4`);
  const concatPath = join(tmpDir, `v2_concat_${id}.txt`);
  const outputPath = join(tmpDir, `v2_out_${id}.mp4`);

  await writeFile(mainPath, mainClip);
  await writeFile(outroPath, outroClip);
  await writeFile(concatPath, `file '${mainPath}'\nfile '${outroPath}'`);

  let musicPath: string | null = null;
  if (musicTrack && musicTrack.length > 0) {
    musicPath = join(tmpDir, `v2_music_${id}.aac`);
    await writeFile(musicPath, musicTrack);
  }

  const cleanup = () =>
    Promise.all([
      unlink(mainPath).catch(() => {}),
      unlink(outroPath).catch(() => {}),
      unlink(concatPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
      musicPath ? unlink(musicPath).catch(() => {}) : Promise.resolve(),
    ]);

  return new Promise<Buffer>((resolve, reject) => {
    let cmd = ffmpeg()
      .input(concatPath)
      .inputOptions(['-f', 'concat', '-safe', '0']);

    if (musicPath) {
      cmd = cmd.input(musicPath);
    }

    const outputOptions = [
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-r', '24', '-s', '720x1280',
      '-maxrate', '2000k', '-bufsize', '4000k',
    ];

    if (musicPath) {
      outputOptions.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
    } else {
      outputOptions.push('-an');
    }

    cmd
      .outputOptions(outputOptions)
      .output(outputPath)
      .on('end', async () => {
        try {
          const buf = await readFile(outputPath);
          await cleanup();
          resolve(buf);
        } catch (e) { reject(e); }
      })
      .on('error', async (err) => {
        await cleanup();
        reject(new Error(`assembleVideoV2 FFmpeg error: ${err.message}`));
      })
      .run();
  });
}

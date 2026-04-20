import sharp from 'sharp';
import { fal } from '@fal-ai/client';
import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';

import { getProviderKey } from '@autmn/keypool';
import { downloadBuffer, uploadToStorage } from '../pipeline/fallback.js';
import { generateVeoVideo } from './veo-video.js';

function ensureFalConfig() {
  fal.config({ credentials: getProviderKey('fal') });
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

const CATEGORY_MOTION_OVERRIDES: Record<string, string> = {
  jewellery: 'Very slow, elegant camera drift. Gentle light sweep across diamonds creating subtle sparkle points. Minimal camera movement — let the jewelry be the star. Luxury commercial pace. No morphing, no distortion, photorealistic.',
  food: 'Appetizing slow push-in. Warm lighting shifts across textures. Steam or ambient warmth visible. Mouth-watering commercial pace. No morphing, no distortion, photorealistic.',
  skincare: 'Serene, slow camera glide. Soft diffused lighting shifts. Dewy, fresh atmosphere. Premium beauty commercial pace. No morphing, no distortion, photorealistic.',
};

const MOTION_PROMPTS: Record<string, string> = {
  style_clean_white: 'Smooth cinematic orbit around the product. Camera glides revealing different angles. Clean studio lighting creates moving highlights across surfaces. Premium commercial quality. No morphing, no distortion, photorealistic.',
  style_studio: 'Dramatic slow dolly push-in. Studio lights sweep creating bold rim lighting that intensifies. Volumetric light beams shift across colored backdrop. High-end commercial. No morphing, no distortion, photorealistic.',
  style_gradient: 'Cinematic crane shot descending toward product. Dramatic rim lighting pulses from warm amber to cool blue. Atmospheric particles drift through volumetric light. Dark luxury commercial. No morphing, no distortion, photorealistic.',
  style_lifestyle: 'Gentle handheld camera drift. Warm sunlight shifts creating moving dappled shadows. Ambient life elements sway naturally. Editorial lifestyle commercial. No morphing, no distortion, photorealistic.',
  style_outdoor: 'Smooth steadicam movement through scene. Golden hour light shifts dramatically. Wind moves natural elements around static product. Cinematic nature feel. No morphing, no distortion, photorealistic.',
  style_festive: 'Warm camera push-in with flickering light creating dancing shadows. Golden sparkles shimmer. Festive atmosphere with ambient motion. Premium Indian commercial. No morphing, no distortion, photorealistic.',
  style_with_model: 'Cinematic portrait movement. Person naturally shifts gaze and expression. Shallow depth of field creates drifting bokeh. Editorial fashion photography in motion. No morphing, no distortion, photorealistic.',
  style_autmn_special: 'Bold cinematic camera orbit with dramatic parallax depth. Volumetric lighting sweeps creating moving specular highlights. Particles drift through light beams. Award-winning commercial cinematography. No morphing, no distortion, photorealistic.',
  style_video_shoot: 'Bold cinematic camera orbit with dramatic parallax depth. Volumetric lighting sweeps across product creating moving specular highlights and reflections. Premium product advertisement with bold motion and energy. Award-winning commercial cinematography. No morphing, no distortion, photorealistic.',
};

const DEFAULT_MOTION = 'Cinematic slow orbit around product. Dramatic lighting shifts create moving highlights. Premium commercial feel. No morphing, no distortion, photorealistic.';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a professional video ad from an already-generated hero ad image.
 *
 * Architecture:
 * 1. Animate the hero image with i2v (motion-only prompt — NOT redescribing scene)
 *    Fallback chain: Kling 3.0 Standard → Kling 2.1 → LTX-2.3 Fast → Ken Burns (always works)
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
  const categoryOverride = CATEGORY_MOTION_OVERRIDES[category];
  const motionPrompt = categoryOverride ?? MOTION_PROMPTS[style] ?? DEFAULT_MOTION;
  const clipDuration = (style === 'style_video_shoot') ? 10 : 5;
  const animatedClip = await animateImage(hero916, motionPrompt, clipDuration);

  console.info(JSON.stringify({
    event: 'video_ad_v2_animated_clip_complete',
    durationMs: Date.now() - startMs,
    clipSizeBytes: animatedClip.length,
  }));

  // ===== Step 2: Generate outro with text overlay (non-fatal) =====
  let outroClip: Buffer | null = null;
  try {
    const outroDuration = 3;
    outroClip = await generateOutroClip(hero916, productName, lang, outroDuration);
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
    // Kling 3.0 provides native audio — assembleVideoV2 passes through clip audio directly.
    finalVideo = await assembleVideoV2(animatedClip, outroClip);
  } else {
    // Outro failed — deliver the animated clip directly without re-encoding
    finalVideo = animatedClip;
  }

  // Check video size — WhatsApp rejects files >16MB
  const MAX_WHATSAPP_VIDEO_BYTES = 15 * 1024 * 1024; // 15MB safety margin
  if (finalVideo.length > MAX_WHATSAPP_VIDEO_BYTES) {
    console.warn(JSON.stringify({
      event: 'video_too_large_recompressing',
      originalSizeMB: (finalVideo.length / 1024 / 1024).toFixed(2),
    }));
    finalVideo = await recompressVideo(finalVideo, MAX_WHATSAPP_VIDEO_BYTES);
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
  // Tier 1: Veo 3.1 Lite via Gemini API (takes raw bytes — no public URL needed)
  try {
    console.info(JSON.stringify({ event: 'i2v_start', model: 'veo-3.1-lite', durationSec }));

    const veoResult = await generateVeoVideo({
      imageBuffer: frameBuffer,
      prompt: `${prompt} No morphing, no distortion, photorealistic.`,
      durationSeconds: durationSec <= 5 ? 5 : 8,
      aspectRatio: '9:16',
      resolution: '720p',
      // generateAudio not supported in current Gemini API — videos are silent
    });

    if (veoResult) {
      console.info(JSON.stringify({
        event: 'i2v_complete',
        model: 'veo-3.1-lite',
        sizeBytes: veoResult.videoBuffer.length,
      }));
      return veoResult.videoBuffer;
    }
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'i2v_veo_failed',
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  // Tier 2: LTX-2.3 Fast (fal.ai — requires public URL)
  let frameUrl: string | null = null;
  try {
    frameUrl = await uploadToStorage(frameBuffer, `tmp_video_frame_${Date.now()}.jpg`, 'image/jpeg');
  } catch (uploadErr) {
    console.warn(JSON.stringify({
      event: 'i2v_ltx_upload_failed',
      error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
    }));
  }

  if (frameUrl) {
    try {
      console.info(JSON.stringify({ event: 'i2v_start', model: 'ltx-2.3-fast', durationSec }));

      const result = await Promise.race([
        fal.subscribe('fal-ai/ltx-video/v0.9.7/image-to-video', {
          input: {
            prompt,
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
  }

  // Tier 3: Ken Burns (FFmpeg — always works, zero API cost)
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
        <text x="${w - 10}" y="${h - 8}" font-family="Arial,Helvetica,sans-serif" font-size="12" fill="rgba(255,255,255,0.4)" text-anchor="end">Made with Autmn</text>
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

// ---- Recompress video to fit within WhatsApp 16MB limit ----

async function recompressVideo(videoBuffer: Buffer, _maxBytes: number): Promise<Buffer> {
  const id = randomUUID().slice(0, 8);
  const tmpDir = tmpdir();
  const inputPath = join(tmpDir, `recomp_in_${id}.mp4`);
  const outputPath = join(tmpDir, `recomp_out_${id}.mp4`);

  await writeFile(inputPath, videoBuffer);

  return new Promise<Buffer>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '28',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        '-maxrate', '1500k', '-bufsize', '3000k',
        '-c:a', 'aac', '-b:a', '96k',
        '-shortest',
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
        reject(new Error(`recompressVideo FFmpeg error: ${err.message}`));
      })
      .run();
  });
}

// ---- Assemble final video (animated clip + outro, optional music) ----

async function assembleVideoV2(
  mainClip: Buffer,
  outroClip: Buffer,
  _musicTrack?: Buffer,
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

  const cleanup = () =>
    Promise.all([
      unlink(mainPath).catch(() => {}),
      unlink(outroPath).catch(() => {}),
      unlink(concatPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);

  return new Promise<Buffer>((resolve, reject) => {
    const cmd = ffmpeg()
      .input(concatPath)
      .inputOptions(['-f', 'concat', '-safe', '0']);

    // Always try to include audio from input clips.
    // Kling 3.0 generates native audio — this preserves it.
    // Ken Burns clips have no audio stream; FFmpeg will produce silent output (fine).
    const outputOptions = [
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-r', '24', '-s', '720x1280',
      '-maxrate', '4000k', '-bufsize', '8000k',
      '-c:a', 'aac', '-b:a', '128k',  // Always try to include audio
      '-shortest',
    ];

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

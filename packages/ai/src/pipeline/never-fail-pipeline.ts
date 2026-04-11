/**
 * Never-fail pipeline — guarantees a result for every paying customer.
 *
 * Tier 1: V3 Creative (Gemini image gen, 4 min budget) — best quality
 * Tier 2: Styled Studio (BiRefNet + sharp, 90s budget) — good quality
 * Tier 3: Clean Studio (pure sharp, 2s budget) — acceptable
 * Tier 4: Enhanced Original (pure sharp, 500ms) — always works
 */

import { processProductImageV3 } from './gemini-pipeline-v3.js';
import type { ProcessImageParams, ProcessImageResult } from './orchestrator.js';
import { downloadBuffer, uploadToStorage } from './fallback.js';
import { createStyledStudioShot, createCleanStudioShot, createEnhancedOriginal } from './styled-studio.js';

export interface NeverFailResult {
  outputUrl: string;
  videoUrl?: string;
  cutoutUrl?: string;
  qaScore: number;
  pipeline: string;
  attempts: number;
  durationMs: number;
  tier: 1 | 2 | 3 | 4;
  tierReason?: string; // Why it fell to this tier
  // Preserve all other fields from ProcessImageResult
  inputAssessment?: any;
  rejected?: boolean;
  rejectionReason?: string;
}

export async function processImageNeverFail(
  params: ProcessImageParams,
): Promise<NeverFailResult> {
  const totalStart = Date.now();
  const style = params.style ?? 'style_lifestyle';
  const category = params.productCategory ?? 'other';

  // Pre-download the raw image buffer once — reused across all tiers
  let rawBuffer: Buffer;
  try {
    rawBuffer = await downloadBuffer(params.imageUrl);
  } catch (err) {
    // If we can't even download the image, there's nothing we can do
    throw new Error(`Cannot download input image: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Tier 1: V3 Creative Pipeline (4 min budget) ──────────────────
  try {
    console.info(JSON.stringify({ event: 'never_fail_tier1_start' }));

    const TIER1_TIMEOUT = 4 * 60 * 1000; // 4 minutes
    const result = await Promise.race([
      processProductImageV3(params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tier 1 (V3 Creative) timed out after 4 minutes')), TIER1_TIMEOUT)
      ),
    ]);

    console.info(JSON.stringify({ event: 'never_fail_tier1_success', qaScore: result.qaScore, durationMs: Date.now() - totalStart }));
    return { ...result, tier: 1 };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(JSON.stringify({ event: 'never_fail_tier1_failed', reason: reason.slice(0, 200), durationMs: Date.now() - totalStart }));
  }

  // ── Tier 2: Styled Studio Shot (90s budget) ───────────────────────
  try {
    console.info(JSON.stringify({ event: 'never_fail_tier2_start' }));

    const TIER2_TIMEOUT = 90_000;
    const styledBuffer = await Promise.race([
      createStyledStudioShot(rawBuffer, params.imageUrl, style, category),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tier 2 (Styled Studio) timed out after 90s')), TIER2_TIMEOUT)
      ),
    ]);

    const outputUrl = await uploadToStorage(styledBuffer, `output_tier2_${Date.now()}.jpg`);

    // Generate video (non-fatal)
    let videoUrl: string | undefined;
    try {
      const { generateKenBurnsVideo } = await import('../video/ken-burns.js');
      const videoResult = await generateKenBurnsVideo(styledBuffer, { productCategory: category, durationSec: 5 });
      videoUrl = await uploadToStorage(videoResult.videoBuffer, `video_tier2_${Date.now()}.mp4`, 'video/mp4');
    } catch { /* video is optional */ }

    console.info(JSON.stringify({ event: 'never_fail_tier2_success', durationMs: Date.now() - totalStart }));
    return { outputUrl, videoUrl, qaScore: 50, pipeline: 'styled-studio', attempts: 0, durationMs: Date.now() - totalStart, tier: 2, tierReason: 'V3 creative generation failed' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(JSON.stringify({ event: 'never_fail_tier2_failed', reason: reason.slice(0, 200), durationMs: Date.now() - totalStart }));
  }

  // ── Tier 3: Clean Studio Shot (2s budget, zero API calls) ─────────
  try {
    console.info(JSON.stringify({ event: 'never_fail_tier3_start' }));

    const cleanBuffer = await createCleanStudioShot(rawBuffer, style);
    const outputUrl = await uploadToStorage(cleanBuffer, `output_tier3_${Date.now()}.jpg`);

    console.info(JSON.stringify({ event: 'never_fail_tier3_success', durationMs: Date.now() - totalStart }));
    return { outputUrl, qaScore: 30, pipeline: 'clean-studio', attempts: 0, durationMs: Date.now() - totalStart, tier: 3, tierReason: 'BiRefNet cutout also failed' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(JSON.stringify({ event: 'never_fail_tier3_failed', reason: reason.slice(0, 200), durationMs: Date.now() - totalStart }));
  }

  // ── Tier 4: Enhanced Original (always works) ──────────────────────
  console.info(JSON.stringify({ event: 'never_fail_tier4_start' }));

  try {
    const enhancedBuffer = await createEnhancedOriginal(rawBuffer, style);
    const outputUrl = await uploadToStorage(enhancedBuffer, `output_tier4_${Date.now()}.jpg`);

    console.info(JSON.stringify({ event: 'never_fail_tier4_success', durationMs: Date.now() - totalStart }));
    return { outputUrl, qaScore: 10, pipeline: 'enhanced-original', attempts: 0, durationMs: Date.now() - totalStart, tier: 4, tierReason: 'All processing tiers failed — delivering enhanced original' };
  } catch (tier4Err) {
    console.error(JSON.stringify({ event: 'tier4_failed', error: tier4Err instanceof Error ? tier4Err.message : String(tier4Err), durationMs: Date.now() - totalStart }));

    // Absolute last resort: upload the raw input buffer as-is
    try {
      const outputUrl = await uploadToStorage(rawBuffer, `output_raw_${Date.now()}.jpg`);
      console.info(JSON.stringify({ event: 'never_fail_raw_upload_success', durationMs: Date.now() - totalStart }));
      return { outputUrl, qaScore: 5, pipeline: 'raw-input', attempts: 0, durationMs: Date.now() - totalStart, tier: 4, tierReason: 'All processing tiers including enhanced-original failed — delivering raw input' };
    } catch (rawErr) {
      // If even raw upload fails, there is nothing we can do
      throw new Error(`All pipeline tiers including raw upload failed: ${rawErr instanceof Error ? rawErr.message : String(rawErr)}`);
    }
  }
}

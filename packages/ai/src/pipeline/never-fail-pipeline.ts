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
import { downloadBuffer, uploadToStorage, createBriaFallbackShot, postProcessFinal, addAILabel, generateStoryFormat } from './fallback.js';
import { runDeterministicChecks } from '../qa/deterministic-checks.js';
import { createStyledStudioShot, createCleanStudioShot, createEnhancedOriginal } from './styled-studio.js';

export interface NeverFailResult {
  outputUrl: string;
  storyUrl?: string;
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

/**
 * Generate 9:16 story format from a square output buffer.
 * Non-fatal — returns undefined on any error.
 */
async function tryGenerateStory(outputBuffer: Buffer, style?: string): Promise<string | undefined> {
  try {
    const storyBuffer = await generateStoryFormat(outputBuffer, style);
    const storyUrl = await uploadToStorage(storyBuffer, `story_${Date.now()}.jpg`);
    console.info(JSON.stringify({ event: 'story_format_complete' }));
    return storyUrl;
  } catch (err) {
    console.warn(JSON.stringify({ event: 'story_format_failed', error: err instanceof Error ? err.message : String(err) }));
    return undefined;
  }
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
  {
    console.info(JSON.stringify({ event: 'never_fail_tier1_start' }));

    const TIER1_TIMEOUT = 4 * 60 * 1000; // 4 minutes
    let tier1Timer: ReturnType<typeof setTimeout>;
    try {
      const result = await Promise.race([
        processProductImageV3(params),
        new Promise<never>((_, reject) => {
          tier1Timer = setTimeout(() => reject(new Error('Tier 1 (V3 Creative) timed out after 4 minutes')), TIER1_TIMEOUT);
        }),
      ]);
      clearTimeout(tier1Timer!);

      // Use storyUrl from V3 pipeline (already generated in parallel)
      // Fall back to generating from outputBuffer if V3 didn't produce one
      let storyUrl = result.storyUrl;
      if (!storyUrl) {
        try {
          if (result.outputBuffer) {
            storyUrl = await tryGenerateStory(result.outputBuffer, style);
          } else {
            const outputBuffer = await downloadBuffer(result.outputUrl);
            storyUrl = await tryGenerateStory(outputBuffer, style);
          }
        } catch { /* story is optional */ }
      }

      console.info(JSON.stringify({ event: 'never_fail_tier1_success', qaScore: result.qaScore, hasStory: !!storyUrl, durationMs: Date.now() - totalStart }));
      return { ...result, storyUrl, tier: 1 };
    } catch (err) {
      clearTimeout(tier1Timer!);
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(JSON.stringify({ event: 'never_fail_tier1_failed', reason: reason.slice(0, 200), durationMs: Date.now() - totalStart }));
    }
  }

  // ── Tier 2A: Bria Product Shot (60s budget) ──────────────────────
  {
    console.info(JSON.stringify({ event: 'never_fail_tier2a_bria_start', style }));

    let tier2aTimer: ReturnType<typeof setTimeout>;
    try {
      const briaBuffer = await Promise.race([
        createBriaFallbackShot(rawBuffer, params.imageUrl, style, category),
        new Promise<never>((_, reject) => {
          tier2aTimer = setTimeout(() => reject(new Error('Tier 2A (Bria) timed out after 60s')), 60_000);
        }),
      ]);
      clearTimeout(tier2aTimer!);

      // Run quick deterministic check on Bria output
      const briaCheck = await runDeterministicChecks(rawBuffer, briaBuffer);
      if (briaCheck.pass || briaCheck.estimatedFillPct > 15) {
        let output = await postProcessFinal(briaBuffer, style);
        output = await addAILabel(output);

        const outputUrl = await uploadToStorage(output, `output_tier2a_${Date.now()}.jpg`);

        // Generate video (non-fatal)
        let videoUrl: string | undefined;
        try {
          const { generateKenBurnsVideo } = await import('../video/ken-burns.js');
          const videoResult = await generateKenBurnsVideo(output, { productCategory: category, durationSec: 5 });
          videoUrl = await uploadToStorage(videoResult.videoBuffer, `video_tier2a_${Date.now()}.mp4`, 'video/mp4');
        } catch { /* video is optional */ }

        // Generate 9:16 story format (non-fatal)
        const storyUrl = await tryGenerateStory(output, style);

        console.info(JSON.stringify({ event: 'never_fail_tier2a_bria_success', hasStory: !!storyUrl, durationMs: Date.now() - totalStart, qaEstimate: 65 }));
        return { outputUrl, storyUrl, videoUrl, qaScore: 65, pipeline: 'bria-fallback', attempts: 0, durationMs: Date.now() - totalStart, tier: 2, tierReason: 'V3 creative failed, Bria Product Shot succeeded' };
      } else {
        console.warn(JSON.stringify({ event: 'never_fail_tier2a_bria_qa_fail', fillPct: briaCheck.estimatedFillPct, reason: briaCheck.failReason }));
      }
    } catch (briaErr) {
      clearTimeout(tier2aTimer!);
      const reason = briaErr instanceof Error ? briaErr.message : String(briaErr);
      console.warn(JSON.stringify({ event: 'never_fail_tier2a_bria_failed', reason: reason.slice(0, 200), durationMs: Date.now() - totalStart }));
    }
  }

  // ── Tier 2B: Styled Studio Shot (90s budget) ─────────────────────
  {
    console.info(JSON.stringify({ event: 'never_fail_tier2b_start' }));

    const TIER2B_TIMEOUT = 90_000;
    let tier2bTimer: ReturnType<typeof setTimeout>;
    try {
      const styledBuffer = await Promise.race([
        createStyledStudioShot(rawBuffer, params.imageUrl, style, category),
        new Promise<never>((_, reject) => {
          tier2bTimer = setTimeout(() => reject(new Error('Tier 2B (Styled Studio) timed out after 90s')), TIER2B_TIMEOUT);
        }),
      ]);
      clearTimeout(tier2bTimer!);

      const output = styledBuffer;
      const outputUrl = await uploadToStorage(output, `output_tier2b_${Date.now()}.jpg`);

      // Generate video (non-fatal)
      let videoUrl: string | undefined;
      try {
        const { generateKenBurnsVideo } = await import('../video/ken-burns.js');
        const videoResult = await generateKenBurnsVideo(output, { productCategory: category, durationSec: 5 });
        videoUrl = await uploadToStorage(videoResult.videoBuffer, `video_tier2b_${Date.now()}.mp4`, 'video/mp4');
      } catch { /* video is optional */ }

      // Generate 9:16 story format (non-fatal)
      const storyUrl = await tryGenerateStory(output, style);

      console.info(JSON.stringify({ event: 'never_fail_tier2b_success', hasStory: !!storyUrl, durationMs: Date.now() - totalStart }));
      return { outputUrl, storyUrl, videoUrl, qaScore: 50, pipeline: 'styled-studio', attempts: 0, durationMs: Date.now() - totalStart, tier: 2, tierReason: 'V3 creative + Bria failed, styled studio succeeded' };
    } catch (err) {
      clearTimeout(tier2bTimer!);
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(JSON.stringify({ event: 'never_fail_tier2b_failed', reason: reason.slice(0, 200), durationMs: Date.now() - totalStart }));
    }
  }

  // ── Tier 3: Clean Studio Shot (2s budget, zero API calls) ─────────
  try {
    console.info(JSON.stringify({ event: 'never_fail_tier3_start' }));

    const cleanBuffer = await createCleanStudioShot(rawBuffer, style);
    const outputUrl = await uploadToStorage(cleanBuffer, `output_tier3_${Date.now()}.jpg`);

    // Generate 9:16 story format (non-fatal)
    const storyUrl = await tryGenerateStory(cleanBuffer, style);

    console.info(JSON.stringify({ event: 'never_fail_tier3_success', hasStory: !!storyUrl, durationMs: Date.now() - totalStart }));
    return { outputUrl, storyUrl, qaScore: 30, pipeline: 'clean-studio', attempts: 0, durationMs: Date.now() - totalStart, tier: 3, tierReason: 'BiRefNet cutout also failed' };
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

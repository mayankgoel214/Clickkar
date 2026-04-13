/**
 * Image processing job handler.
 *
 * Runs the AI pipeline (primary: Bria Product Shot, fallback: multi-stage)
 * and delivers results via WhatsApp.
 */

import type { Job } from 'bullmq';
import { prisma } from '@whatsads/db';
import type { ImageJob } from '@whatsads/db';
import { processImageNeverFail, type NeverFailResult } from '@whatsads/ai';
import { uploadFile, Buckets } from '@whatsads/storage';
import { WhatsAppClient } from '@whatsads/whatsapp';
import { sendProcessedImages } from '@whatsads/session';
import { ImageProcessingJobDataSchema } from '@whatsads/queue';
import { getConfig, type WorkerConfig } from '../config.js';

async function sendProgressUpdate(
  phoneNumber: string,
  stage: number,
  lang: 'hi' | 'en',
  config: WorkerConfig,
): Promise<void> {
  try {
    const wa = new WhatsAppClient({
      accessToken: config.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
    });

    const messages: Record<number, Record<string, string>> = {
      2: {
        hi: 'Almost there! 🎨',
        en: 'Almost there! 🎨',
      },
    };

    const msg = messages[stage]?.[lang] ?? messages[stage]?.['en'] ?? '';
    if (msg) await wa.sendText(phoneNumber, msg);
  } catch (err) {
    console.warn(JSON.stringify({ event: 'progress_update_failed', stage, error: String(err) }));
  }
}

export async function processImageJob(job: Job): Promise<void> {
  const config = getConfig();
  const data = ImageProcessingJobDataSchema.parse(job.data);

  const log = (msg: string, extra?: Record<string, unknown>) => {
    const line = JSON.stringify({ job: job.id, orderId: data.orderId, msg, ...extra });
    console.log(line);
  };

  log('=== STARTING IMAGE PROCESSING ===', { style: data.style, imageUrl: data.inputImageUrl.slice(0, 80) });

  // Fetch the imageJob record to get styleIndex (used for progress update gating)
  const imageJobRecord = await prisma.imageJob.findUnique({
    where: { id: data.imageJobId },
    select: { styleIndex: true },
  }).catch(() => null);
  const styleIndex = imageJobRecord?.styleIndex ?? 0;
  const isFirstJob = styleIndex === 0;

  // Fetch the user's language early — needed for progress messages
  const userForLang = await prisma.user.findUnique({
    where: { phoneNumber: data.phoneNumber },
    select: { language: true },
  }).catch(() => null);
  const lang = (userForLang?.language as 'hi' | 'en') || 'hi';

  // Update job status
  await prisma.imageJob.update({
    where: { id: data.imageJobId },
    data: { status: 'processing', startedAt: new Date(), attempts: { increment: 1 } },
  }).catch((err) => {
    console.error(JSON.stringify({
      event: 'db_update_failed',
      error: err instanceof Error ? err.message : String(err),
      context: 'imageJob_mark_processing',
    }));
  }); // Job record might not exist for edits

  // ── Multi-angle product analysis ────────────────────────────────────────────
  // Run ONCE per order (on the first job). Subsequent jobs for the same order
  // reuse the profile stored in Order.productProfile.
  let productProfile: any = null;

  {
    // Stagger non-first jobs so styleIndex=0 has time to compute and store the
    // profile before the other jobs check for it. If job 0 hasn't finished by
    // the time they check, they each compute their own — that's fine.
    if (styleIndex > 0) {
      await new Promise(r => setTimeout(r, 3000));
    }

    const orderForProfile = await prisma.order.findUnique({
      where: { id: data.orderId },
      select: { productProfile: true, inputImageUrls: true },
    }).catch(() => null);

    if (orderForProfile?.productProfile) {
      // Profile already computed by a previous job for this order — reuse it
      productProfile = orderForProfile.productProfile;
      console.info(JSON.stringify({ event: 'product_profile_reused', orderId: data.orderId }));
    } else if (orderForProfile?.inputImageUrls && orderForProfile.inputImageUrls.length > 0) {
      // First job to run — compute the profile from all input images
      try {
        const { analyzeMultiAngleProduct, downloadBuffer } = await import('@whatsads/ai');

        const imageUrls = (orderForProfile.inputImageUrls as string[]).slice(0, 5);
        const buffers = await Promise.all(imageUrls.map(url => downloadBuffer(url)));

        const profile = await analyzeMultiAngleProduct(
          buffers,
          data.voiceInstructions,
          data.style ? [data.style] : undefined,
        );

        // Persist in Order for subsequent jobs in the same order to reuse
        const primaryUrl = imageUrls[profile.primaryImageIndex] ?? imageUrls[0];
        await prisma.order.update({
          where: { id: data.orderId },
          data: {
            productProfile: profile as any,
            primaryInputImageUrl: primaryUrl,
          },
        });

        productProfile = profile;
        console.info(JSON.stringify({
          event: 'product_profile_computed',
          orderId: data.orderId,
          imageCount: imageUrls.length,
          primaryIndex: profile.primaryImageIndex,
          productName: profile.productName,
          hasBranding: profile.hasBranding,
          brandingConfidence: profile.brandingConfidence,
        }));
      } catch (err) {
        console.warn(JSON.stringify({
          event: 'product_profile_failed',
          orderId: data.orderId,
          error: err instanceof Error ? err.message : String(err),
        }));
        // Non-fatal — pipeline falls back to single-image analysis inside V3
      }
    }
  }

  try {
    // Declare shared output variables — set by either the video path or the normal pipeline path.
    // Intentionally uninitialized here; both branches always assign before use.
    // eslint-disable-next-line prefer-const
    let outputUrl!: string;
    let videoUrl: string | undefined;
    let storyUrl: string | undefined;
    let cutoutUrl: string | undefined;

    // ── Video shoot routing ─────────────────────────────────────────────────
    if (data.style === 'style_video_shoot') {
      console.info(JSON.stringify({
        event: 'video_shoot_start',
        job: job.id,
        orderId: data.orderId,
      }));

      try {
        const { generateMultiShotVideo } = await import('@whatsads/ai');

        // Generate a hero ad image first — the video pipeline animates a
        // finished styled image, NOT the raw product photo.
        console.info(JSON.stringify({
          event: 'video_shoot_hero_gen_start',
          job: job.id,
          orderId: data.orderId,
        }));
        const heroResult = await processImageNeverFail({
          imageUrl: data.inputImageUrl,
          style: 'style_clickkar_special',
          productCategory: data.productCategory,
          voiceInstructions: data.voiceInstructions,
          productProfile,
        });
        console.info(JSON.stringify({
          event: 'video_shoot_hero_gen_complete',
          job: job.id,
          orderId: data.orderId,
          heroUrl: heroResult.outputUrl.slice(0, 80),
          tier: heroResult.tier,
          qaScore: heroResult.qaScore,
        }));

        const videoResult = await generateMultiShotVideo({
          imageUrl: heroResult.outputUrl,
          productCategory: data.productCategory,
          productName: (productProfile as any)?.productName,
          style: data.style,
          lang: 'en',
        });

        // Upload video to Supabase processed-images bucket (VIDEOS bucket not yet provisioned)
        // Retry up to 3 times — large MP4 files can hit transient network errors.
        const videoPath = `${data.phoneNumber}/${data.orderId}_${data.imageJobId}_video.mp4`;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            videoUrl = await uploadFile(
              Buckets.PROCESSED_IMAGES,
              videoPath,
              videoResult.videoBuffer,
              'video/mp4',
            );
            break;
          } catch (uploadErr) {
            console.warn(JSON.stringify({
              event: 'video_upload_retry',
              attempt: attempt + 1,
              error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
            }));
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          }
        }
        if (!videoUrl) {
          console.error(JSON.stringify({ event: 'video_upload_all_retries_failed', orderId: data.orderId }));
          // videoUrl stays undefined — delivery will fall through to the thumbnail-only path below
        }

        // Upload thumbnail (hero frame) as the still-image output
        const thumbPath = `${data.orderId}/${data.imageJobId}-thumb.jpg`;
        outputUrl = await uploadFile(
          Buckets.PROCESSED_IMAGES,
          thumbPath,
          videoResult.thumbnailBuffer,
          'image/jpeg',
        );

        // Update ImageJob
        await prisma.imageJob.update({
          where: { id: data.imageJobId },
          data: {
            status: 'completed',
            outputImageUrl: outputUrl,
            videoOutputUrl: videoUrl,
            pipeline: 'video_multi_shot',
            durationMs: videoResult.durationMs,
            completedAt: new Date(),
          },
        }).catch((err) => {
          console.error(JSON.stringify({
            event: 'db_update_failed',
            error: err instanceof Error ? err.message : String(err),
            context: 'imageJob_mark_completed_video',
          }));
        });

        console.info(JSON.stringify({
          event: 'video_shoot_complete',
          job: job.id,
          orderId: data.orderId,
          durationMs: videoResult.durationMs,
          videoSizeMB: (videoResult.videoBuffer.length / 1024 / 1024).toFixed(2),
        }));

      } catch (videoErr) {
        console.error(JSON.stringify({
          event: 'video_shoot_failed',
          job: job.id,
          orderId: data.orderId,
          error: videoErr instanceof Error ? videoErr.message : String(videoErr),
        }));

        // Fallback: run normal image pipeline with style_lifestyle
        const fallbackResult = await processImageNeverFail({
          imageUrl: data.inputImageUrl,
          style: 'style_lifestyle',
          productCategory: data.productCategory,
          voiceInstructions: data.voiceInstructions,
          productProfile,
        });

        outputUrl = fallbackResult.outputUrl;
        if (!outputUrl.includes('supabase.co')) {
          const outputPath = `${data.orderId}/${data.imageJobId}-output.jpg`;
          const outputBuffer = await fetch(outputUrl).then((r) => r.arrayBuffer());
          outputUrl = await uploadFile(
            Buckets.PROCESSED_IMAGES,
            outputPath,
            Buffer.from(outputBuffer),
            'image/jpeg',
          );
        }

        await prisma.imageJob.update({
          where: { id: data.imageJobId },
          data: {
            status: 'completed',
            outputImageUrl: outputUrl,
            pipeline: 'composite',
            style: 'style_lifestyle', // Update style to match actual output so delivery labels are correct
            durationMs: fallbackResult.durationMs,
            completedAt: new Date(),
          },
        }).catch((err) => {
          console.error(JSON.stringify({
            event: 'db_update_failed',
            error: err instanceof Error ? err.message : String(err),
            context: 'imageJob_mark_completed_video_fallback',
          }));
        });
      }

    } else {
      // ── Normal image pipeline ───────────────────────────────────────────────
      log('Using Never-Fail pipeline');

      // Progress update — sent after 30s delay, only for the first job
      let stage2Sent = false;
      let stage2Timer: ReturnType<typeof setTimeout> | undefined;
      if (isFirstJob) {
        stage2Timer = setTimeout(async () => {
          if (!stage2Sent) {
            stage2Sent = true;
            await sendProgressUpdate(data.phoneNumber, 2, lang, config);
          }
        }, 30_000);
      }

      const result = await processImageNeverFail({
        imageUrl: data.inputImageUrl,
        style: data.style,
        productCategory: data.productCategory,
        voiceInstructions: data.voiceInstructions,
        productProfile, // Pre-computed profile — undefined if analysis failed or single-image
      });

      // Cancel the stage 2 timer if pipeline finished before 15s
      if (stage2Timer !== undefined) {
        clearTimeout(stage2Timer);
        stage2Sent = true; // Prevent the timer callback from firing if it already expired
      }

      log(`Pipeline complete`, {
        tier: result.tier,
        tierReason: result.tierReason,
        pipeline: result.pipeline,
        qaScore: result.qaScore,
        durationMs: result.durationMs,
      });

      await job.updateProgress(80);

      // Use pipeline output URL directly if it's already in Supabase storage
      // (the pipeline uploads internally via uploadToStorage)
      outputUrl = result.outputUrl;
      if (!outputUrl.includes('supabase.co')) {
        // Only re-upload if it's a temporary URL (fal.ai, data URL, etc.)
        const outputPath = `${data.orderId}/${data.imageJobId}-output.jpg`;
        const outputBuffer = await fetch(outputUrl).then((r) => r.arrayBuffer());
        outputUrl = await uploadFile(
          Buckets.PROCESSED_IMAGES,
          outputPath,
          Buffer.from(outputBuffer),
          'image/jpeg',
        );
      }

      // Use cutout URL directly if already in Supabase, otherwise re-upload
      if (result.cutoutUrl && result.cutoutUrl.startsWith('http')) {
        if (result.cutoutUrl.includes('supabase.co')) {
          cutoutUrl = result.cutoutUrl;
        } else try {
          const cutoutPath = `${data.orderId}/${data.imageJobId}-cutout.png`;
          const cutoutBuffer = await fetch(result.cutoutUrl).then((r) => r.arrayBuffer());
          cutoutUrl = await uploadFile(
            Buckets.PROCESSED_IMAGES,
            cutoutPath,
            Buffer.from(cutoutBuffer),
            'image/png',
          );
        } catch {
          // Cutout upload is non-critical — continue without it
          cutoutUrl = result.cutoutUrl;
        }
      }

      // Handle story URL (9:16 format)
      if (result.storyUrl) {
        if (result.storyUrl.includes('supabase.co')) {
          storyUrl = result.storyUrl;
        } else try {
          const storyPath = `${data.orderId}/${data.imageJobId}-story.jpg`;
          const storyBuffer = await fetch(result.storyUrl).then((r) => r.arrayBuffer());
          storyUrl = await uploadFile(Buckets.PROCESSED_IMAGES, storyPath, Buffer.from(storyBuffer), 'image/jpeg');
        } catch {
          storyUrl = result.storyUrl;
        }
      }

      // Handle video URL (if Ken Burns was generated)
      if (result.videoUrl) {
        if (result.videoUrl.includes('supabase.co')) {
          videoUrl = result.videoUrl;
        } else try {
          const videoPath = `${data.orderId}/${data.imageJobId}-video.mp4`;
          const videoBuffer = await fetch(result.videoUrl).then((r) => r.arrayBuffer());
          videoUrl = await uploadFile(Buckets.PROCESSED_IMAGES, videoPath, Buffer.from(videoBuffer), 'video/mp4');
        } catch {
          videoUrl = result.videoUrl;
        }
      }

      await job.updateProgress(90);

      // Map pipeline string to Prisma enum — new never-fail tier names fall back to 'fallback'
      const PIPELINE_ENUM_MAP: Record<string, string> = {
        composite: 'composite',
        bria: 'bria',
        'bria-fallback': 'bria',
        kontext: 'kontext',
        segmentation: 'segmentation',
        nano_banana: 'nano_banana',
        primary: 'primary',
        fallback: 'fallback',
        'styled-studio': 'fallback',
        'styled-studio-fallback': 'fallback',
        'clean-studio': 'fallback',
        'enhanced-original': 'fallback',
        'raw-input': 'fallback',
        'tier4-enhanced': 'fallback',
      };
      const pipelineEnum = (PIPELINE_ENUM_MAP[result.pipeline] ?? 'fallback') as any;

      // Update job record
      await prisma.imageJob.update({
        where: { id: data.imageJobId },
        data: {
          status: 'completed',
          outputImageUrl: outputUrl,
          cutoutUrl,
          qaScore: result.qaScore,
          qaAttempts: result.attempts,
          pipeline: pipelineEnum,
          durationMs: result.durationMs,
          completedAt: new Date(),
        },
      }).catch((err) => {
        console.error(JSON.stringify({
          event: 'db_update_failed',
          error: err instanceof Error ? err.message : String(err),
          context: 'imageJob_mark_completed',
        }));
      });
    } // end of normal image pipeline branch

    // Update order — add output URL
    const order = await prisma.order.findUnique({ where: { id: data.orderId } });
    if (order) {
      await prisma.order.update({
        where: { id: data.orderId },
        data: {
          outputImageUrls: { push: outputUrl },
          cutoutUrls: cutoutUrl ? { push: cutoutUrl } : undefined,
        },
      });

      // Check if all images in order are done
      const allJobs = await prisma.imageJob.findMany({
        where: { orderId: data.orderId },
      });

      const allComplete = allJobs.every(
        (j: ImageJob) => j.status === 'completed' || j.status === 'failed',
      );

      if (allComplete) {
        const completedJobs = allJobs.filter(
          (j: ImageJob) => j.status === 'completed' && j.outputImageUrl,
        );
        const completedUrls = completedJobs.map((j: ImageJob) => j.outputImageUrl!);

        // Build style labels and separate video outputs from image outputs.
        // video_multi_shot jobs store their MP4 URL in videoOutputUrl — collect them
        // from the DB rows so all jobs (not just the last-completing one) are included.
        const sortedCompletedJobs = [...completedJobs].sort(
          (a: ImageJob, b: ImageJob) => (a.styleIndex ?? 0) - (b.styleIndex ?? 0),
        );

        // For video shoot jobs that produced an actual video (videoOutputUrl set),
        // keep them separate — their thumbnail is still shown as a still preview
        // and their MP4 is delivered via allVideoUrls. For video-shoot jobs that
        // fell back to a static image (videoOutputUrl is null), treat them as
        // normal image output jobs with the fallback style 'style_lifestyle' for
        // labeling purposes so indices stay aligned.
        const videoShootJobsWithVideo = sortedCompletedJobs.filter(
          (j: ImageJob) => j.style === 'style_video_shoot' && !!(j as any).videoOutputUrl,
        );
        const imageOutputJobs = sortedCompletedJobs.filter(
          (j: ImageJob) =>
            j.style !== 'style_video_shoot' ||
            !(j as any).videoOutputUrl,
        );

        // Video URLs: DB videoOutputUrl for video-shoot jobs + any Ken Burns videoUrl from the
        // current normal-pipeline job (local variable — DB has no column for those)
        const dbVideoUrls = videoShootJobsWithVideo
          .map((j: ImageJob) => (j as any).videoOutputUrl as string | null)
          .filter((u): u is string => !!u);
        const allVideoUrls = dbVideoUrls.length > 0
          ? dbVideoUrls
          : videoUrl
          ? [videoUrl]
          : [];

        const allStoryUrls = storyUrl ? [storyUrl] : [];

        // Deliver thumbnails for video-shoot jobs alongside normal image outputs.
        // sortedCompletedUrls and styleLabels are both derived from imageOutputJobs
        // so their lengths always match (1:1 correspondence).
        const sortedCompletedUrls = imageOutputJobs.map((j: ImageJob) => j.outputImageUrl!);
        const styleLabels = imageOutputJobs
          .map((j: ImageJob) =>
            j.style === 'style_video_shoot' ? 'style_lifestyle' : (j.style ?? null),
          )
          .filter((s): s is string => s !== null);

        // Optimistic lock: complete the order if it hasn't been completed yet
        const updated = await prisma.order.updateMany({
          where: { id: data.orderId, status: { in: ['processing', 'payment_confirmed'] } },
          data: {
            status: 'completed',
            outputImageUrls: sortedCompletedUrls,
            processingCompletedAt: new Date(),
          },
        });

        // Fetch the user record — needed for both delivery paths below
        const user = await prisma.user.findUnique({
          where: { phoneNumber: data.phoneNumber },
        });

        if (updated.count === 0) {
          // Order was already completed (e.g. by another worker, or by a previous delivery run).
          // For style-change edits the session will be in EDIT_PROCESSING — we still need to
          // send the new output and feedback buttons so the user sees the updated result.
          if (!user) {
            log('User not found for delivery — cannot send images');
            return;
          }
          const currentSession = await prisma.session.findFirst({ where: { userId: user.id } });

          const isStyleChangeEdit = currentSession?.state === 'EDIT_PROCESSING';
          if (isStyleChangeEdit) {
            log('Style-change edit delivery — order already marked complete, sending output and feedback buttons');
            const wa = new WhatsAppClient({
              accessToken: config.WHATSAPP_ACCESS_TOKEN,
              phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
            });
            // Style-change edits re-render a single image — deliver just the current output
            await sendProcessedImages(
              data.phoneNumber,
              [outputUrl],
              (user?.language as 'hi' | 'en') || 'hi',
              user?.name ?? undefined,
              wa,
              videoUrl ? [videoUrl] : [],
              storyUrl ? [storyUrl] : [],
              data.style ? [data.style] : undefined,
            );
            if (user) {
              await prisma.session.updateMany({
                where: { userId: user.id, state: 'EDIT_PROCESSING' },
                data: { state: 'DELIVERED', stateEnteredAt: new Date() },
              });
            }
          } else {
            log('Order already completed by another worker, skipping delivery');
          }
          return;
        }

        const wa = new WhatsAppClient({
          accessToken: config.WHATSAPP_ACCESS_TOKEN,
          phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
        });

        // Deliver ALL completed outputs from every job in this order, with style labels
        await sendProcessedImages(
          data.phoneNumber,
          sortedCompletedUrls,
          (user?.language as 'hi' | 'en') || 'hi',
          user?.name ?? undefined,
          wa,
          allVideoUrls,
          allStoryUrls,
          styleLabels.length > 0 ? styleLabels : undefined,
        );

        // Transition session to DELIVERED from PROCESSING, EDIT_PROCESSING, IDLE, or
        // AWAITING_REVISION_PAYMENT. The last case covers a race where the user paid for
        // a revision, the session timed out and moved forward before the job finished, and
        // the worker arrives late — user still needs to see the output.
        if (user) {
          const sessionUpdate = await prisma.session.updateMany({
            where: { userId: user.id, state: { in: ['PROCESSING', 'EDIT_PROCESSING', 'IDLE', 'AWAITING_REVISION_PAYMENT'] } },
            data: { state: 'DELIVERED', stateEnteredAt: new Date() },
          });
          if (sessionUpdate.count > 0) {
            log('Session transitioned to DELIVERED');
          } else {
            log('Session transition skipped — already in correct state or not found');
          }
        }

        await job.updateProgress(100);
        log('All images delivered', { count: completedUrls.length });
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error(JSON.stringify({ event: 'image_processing_failed', job: job.id, orderId: data.orderId, error: errorMsg }));
    log('Image processing failed', { error: errorMsg });

    // Update job as failed
    await prisma.imageJob.update({
      where: { id: data.imageJobId },
      data: {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    }).catch((dbErr) => {
      console.error(JSON.stringify({
        event: 'db_update_failed',
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        context: 'imageJob_mark_failed',
      }));
    });

    // If all retries exhausted, notify user
    const jobRecord = await prisma.imageJob.findUnique({
      where: { id: data.imageJobId },
    });

    // Check if BullMQ will NOT retry this job (final attempt)
    const bullmqMaxAttempts = job.opts?.attempts ?? 3;
    const isFinalBullMQAttempt = job.attemptsMade >= bullmqMaxAttempts;
    const isMaxImageJobAttempts = jobRecord ? jobRecord.attempts >= jobRecord.maxAttempts : false;

    if (isFinalBullMQAttempt || isMaxImageJobAttempts) {
      const user = await prisma.user.findUnique({
        where: { phoneNumber: data.phoneNumber },
      });
      const lang = (user?.language as 'hi' | 'en') || 'hi';

      const wa = new WhatsAppClient({
        accessToken: config.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
      });

      // Check if ALL jobs in this order are now done (completed or failed)
      const allJobs = await prisma.imageJob.findMany({
        where: { orderId: data.orderId },
      });
      const allDone = allJobs.every(
        (j: ImageJob) => j.status === 'completed' || j.status === 'failed',
      );

      if (allDone) {
        const completedUrls = allJobs
          .filter((j: ImageJob) => j.status === 'completed' && j.outputImageUrl)
          .map((j: ImageJob) => j.outputImageUrl!);

        if (completedUrls.length > 0) {
          // Some images succeeded — deliver those and note the failures
          await sendProcessedImages(data.phoneNumber, completedUrls, lang, user?.name ?? undefined, wa);
        } else {
          // All images failed
          await wa.sendText(
            data.phoneNumber,
            lang === 'hi'
              ? 'Maaf kijiye, aapki photo process nahi ho payi. Kripya dobara try karein.'
              : 'Sorry, we could not process your photo. Please try again.',
          );
        }

        // Transition session out of PROCESSING regardless of outcome
        if (user) {
          await prisma.session.updateMany({
            where: { userId: user.id, state: 'PROCESSING' },
            data: { state: 'DELIVERED', stateEnteredAt: new Date() },
          });
          log('Session transitioned to DELIVERED (after failure recovery)');
        }

        await prisma.order.update({
          where: { id: data.orderId },
          data: { status: completedUrls.length > 0 ? 'completed' : 'failed', processingCompletedAt: new Date() },
        }).catch((dbErr) => {
          console.error(JSON.stringify({
            event: 'db_update_failed',
            error: dbErr instanceof Error ? dbErr.message : String(dbErr),
            context: 'order_mark_failed',
          }));
        });
      }
    }

    throw err; // Let BullMQ handle retries
  }
}

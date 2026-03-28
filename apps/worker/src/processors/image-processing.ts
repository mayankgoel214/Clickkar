/**
 * Image processing job handler.
 *
 * Runs the AI pipeline (primary: Bria Product Shot, fallback: multi-stage)
 * and delivers results via WhatsApp.
 */

import type { Job } from 'bullmq';
import { prisma } from '@whatsads/db';
import { processProductImage } from '@whatsads/ai';
import { uploadFile, Buckets } from '@whatsads/storage';
import { WhatsAppClient } from '@whatsads/whatsapp';
import { sendProcessedImages } from '@whatsads/session';
import { ImageProcessingJobDataSchema } from '@whatsads/queue';
import { getConfig } from '../config.js';

export async function processImageJob(job: Job): Promise<void> {
  const config = getConfig();
  const data = ImageProcessingJobDataSchema.parse(job.data);

  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(JSON.stringify({ job: job.id, orderId: data.orderId, msg, ...extra }));

  log('Starting image processing');

  // Update job status
  await prisma.imageJob.update({
    where: { id: data.imageJobId },
    data: { status: 'processing', startedAt: new Date(), attempts: { increment: 1 } },
  }).catch(() => {}); // Job record might not exist for edits

  try {
    // Run AI pipeline
    const result = await processProductImage({
      imageUrl: data.inputImageUrl,
      style: data.style,
      productCategory: data.productCategory,
      voiceInstructions: data.voiceInstructions,
    });

    log('Pipeline complete', {
      pipeline: result.pipeline,
      qaScore: result.qaScore,
      durationMs: result.durationMs,
      attempts: result.attempts,
    });

    // Upload output to storage
    const outputPath = `${data.orderId}/${data.imageJobId}-output.jpg`;
    const outputBuffer = await fetch(result.outputUrl).then((r) => r.arrayBuffer());
    const outputUrl = await uploadFile(
      Buckets.PROCESSED_IMAGES,
      outputPath,
      Buffer.from(outputBuffer),
      'image/jpeg',
    );

    // Upload cutout if available
    let cutoutUrl: string | undefined;
    if (result.cutoutUrl) {
      const cutoutPath = `${data.orderId}/${data.imageJobId}-cutout.png`;
      const cutoutBuffer = await fetch(result.cutoutUrl).then((r) => r.arrayBuffer());
      cutoutUrl = await uploadFile(
        Buckets.PROCESSED_IMAGES,
        cutoutPath,
        Buffer.from(cutoutBuffer),
        'image/png',
      );
    }

    // Update job record
    await prisma.imageJob.update({
      where: { id: data.imageJobId },
      data: {
        status: 'completed',
        outputImageUrl: outputUrl,
        cutoutUrl,
        qaScore: result.qaScore,
        qaAttempts: result.attempts,
        pipeline: result.pipeline === 'primary' ? 'primary' : 'fallback',
        durationMs: result.durationMs,
        completedAt: new Date(),
      },
    }).catch(() => {});

    // Update order — add output URL
    const order = await prisma.order.findUnique({ where: { id: data.orderId } });
    if (order) {
      await prisma.order.update({
        where: { id: data.orderId },
        data: {
          outputImageUrls: { push: outputUrl },
          cutoutUrls: cutoutUrl ? { push: cutoutUrl } : undefined,
          qaBestScore: result.qaScore > (order.qaBestScore ?? 0) ? result.qaScore : undefined,
        },
      });

      // Check if all images in order are done
      const allJobs = await prisma.imageJob.findMany({
        where: { orderId: data.orderId },
      });

      const allComplete = allJobs.every(
        (j) => j.status === 'completed' || j.status === 'failed',
      );

      if (allComplete) {
        const completedUrls = allJobs
          .filter((j) => j.status === 'completed' && j.outputImageUrl)
          .map((j) => j.outputImageUrl!);

        // Update order status
        await prisma.order.update({
          where: { id: data.orderId },
          data: {
            status: 'completed',
            outputImageUrls: completedUrls,
            processingCompletedAt: new Date(),
          },
        });

        // Send results via WhatsApp
        const user = await prisma.user.findUnique({
          where: { phoneNumber: data.phoneNumber },
        });

        const wa = new WhatsAppClient({
          accessToken: config.WHATSAPP_ACCESS_TOKEN,
          phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
        });

        await sendProcessedImages(
          data.phoneNumber,
          completedUrls,
          (user?.language as 'hi' | 'en') || 'hi',
          user?.name ?? undefined,
          wa,
        );

        log('All images delivered', { count: completedUrls.length });
      }
    }
  } catch (err) {
    log('Image processing failed', { error: String(err) });

    // Update job as failed
    await prisma.imageJob.update({
      where: { id: data.imageJobId },
      data: {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    }).catch(() => {});

    // If all retries exhausted, notify user
    const jobRecord = await prisma.imageJob.findUnique({
      where: { id: data.imageJobId },
    });

    if (jobRecord && jobRecord.attempts >= jobRecord.maxAttempts) {
      const user = await prisma.user.findUnique({
        where: { phoneNumber: data.phoneNumber },
      });
      const lang = (user?.language as 'hi' | 'en') || 'hi';

      const wa = new WhatsAppClient({
        accessToken: config.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
      });

      await wa.sendText(
        data.phoneNumber,
        lang === 'hi'
          ? 'Maaf kijiye, is photo ko process karne mein dikkat aayi. Dobara try karein ya support se baat karein.'
          : 'Sorry, we had trouble processing this photo. Please try again or contact support.',
      );
    }

    throw err; // Let BullMQ handle retries
  }
}

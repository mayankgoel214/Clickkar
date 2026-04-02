/**
 * Shared utility functions for order creation and media handling.
 * Used by images.ts (AWAITING_PHOTO handler).
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { downloadMedia } from '@whatsads/whatsapp';
import type { Session, User } from '@whatsads/db';
import { prisma } from '@whatsads/db';
import { getImageQueue } from '@whatsads/queue';
import { transitionTo } from '../db-helpers.js';
import { msgPhotoReceivedWithPayment, msgProcessingStarted, styleDisplayName } from '../messages.js';
import { PRICE_PER_IMAGE_PAISE, ButtonIds } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Download media from WhatsApp
// ---------------------------------------------------------------------------

export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;
  return downloadMedia(mediaId, accessToken);
}

export function mimeToExt(mimeType: string): string {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  return '.jpg';
}

// ---------------------------------------------------------------------------
// Create order and send payment / start processing
// ---------------------------------------------------------------------------

export interface CreateOrderParams {
  session: Session;
  user: User;
  lang: 'hi' | 'en';
  wa: WhatsAppClient;
  imageStorageUrls: string[];
  imageMediaIds: string[];
  imageCount: number;
  styleId: string;
  voiceInstructions: string | null;
}

export async function createOrderAndSendPayment(params: CreateOrderParams): Promise<void> {
  const { session, user, lang, wa, imageStorageUrls, imageMediaIds, imageCount, styleId, voiceInstructions } = params;
  const phoneNumber = session.phoneNumber;

  const isFreeOrder = user.orderCount === 0;
  const amount = isFreeOrder ? 0 : imageCount * PRICE_PER_IMAGE_PAISE;
  const styleName = styleDisplayName(styleId, lang);

  // Create order
  const order = await prisma.order.create({
    data: {
      phoneNumber,
      imageCount,
      style: styleId,
      voiceInstructions,
      inputImageUrls: imageStorageUrls,
      status: 'payment_pending',
      amount,
      productCategory: user.businessType ?? 'general',
      userId: user.id,
    },
  });

  // Send payment message
  const totalRs = amount / 100;
  await wa.sendText(
    phoneNumber,
    msgPhotoReceivedWithPayment(lang, user.name ?? '', imageCount, styleName, totalRs),
  );

  if (isFreeOrder) {
    // Free order — skip payment, go straight to processing
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'payment_confirmed' },
    });

    await transitionTo(phoneNumber, 'PROCESSING', {
      currentOrderId: order.id,
      styleSelection: styleId,
    });

    await wa.sendText(phoneNumber, msgProcessingStarted(lang));

    // Enqueue image jobs
    await enqueueImageJobs(order.id, phoneNumber, imageStorageUrls, styleId, voiceInstructions, user.businessType ?? undefined);
  } else {
    // Paid order — create payment link
    await transitionTo(phoneNumber, 'AWAITING_PAYMENT', {
      currentOrderId: order.id,
      styleSelection: styleId,
    });

    // TODO: Create Razorpay payment link for paid orders
    // For now in dev, payment is handled by the AWAITING_PAYMENT handler
    await wa.sendText(
      phoneNumber,
      lang === 'hi' ? 'Payment link bhej raha hun...' : 'Sending payment link...',
    );
  }
}

// ---------------------------------------------------------------------------
// Enqueue image processing jobs
// ---------------------------------------------------------------------------

async function enqueueImageJobs(
  orderId: string,
  phoneNumber: string,
  inputImageUrls: string[],
  style: string,
  voiceInstructions: string | null,
  productCategory?: string,
): Promise<void> {
  const queue = getImageQueue();

  for (const inputImageUrl of inputImageUrls) {
    const imageJob = await prisma.imageJob.create({
      data: {
        orderId,
        inputImageUrl,
        style,
        status: 'queued',
      },
    });

    await queue.add('process_image', {
      orderId,
      imageJobId: imageJob.id,
      phoneNumber,
      inputImageUrl,
      style,
      voiceInstructions: voiceInstructions ?? undefined,
      productCategory,
      pipeline: 'primary',
    });

    logger.info('Enqueued image job', { orderId, imageJobId: imageJob.id, phoneNumber });
  }
}

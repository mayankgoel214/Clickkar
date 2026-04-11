/**
 * Shared utility functions for order creation and media handling.
 * Used by images.ts (AWAITING_PHOTO handler).
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { downloadMedia } from '@whatsads/whatsapp';
import type { Session, User } from '@whatsads/db';
import { prisma } from '@whatsads/db';
import { transitionTo } from '../db-helpers.js';
import { msgPhotoReceivedWithPayment, msgProcessingStarted, styleDisplayName } from '../messages.js';
import { PRICE_PER_IMAGE_PAISE, ButtonIds } from '../types.js';
import { sendPaymentLink, enqueueImageJobs } from './payment.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Download media from WhatsApp
// ---------------------------------------------------------------------------

export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? process.env['WHATSAPP_ACCESS_TOKEN'] ?? '';
  if (!accessToken) {
    console.error(JSON.stringify({ event: 'missing_whatsapp_access_token' }));
    throw new Error('WHATSAPP_ACCESS_TOKEN is not configured');
  }
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

  const totalRs = amount / 100;
  const confirmationMsg = msgPhotoReceivedWithPayment(lang, user.name ?? '', imageCount, styleName, totalRs);

  if (isFreeOrder) {
    // Free order — skip payment, set to processing BEFORE enqueuing
    // (worker checks status: 'processing' for delivery — must be set first)
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'processing', processingStartedAt: new Date() },
    });

    await transitionTo(phoneNumber, 'PROCESSING', {
      currentOrderId: order.id,
      styleSelection: styleId,
    });

    const processingMsg = msgProcessingStarted(lang);
    await wa.sendText(phoneNumber, `${confirmationMsg}\n\n${processingMsg}`);

    // Enqueue image jobs using the canonical enqueueImageJobs from payment.ts.
    // Order status is already set to 'processing' above; the canonical function
    // will perform an idempotent update back to 'processing', which is harmless.
    await enqueueImageJobs(order.id, phoneNumber, order);
  } else {
    // Paid order — send confirmation, then create payment link
    await wa.sendText(phoneNumber, confirmationMsg);

    const updatedSession = await transitionTo(phoneNumber, 'AWAITING_PAYMENT', {
      currentOrderId: order.id,
      styleSelection: styleId,
    });

    await sendPaymentLink(updatedSession, user, wa);
  }
}


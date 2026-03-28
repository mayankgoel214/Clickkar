/**
 * AWAITING_PAYMENT handler.
 *
 * - Creates a Razorpay Payment Link (amount computed server-side from DB order).
 * - Sends the link via WhatsApp CTA button.
 * - Enqueues a PaymentCheck delayed job (2 min) as webhook backup.
 * - Random messages while waiting → acknowledge + remind to pay.
 * - onPaymentConfirmed() is called by the webhook handler when payment is captured.
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { prisma } from '@whatsads/db';
import type { Session, User } from '@whatsads/db';
import { createPaymentLink } from '@whatsads/payment';
import { getPaymentCheckQueue, getImageQueue } from '@whatsads/queue';
import { transitionTo } from '../db-helpers.js';
import {
  msgPaymentRequest,
  msgPaymentPending,
  msgPaymentConfirmed,
  msgProcessingStarted,
  msgGenericError,
} from '../messages.js';
import { PAYMENT_CHECK_DELAY_MS } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAwaitingPayment(
  session: Session,
  user: User,
  message: MessageContext,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;

  // ---- Internal trigger: send the payment link ----
  if (message.buttonReplyId === '__send_payment_link') {
    await sendPaymentLink(session, user, waClient);
    return;
  }

  // ---- User messaged while payment is pending → remind ----
  await waClient.sendButtons(
    phoneNumber,
    msgPaymentPending(lang),
    [
      { id: 'resend_link', title: lang === 'hi' ? 'Link dobara bhejo' : 'Resend Link' },
      { id: 'cancel_order', title: lang === 'hi' ? 'Cancel' : 'Cancel' },
    ],
  );

  if (message.buttonReplyId === 'resend_link') {
    await sendPaymentLink(session, user, waClient);
  } else if (message.buttonReplyId === 'cancel_order') {
    await transitionTo(phoneNumber, 'IDLE', { currentOrderId: null });
    await waClient.sendText(
      phoneNumber,
      lang === 'hi'
        ? 'Order cancel ho gaya. Jab bhi ready hon, wapas aa jaana! 😊'
        : 'Order cancelled. Come back whenever you are ready! 😊',
    );
  }
}

// ---------------------------------------------------------------------------
// Called by the Razorpay webhook handler when payment.captured fires
// ---------------------------------------------------------------------------

export async function onPaymentConfirmed(
  orderId: string,
  razorpayPaymentId: string,
  waClient: WhatsAppClient,
): Promise<void> {
  // Load order and session
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    logger.error('onPaymentConfirmed: order not found', { orderId });
    return;
  }

  const phoneNumber = order.phoneNumber;
  const user = await prisma.user.findUnique({ where: { phoneNumber } });
  if (!user) {
    logger.error('onPaymentConfirmed: user not found', { phoneNumber });
    return;
  }

  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';

  try {
    // Update order and session atomically
    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'payment_confirmed',
          razorpayPaymentId,
        },
      }),
      prisma.session.update({
        where: { phoneNumber },
        data: {
          state: 'PROCESSING',
          stateEnteredAt: new Date(),
        },
      }),
    ]);

    await waClient.sendText(phoneNumber, msgPaymentConfirmed(lang));
    await waClient.sendText(phoneNumber, msgProcessingStarted(lang));

    // Enqueue one ImageProcessing job per image
    const imageQueue = getImageQueue();
    const imageJobs = order.inputImageUrls.map((url, i) => ({
      name: 'process_image',
      data: {
        orderId: order.id,
        imageJobId: '', // Will be set after ImageJob row creation
        phoneNumber,
        inputImageUrl: url,
        style: order.style ?? 'style_clean_white',
        voiceInstructions: order.voiceInstructions ?? undefined,
        productCategory: order.productCategory ?? undefined,
        pipeline: 'primary' as const,
      },
    }));

    // Create ImageJob rows first, then enqueue
    for (let i = 0; i < order.inputImageUrls.length; i++) {
      const url = order.inputImageUrls[i];
      if (!url) continue;

      const imageJob = await prisma.imageJob.create({
        data: {
          orderId: order.id,
          inputImageUrl: url,
          style: order.style ?? 'style_clean_white',
          status: 'queued',
        },
      });

      await imageQueue.add('process_image', {
        orderId: order.id,
        imageJobId: imageJob.id,
        phoneNumber,
        inputImageUrl: url,
        style: order.style ?? 'style_clean_white',
        voiceInstructions: order.voiceInstructions ?? undefined,
        productCategory: order.productCategory ?? undefined,
        pipeline: 'primary',
      });
    }

    logger.info('Image processing jobs enqueued', {
      orderId,
      imageCount: order.inputImageUrls.length,
    });

    // Update order to processing status
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'processing', processingStartedAt: new Date() },
    });
  } catch (err) {
    logger.error('onPaymentConfirmed failed', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    await waClient.sendText(phoneNumber, msgGenericError(lang));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendPaymentLink(
  session: Session,
  user: User,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;

  if (!session.currentOrderId) {
    logger.error('sendPaymentLink: no currentOrderId on session', { phoneNumber });
    await waClient.sendText(phoneNumber, msgGenericError(lang));
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: session.currentOrderId } });
  if (!order) {
    logger.error('sendPaymentLink: order not found', { orderId: session.currentOrderId });
    await waClient.sendText(phoneNumber, msgGenericError(lang));
    return;
  }

  // If we already created a payment link, reuse it
  if (order.razorpayPaymentLinkUrl) {
    await waClient.sendPaymentLink(
      phoneNumber,
      msgPaymentRequest(lang, order.amount / 100),
      order.razorpayPaymentLinkUrl,
      lang === 'hi' ? 'Payment karo' : 'Pay Now',
    );
    return;
  }

  try {
    const link = await createPaymentLink({
      orderId: order.id,
      customerPhone: phoneNumber,
      customerName: user.name ?? undefined,
      amount: order.amount, // paise — from DB, never client-provided
      description: `WhatsAds - ${order.imageCount} photo(s)`,
      expiresInMinutes: 30,
    });

    // Persist link details
    await prisma.order.update({
      where: { id: order.id },
      data: {
        razorpayPaymentLinkId: link.id,
        razorpayPaymentLinkUrl: link.shortUrl,
      },
    });

    await waClient.sendPaymentLink(
      phoneNumber,
      msgPaymentRequest(lang, order.amount / 100),
      link.shortUrl,
      lang === 'hi' ? 'Payment karo' : 'Pay Now',
    );

    // Enqueue payment check job as webhook fallback (2-minute delay)
    await schedulePaymentCheck(order.id, phoneNumber, link.id);

    logger.info('Payment link sent', {
      phoneNumber,
      orderId: order.id,
      linkId: link.id,
    });
  } catch (err) {
    logger.error('createPaymentLink failed', {
      phoneNumber,
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await waClient.sendText(phoneNumber, msgGenericError(lang));
  }
}

async function schedulePaymentCheck(
  orderId: string,
  phoneNumber: string,
  paymentLinkId: string,
): Promise<void> {
  try {
    const queue = getPaymentCheckQueue();
    await queue.add(
      'check_payment',
      {
        orderId,
        phoneNumber,
        paymentLinkId,
        attempt: 0,
      },
      {
        delay: PAYMENT_CHECK_DELAY_MS,
        jobId: `payment_check_${orderId}`,
        attempts: 5,
      },
    );
  } catch (err) {
    // Non-fatal — webhook is the primary confirmation path
    logger.warn('Failed to schedule payment check job', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

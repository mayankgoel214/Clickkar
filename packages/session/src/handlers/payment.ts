/**
 * AWAITING_PAYMENT handler — V2 streamlined flow.
 *
 * - Creates a Razorpay Payment Link (amount from DB order — never client-supplied).
 * - Sends the link via WhatsApp CTA button.
 * - Enqueues a PaymentCheck delayed job (2 min) as webhook backup.
 * - onPaymentConfirmed() is called by the Razorpay webhook when payment.captured fires.
 * - enqueueImageJobs() is shared with free-trial path (called by instructions.ts).
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { prisma } from '@whatsads/db';
import type { Session, User, Order } from '@whatsads/db';
import { createPaymentLink } from '@whatsads/payment';
import { getPaymentCheckQueue, getImageQueue } from '@whatsads/queue';
import { transitionTo } from '../db-helpers.js';
import {
  msgPaymentPending,
  msgPaymentConfirmed,
  msgProcessingStarted,
  msgGenericError,
} from '../messages.js';
import { PAYMENT_CHECK_DELAY_MS, ButtonIds } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAwaitingPayment(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;

  // ---- Internal trigger: send the payment link ----
  if (message.buttonReplyId === '__send_payment_link') {
    await sendPaymentLink(session, user, wa);
    return;
  }

  // ---- User tapped "Resend Link" ----
  if (message.buttonReplyId === 'resend_link') {
    await sendPaymentLink(session, user, wa);
    return;
  }

  // ---- User tapped "Cancel Order" ----
  if (message.buttonReplyId === ButtonIds.CANCEL_ORDER || message.buttonReplyId === 'cancel_order') {
    await transitionTo(phoneNumber, 'IDLE', { currentOrderId: null });
    await wa.sendText(
      phoneNumber,
      lang === 'hi'
        ? 'Order cancel ho gaya. Jab bhi ready hon, wapas aa jaana!'
        : 'Order cancelled. Come back whenever you are ready!',
    );
    return;
  }

  // ---- User messaged while payment is pending → remind ----
  await wa.sendButtons(
    phoneNumber,
    msgPaymentPending(lang),
    [
      { id: 'resend_link', title: lang === 'hi' ? 'Link dobara bhejo' : 'Resend Link' },
      { id: ButtonIds.CANCEL_ORDER, title: lang === 'hi' ? 'Cancel' : 'Cancel' },
    ],
  );
}

// ---------------------------------------------------------------------------
// Called by the Razorpay webhook handler when payment.captured fires
// ---------------------------------------------------------------------------

export async function onPaymentConfirmed(
  orderId: string,
  razorpayPaymentId: string,
  wa: WhatsAppClient,
): Promise<void> {
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
    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: { status: 'payment_confirmed', razorpayPaymentId },
      }),
      prisma.session.update({
        where: { phoneNumber },
        data: { state: 'PROCESSING', stateEnteredAt: new Date() },
      }),
    ]);

    await wa.sendText(phoneNumber, msgPaymentConfirmed(lang));
    await wa.sendText(phoneNumber, msgProcessingStarted(lang));

    await enqueueImageJobs(orderId, phoneNumber, order);
  } catch (err) {
    logger.error('onPaymentConfirmed failed', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    await wa.sendText(phoneNumber, msgGenericError(lang));
  }
}

// ---------------------------------------------------------------------------
// Enqueue image processing jobs (shared: used by payment confirmation + free trial)
// ---------------------------------------------------------------------------

export async function enqueueImageJobs(
  orderId: string,
  phoneNumber: string,
  order: Order,
): Promise<void> {
  const imageQueue = getImageQueue();

  for (const url of order.inputImageUrls) {
    const imageJob = await prisma.imageJob.create({
      data: {
        orderId,
        inputImageUrl: url,
        style: order.style ?? 'style_clean_white',
        status: 'queued',
      },
    });

    await imageQueue.add('process_image', {
      orderId,
      imageJobId: imageJob.id,
      phoneNumber,
      inputImageUrl: url,
      style: order.style ?? 'style_clean_white',
      voiceInstructions: order.voiceInstructions ?? undefined,
      productCategory: order.productCategory ?? undefined,
      pipeline: 'primary',
    });
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'processing', processingStartedAt: new Date() },
  });

  logger.info('Image processing jobs enqueued', {
    orderId,
    imageCount: order.inputImageUrls.length,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendPaymentLink(
  session: Session,
  user: User,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;

  if (!session.currentOrderId) {
    logger.error('sendPaymentLink: no currentOrderId on session', { phoneNumber });
    await wa.sendText(phoneNumber, msgGenericError(lang));
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: session.currentOrderId } });
  if (!order) {
    logger.error('sendPaymentLink: order not found', { orderId: session.currentOrderId });
    await wa.sendText(phoneNumber, msgGenericError(lang));
    return;
  }

  // Reuse existing link if already created
  if (order.razorpayPaymentLinkUrl) {
    await wa.sendPaymentLink(
      phoneNumber,
      lang === 'hi'
        ? `${order.imageCount} photo • Rs ${order.amount / 100}\nPayment karein:`
        : `${order.imageCount} photo(s) • Rs ${order.amount / 100}\nPay to get started:`,
      order.razorpayPaymentLinkUrl,
      lang === 'hi' ? 'Payment karo' : 'Pay Now',
    );
    return;
  }

  // DEV MODE: skip payment and auto-confirm
  if (process.env.NODE_ENV !== 'production') {
    logger.info('DEV MODE: Skipping payment, auto-confirming order', { phoneNumber, orderId: order.id });
    await wa.sendText(
      phoneNumber,
      lang === 'hi'
        ? 'Dev mode: Payment skip ho gaya. Processing shuru ho rahi hai...'
        : 'Dev mode: Payment skipped. Starting processing...',
    );
    await onPaymentConfirmed(order.id, 'dev_payment_' + Date.now(), wa);
    return;
  }

  try {
    const link = await createPaymentLink({
      orderId: order.id,
      customerPhone: phoneNumber,
      customerName: user.name ?? undefined,
      amount: order.amount, // paise — always from DB, never client-provided
      description: `Clickkar - ${order.imageCount} photo(s)`,
      expiresInMinutes: 30,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        razorpayPaymentLinkId: link.id,
        razorpayPaymentLinkUrl: link.shortUrl,
        status: 'payment_pending',
      },
    });

    await wa.sendPaymentLink(
      phoneNumber,
      lang === 'hi'
        ? `${order.imageCount} photo • Rs ${order.amount / 100}\nPayment karein:`
        : `${order.imageCount} photo(s) • Rs ${order.amount / 100}\nPay to get started:`,
      link.shortUrl,
      lang === 'hi' ? 'Payment karo' : 'Pay Now',
    );

    await schedulePaymentCheck(order.id, phoneNumber, link.id);

    logger.info('Payment link sent', { phoneNumber, orderId: order.id, linkId: link.id });
  } catch (err) {
    logger.error('createPaymentLink failed', {
      phoneNumber,
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await wa.sendText(phoneNumber, msgGenericError(lang));
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
      { orderId, phoneNumber, paymentLinkId, attempt: 0 },
      {
        delay: PAYMENT_CHECK_DELAY_MS,
        jobId: `payment_check_${orderId}`,
        attempts: 5,
      },
    );
  } catch (err) {
    logger.warn('Failed to schedule payment check job', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

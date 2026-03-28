/**
 * Payment status polling job.
 *
 * Backup for Razorpay webhook delays — polls payment link status
 * and triggers order processing if payment was captured.
 */

import type { Job } from 'bullmq';
import { prisma } from '@whatsads/db';
import { pollPaymentStatus } from '@whatsads/payment';
import { WhatsAppClient } from '@whatsads/whatsapp';
import { onPaymentConfirmed } from '@whatsads/session';
import { getPaymentCheckQueue, PaymentCheckJobDataSchema } from '@whatsads/queue';
import { getConfig } from '../config.js';

export async function processPaymentCheck(job: Job): Promise<void> {
  const config = getConfig();
  const data = PaymentCheckJobDataSchema.parse(job.data);

  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(JSON.stringify({ job: job.id, orderId: data.orderId, msg, ...extra }));

  log('Checking payment status', { attempt: data.attempt });

  // Check if payment already processed
  const order = await prisma.order.findUnique({ where: { id: data.orderId } });
  if (!order) {
    log('Order not found, skipping');
    return;
  }

  if (order.status !== 'payment_pending') {
    log('Order no longer pending, skipping', { status: order.status });
    return;
  }

  // Poll Razorpay
  const status = await pollPaymentStatus(data.paymentLinkId);

  if (status.status === 'paid' && status.paymentId) {
    log('Payment confirmed via polling');

    // Check idempotency
    const existing = await prisma.payment.findUnique({
      where: { razorpayPaymentId: status.paymentId },
    });

    if (!existing) {
      // Create payment record
      await prisma.payment.create({
        data: {
          orderId: order.id,
          razorpayPaymentId: status.paymentId,
          razorpayPaymentLinkId: data.paymentLinkId,
          amount: order.amount,
          status: 'captured',
          capturedAt: new Date(),
        },
      });

      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'payment_confirmed',
          razorpayPaymentId: status.paymentId,
        },
      });

      const wa = new WhatsAppClient({
        accessToken: config.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
      });

      await onPaymentConfirmed(data.phoneNumber, order.id, wa);
    }
    return;
  }

  // Not paid yet — re-enqueue if under max attempts (10 attempts × 30s = 5 min total)
  if (data.attempt < 10) {
    const queue = getPaymentCheckQueue();
    await queue.add(
      'payment-check',
      { ...data, attempt: data.attempt + 1 },
      { delay: 30_000 },
    );
    log('Re-enqueued payment check', { nextAttempt: data.attempt + 1 });
  } else {
    log('Max polling attempts reached, giving up');
  }
}

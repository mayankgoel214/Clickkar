/**
 * Razorpay webhook route.
 *
 * POST /webhooks/razorpay — Handles payment_link.paid events
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyRazorpaySignature, parsePaymentLinkPaidEvent } from '@whatsads/payment';
import { prisma } from '@whatsads/db';
import { WhatsAppClient } from '@whatsads/whatsapp';
import { onPaymentConfirmed } from '@whatsads/session';
import { getConfig } from '../../config.js';

export async function razorpayWebhookRoutes(app: FastifyInstance): Promise<void> {
  const config = getConfig();

  app.post('/webhooks/razorpay', async (req: FastifyRequest, reply: FastifyReply) => {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = (req as any).rawBody as string | undefined;

    if (!signature || !rawBody) {
      return reply.code(400).send('Missing signature');
    }

    // Verify signature — MUST use raw body, not re-serialized JSON
    if (!verifyRazorpaySignature(rawBody, signature, config.RAZORPAY_WEBHOOK_SECRET)) {
      app.log.warn('Invalid Razorpay webhook signature');
      return reply.code(400).send('Invalid signature');
    }

    // Return 200 immediately
    reply.code(200).send('OK');

    try {
      const body = req.body as any;

      // Store raw event
      await prisma.webhookEvent.create({
        data: {
          source: 'razorpay',
          eventType: body.event,
          rawPayload: body,
        },
      }).catch((err) => app.log.error({ err }, 'Failed to store webhook event'));

      // Only handle payment_link.paid
      if (body.event !== 'payment_link.paid') {
        return;
      }

      const event = parsePaymentLinkPaidEvent(body);
      if (!event) {
        app.log.warn('Could not parse payment_link.paid event');
        return;
      }

      // Idempotency check — skip if payment already recorded
      const existingPayment = await prisma.payment.findUnique({
        where: { razorpayPaymentId: event.paymentId },
      });
      if (existingPayment) {
        app.log.info({ paymentId: event.paymentId }, 'Duplicate payment webhook, skipping');
        return;
      }

      // Find order by payment link ID
      const order = await prisma.order.findFirst({
        where: { razorpayPaymentLinkId: event.paymentLinkId },
      });

      if (!order) {
        app.log.error({ paymentLinkId: event.paymentLinkId }, 'Order not found for payment');
        return;
      }

      // Create payment record
      await prisma.payment.create({
        data: {
          orderId: order.id,
          razorpayPaymentId: event.paymentId,
          razorpayPaymentLinkId: event.paymentLinkId,
          amount: event.amount,
          method: event.method,
          status: 'captured',
          capturedAt: new Date(),
        },
      });

      // Update order status
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'payment_confirmed',
          razorpayPaymentId: event.paymentId,
        },
      });

      // Create WhatsApp client and trigger session flow
      const wa = new WhatsAppClient({
        accessToken: config.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
      });

      await onPaymentConfirmed(order.phoneNumber, order.id, wa);
    } catch (err) {
      app.log.error({ err }, 'Razorpay webhook processing error');
    }
  });
}

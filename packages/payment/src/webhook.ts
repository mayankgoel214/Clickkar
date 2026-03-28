import crypto from 'crypto';
import type { RazorpayWebhookEvent } from './types';

/**
 * Verifies a Razorpay webhook signature using HMAC-SHA256.
 *
 * CRITICAL: rawBody MUST be the original, unmodified request body bytes —
 * NOT re-serialized JSON. Any whitespace or key-ordering change will break the
 * signature. In Next.js API routes, read the body with `req.text()` (App Router)
 * or disable body parsing and use `req.read()` (Pages Router).
 *
 * Uses `timingSafeEqual` to prevent timing-oracle attacks.
 */
export function verifyRazorpaySignature(
  rawBody: string | Buffer,
  signature: string,
  secret: string
): boolean {
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  // Both buffers must be the same length for timingSafeEqual.
  // If lengths differ the signature is definitely wrong; return false without
  // leaking information via a thrown exception.
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(signature, 'hex');

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

export interface ParsedPaymentLinkPaidEvent {
  paymentLinkId: string;
  paymentId: string;
  /** Amount in paise */
  amount: number;
  /** Payment method e.g. "upi", "card", "netbanking" */
  method: string;
  /** Maps to our internal order ID (stored as reference_id on the payment link) */
  orderId: string;
}

/**
 * Extracts key fields from a payment_link.paid webhook payload.
 *
 * Throws if required fields are missing so the caller can return a 400
 * and avoid silently processing a malformed event.
 */
export function parsePaymentLinkPaidEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
): ParsedPaymentLinkPaidEvent {
  const event = body as RazorpayWebhookEvent;

  if (event.event !== 'payment_link.paid') {
    throw new Error(
      `Expected event "payment_link.paid", got "${event.event}"`
    );
  }

  const linkEntity = event.payload?.payment_link?.entity;
  if (!linkEntity) {
    throw new Error('Missing payload.payment_link.entity in webhook body');
  }

  const paymentEntity = event.payload?.payment?.entity;
  if (!paymentEntity) {
    throw new Error('Missing payload.payment.entity in webhook body');
  }

  const { id: paymentLinkId, reference_id: orderId, amount } = linkEntity;
  const { id: paymentId, method } = paymentEntity;

  if (!paymentLinkId) throw new Error('Missing payment_link.entity.id');
  if (!orderId) throw new Error('Missing payment_link.entity.reference_id');
  if (!paymentId) throw new Error('Missing payment.entity.id');
  if (!method) throw new Error('Missing payment.entity.method');

  return {
    paymentLinkId,
    paymentId,
    amount,
    method,
    orderId,
  };
}

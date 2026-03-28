import { getRazorpayClient } from './client';
import type { PaymentLinkStatus } from './types';

export interface PaymentLinkStatusResult {
  status: PaymentLinkStatus;
  /** Razorpay payment ID — only present when status is "paid" */
  paymentId?: string;
  /** Unix timestamp (seconds) of when the payment was captured */
  paidAt?: number;
}

/**
 * Fetches the current status of a Razorpay Payment Link.
 *
 * Use this as a fallback when a webhook has not been delivered within the
 * expected window. For UPI payments, webhooks are typically delivered within
 * seconds; polling beyond 5 minutes is not necessary.
 *
 * Do NOT call this in a tight loop — add appropriate back-off between polls.
 */
export async function pollPaymentStatus(
  paymentLinkId: string
): Promise<PaymentLinkStatusResult> {
  if (!paymentLinkId) {
    throw new Error('paymentLinkId is required');
  }

  const client = getRazorpayClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const razorpay = client as any;

  let link: Record<string, unknown>;

  try {
    link = (await razorpay.paymentLink.fetch(paymentLinkId)) as Record<
      string,
      unknown
    >;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown Razorpay error';
    throw new Error(
      `Failed to fetch Payment Link "${paymentLinkId}": ${message}`
    );
  }

  const status = link['status'] as PaymentLinkStatus;

  if (status !== 'paid') {
    return { status };
  }

  // Extract payment details from the payments array on the link.
  const payments = link['payments'] as
    | Array<Record<string, unknown>>
    | null
    | undefined;

  const successfulPayment = payments?.find(
    (p) => p['status'] === 'captured' || p['status'] === 'authorized'
  );

  const paymentId = successfulPayment?.['razorpay_payment_id'] as
    | string
    | undefined;
  const paidAt = successfulPayment?.['created_at'] as number | undefined;

  return { status, paymentId, paidAt };
}

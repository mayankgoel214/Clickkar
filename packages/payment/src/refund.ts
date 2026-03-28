import { getRazorpayClient } from './client';

export interface RefundResult {
  refundId: string;
  /** Razorpay refund status: "pending" | "processed" | "failed" */
  status: string;
}

/**
 * Issues a refund for a captured Razorpay payment.
 *
 * Partial refunds are supported — pass the exact paise amount to refund.
 * For a full refund, pass the full original payment amount.
 *
 * Speed is set to "optimum" which attempts instant refunds when supported
 * by the bank/UPI handle, falling back to normal (5-7 business days).
 */
export async function issueRefund(
  razorpayPaymentId: string,
  amountPaise: number,
  reason: string
): Promise<RefundResult> {
  if (!razorpayPaymentId) {
    throw new Error('razorpayPaymentId is required');
  }

  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error('amountPaise must be a positive integer');
  }

  if (!reason || reason.trim().length === 0) {
    throw new Error('reason is required');
  }

  const client = getRazorpayClient();

  let refund: Record<string, unknown>;

  try {
    refund = (await client.payments.refund(razorpayPaymentId, {
      amount: amountPaise,
      speed: 'optimum',
      notes: {
        reason: reason.trim(),
      },
    })) as unknown as Record<string, unknown>;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown Razorpay error';
    throw new Error(
      `Failed to issue refund for payment "${razorpayPaymentId}": ${message}`
    );
  }

  if (!refund['id']) {
    throw new Error(
      `Razorpay refund returned unexpected response: ${JSON.stringify(refund)}`
    );
  }

  return {
    refundId: refund['id'] as string,
    status: (refund['status'] as string) ?? 'pending',
  };
}

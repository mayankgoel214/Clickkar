import { z } from 'zod';
import { getRazorpayClient } from './client';
import type { CreatePaymentLinkParams } from './types';

const DEFAULT_EXPIRES_IN_MINUTES = 30;
const DEFAULT_DESCRIPTION = 'WhatsAds - Professional Product Photo';

const CreatePaymentLinkSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  customerPhone: z
    .string()
    .regex(/^\d{10,15}$/, 'customerPhone must be digits only, e.g. "919876543210"'),
  customerName: z.string().optional(),
  amount: z
    .number()
    .int('amount must be an integer (paise)')
    .min(100, 'amount must be at least 100 paise (Rs 1)'),
  description: z.string().optional(),
  expiresInMinutes: z.number().int().positive().optional(),
});

export interface CreatedPaymentLink {
  id: string;
  shortUrl: string;
  /** Amount in paise */
  amount: number;
  /** Unix timestamp (seconds) when the link expires */
  expiresAt: number;
}

/**
 * Creates a Razorpay Payment Link.
 *
 * - Sets reference_id to orderId for idempotent deduplication.
 * - Enables upi_link for UPI-first experience (best conversion in India).
 * - Skips SMS/email notifications — WhatsAds delivers the link via WhatsApp.
 * - Amount is NEVER taken from the client; always pass from verified server state.
 */
export async function createPaymentLink(
  params: CreatePaymentLinkParams
): Promise<CreatedPaymentLink> {
  const parsed = CreatePaymentLinkSchema.safeParse(params);
  if (!parsed.success) {
    throw new Error(`Invalid payment link params: ${parsed.error.message}`);
  }

  const {
    orderId,
    customerPhone,
    customerName,
    amount,
    description,
    expiresInMinutes,
  } = parsed.data;

  const expiryMinutes = expiresInMinutes ?? DEFAULT_EXPIRES_IN_MINUTES;
  const expireBy = Math.floor(Date.now() / 1000) + expiryMinutes * 60;

  const client = getRazorpayClient();

  // Razorpay SDK types don't expose paymentLinks natively in all versions,
  // so we cast to any and rely on the underlying HTTP call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const razorpay = client as any;

  const callbackUrl = process.env.RAZORPAY_CALLBACK_URL;

  const payload: Record<string, unknown> = {
    amount,
    currency: 'INR',
    accept_partial: false,
    reference_id: orderId,
    description: description ?? DEFAULT_DESCRIPTION,
    customer: {
      contact: `+${customerPhone}`,
      ...(customerName ? { name: customerName } : {}),
    },
    notify: {
      sms: false,
      email: false,
    },
    reminder_enable: false,
    upi_link: true,
    expire_by: expireBy,
  };

  if (callbackUrl) {
    payload['callback_url'] = callbackUrl;
    payload['callback_method'] = 'get';
  }

  let response: Record<string, unknown>;

  try {
    response = (await razorpay.paymentLink.create(payload)) as Record<
      string,
      unknown
    >;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown Razorpay error';
    throw new Error(`Failed to create Razorpay Payment Link: ${message}`);
  }

  if (!response['id'] || !response['short_url']) {
    throw new Error(
      `Razorpay Payment Link creation returned unexpected response: ${JSON.stringify(response)}`
    );
  }

  return {
    id: response['id'] as string,
    shortUrl: response['short_url'] as string,
    amount: response['amount'] as number,
    expiresAt: expireBy,
  };
}

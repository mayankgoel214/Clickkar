export type PaymentLinkStatus =
  | 'created'
  | 'paid'
  | 'partially_paid'
  | 'expired'
  | 'cancelled';

export interface CreatePaymentLinkParams {
  /** Internal order ID used as the Razorpay reference_id for deduplication */
  orderId: string;
  /** Customer phone in E.164 format without '+', e.g. "919876543210" */
  customerPhone: string;
  customerName?: string;
  /** Amount in paise. Rs 99 = 9900 paise. */
  amount: number;
  description?: string;
  /** How long until the link expires. Defaults to 30 minutes. */
  expiresInMinutes?: number;
}

export interface PaymentLinkResponse {
  /** Razorpay Payment Link ID, e.g. "plink_AbCdEf123456" */
  id: string;
  /** Short URL to share with the customer */
  short_url: string;
  /** Amount in paise */
  amount: number;
  status: PaymentLinkStatus;
}

// ---------------------------------------------------------------------------
// Razorpay webhook types
// ---------------------------------------------------------------------------

interface RazorpayWebhookPaymentLinkEntity {
  id: string;
  /** Paise */
  amount: number;
  amount_paid: number;
  currency: string;
  status: PaymentLinkStatus;
  /** Maps to our internal order ID */
  reference_id: string;
  short_url: string;
  expire_by: number;
  created_at: number;
  updated_at: number;
  customer: {
    contact: string;
    name?: string;
    email?: string;
  };
  payments: RazorpayWebhookPaymentItem[] | null;
}

interface RazorpayWebhookPaymentItem {
  razorpay_payment_id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  created_at: number;
}

/** Webhook payload shape for the payment_link.paid event */
export interface RazorpayWebhookEvent {
  entity: 'event';
  account_id: string;
  event: 'payment_link.paid';
  contains: string[];
  payload: {
    payment_link: {
      entity: RazorpayWebhookPaymentLinkEntity;
    };
    payment?: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        method: string;
        order_id?: string;
        description?: string;
        created_at: number;
      };
    };
  };
  created_at: number;
}

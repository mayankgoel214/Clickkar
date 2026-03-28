import { z } from "zod";

// ---------------------------------------------------------------------------
// Image Processing Job
// ---------------------------------------------------------------------------

export const ImageProcessingJobDataSchema = z.object({
  orderId: z.string().uuid(),
  imageJobId: z.string().uuid(),
  phoneNumber: z.string().min(10),
  inputImageUrl: z.string().url(),
  style: z.string().min(1),
  voiceInstructions: z.string().optional(),
  productCategory: z.string().optional(),
  pipeline: z.enum(["primary", "fallback"]).default("primary"),
});

export type ImageProcessingJobData = z.infer<typeof ImageProcessingJobDataSchema>;

// ---------------------------------------------------------------------------
// Payment Check Job
// ---------------------------------------------------------------------------

export const PaymentCheckJobDataSchema = z.object({
  orderId: z.string().uuid(),
  phoneNumber: z.string().min(10),
  paymentLinkId: z.string().min(1),
  attempt: z.number().int().nonnegative(),
});

export type PaymentCheckJobData = z.infer<typeof PaymentCheckJobDataSchema>;

// ---------------------------------------------------------------------------
// Session Timeout Job
// ---------------------------------------------------------------------------

export const SessionTimeoutJobDataSchema = z.object({
  phoneNumber: z.string().min(10),
  expectedState: z.string().min(1),
  action: z.enum(["nudge", "expire", "advance_images"]),
});

export type SessionTimeoutJobData = z.infer<typeof SessionTimeoutJobDataSchema>;

// ---------------------------------------------------------------------------
// Union helpers — useful for worker type narrowing
// ---------------------------------------------------------------------------

export type AnyJobData =
  | ImageProcessingJobData
  | PaymentCheckJobData
  | SessionTimeoutJobData;

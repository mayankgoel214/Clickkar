/**
 * Removed in V2 streamlined flow.
 *
 * The CONFIRMING state has been eliminated. Order creation now happens
 * directly from the AWAITING_PHOTO → createOrderAndSendPayment() path
 * in instructions.ts, without requiring a separate confirmation step.
 */

import type {
  WhatsAppWebhookBody,
  WhatsAppWebhookValue,
  WhatsAppMessage,
  WhatsAppContact,
  WhatsAppStatus,
} from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Pull the first value object out of a webhook body, or null if malformed. */
function extractValue(body: WhatsAppWebhookBody): WhatsAppWebhookValue | null {
  return body.entry?.[0]?.changes?.[0]?.value ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExtractedMessage {
  message: WhatsAppMessage;
  contact: WhatsAppContact | null;
  /** The phone number ID that received the message (use to reply). */
  phoneNumberId: string;
}

/**
 * Extract the first inbound message from a webhook payload.
 *
 * WhatsApp batches at most one message per webhook call in practice, but the
 * spec allows multiple. This function returns the first one only.
 *
 * Returns null when the payload contains no messages (e.g. status-only events).
 */
export function extractMessage(
  body: WhatsAppWebhookBody
): ExtractedMessage | null {
  const value = extractValue(body);
  if (!value) return null;

  const message = value.messages?.[0];
  if (!message) return null;

  const contact = value.contacts?.[0] ?? null;
  const phoneNumberId = value.metadata.phone_number_id;

  return { message, contact, phoneNumberId };
}

export interface ExtractedStatus {
  status: WhatsAppStatus;
  /** The phone number ID associated with this account. */
  phoneNumberId: string;
}

/**
 * Extract the first delivery/read status update from a webhook payload.
 *
 * Returns null when the payload contains no status updates (e.g. message-only
 * events). Use this to track sent message delivery receipts.
 */
export function extractStatus(
  body: WhatsAppWebhookBody
): ExtractedStatus | null {
  const value = extractValue(body);
  if (!value) return null;

  const status = value.statuses?.[0];
  if (!status) return null;

  return { status, phoneNumberId: value.metadata.phone_number_id };
}

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "interactive"
  | "unknown";

/**
 * Identify the type of an incoming message for use in a switch/dispatch.
 *
 * Returns 'unknown' for any type not explicitly handled so callers can
 * safely ignore unsupported message types without crashing.
 */
export function getMessageType(message: WhatsAppMessage): MessageType {
  const known: MessageType[] = [
    "text",
    "image",
    "audio",
    "video",
    "document",
    "sticker",
    "location",
    "contacts",
    "interactive",
  ];

  if (known.includes(message.type as MessageType)) {
    return message.type as MessageType;
  }

  return "unknown";
}

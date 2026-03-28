/**
 * TypeScript types for Meta WhatsApp Cloud API v21.0
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference
 */

// ---------------------------------------------------------------------------
// Webhook payload types (incoming from Meta)
// ---------------------------------------------------------------------------

/** Top-level webhook payload delivered by Meta to your endpoint. */
export interface WhatsAppWebhookBody {
  object: "whatsapp_business_account";
  entry: WhatsAppWebhookEntry[];
}

/** One entry per WhatsApp Business Account in the payload. */
export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

/** A single change event within an entry. */
export interface WhatsAppWebhookChange {
  value: WhatsAppWebhookValue;
  field: "messages";
}

/** The actual payload for a message or status change. */
export interface WhatsAppWebhookValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    /** The phone number ID that received the message. */
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
  errors?: WhatsAppError[];
}

/** Contact info attached to incoming messages. */
export interface WhatsAppContact {
  profile: {
    name: string;
  };
  /** WhatsApp ID — same as the sender's phone number in E.164 without the '+'. */
  wa_id: string;
}

// ---------------------------------------------------------------------------
// Incoming message types
// ---------------------------------------------------------------------------

/** Discriminated union of all possible incoming message shapes. */
export type WhatsAppMessage =
  | TextMessage
  | ImageMessage
  | AudioMessage
  | VideoMessage
  | DocumentMessage
  | InteractiveMessage
  | StickerMessage
  | LocationMessage
  | ContactsMessage
  | UnknownMessage;

interface WhatsAppMessageBase {
  /** Sender's phone number (E.164 without '+'). */
  from: string;
  /** Unique message ID assigned by Meta. */
  id: string;
  /** Unix timestamp (seconds) when the message was sent. */
  timestamp: string;
}

export interface TextMessage extends WhatsAppMessageBase {
  type: "text";
  text: {
    body: string;
    /** Present when the user quotes a previous message. */
    preview_url?: boolean;
  };
}

export interface ImageMessage extends WhatsAppMessageBase {
  type: "image";
  image: {
    /** Media ID — use downloadMedia() to fetch the binary. */
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
}

export interface AudioMessage extends WhatsAppMessageBase {
  type: "audio";
  audio: {
    id: string;
    mime_type: string;
    sha256: string;
    /** True when the audio was recorded via the WhatsApp microphone (voice note). */
    voice: boolean;
  };
}

export interface VideoMessage extends WhatsAppMessageBase {
  type: "video";
  video: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
}

export interface DocumentMessage extends WhatsAppMessageBase {
  type: "document";
  document: {
    id: string;
    mime_type: string;
    sha256: string;
    filename?: string;
    caption?: string;
  };
}

export interface StickerMessage extends WhatsAppMessageBase {
  type: "sticker";
  sticker: {
    id: string;
    mime_type: string;
    sha256: string;
    animated: boolean;
  };
}

export interface LocationMessage extends WhatsAppMessageBase {
  type: "location";
  location: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

export interface ContactsMessage extends WhatsAppMessageBase {
  type: "contacts";
  contacts: Array<{
    name: { formatted_name: string };
    phones?: Array<{ phone: string; type?: string }>;
  }>;
}

/** Button or list reply from an interactive message. */
export interface InteractiveMessage extends WhatsAppMessageBase {
  type: "interactive";
  interactive:
    | {
        type: "button_reply";
        button_reply: ButtonReply;
      }
    | {
        type: "list_reply";
        list_reply: ListReply;
      };
}

export interface ButtonReply {
  /** The id you assigned when creating the button. */
  id: string;
  title: string;
}

export interface ListReply {
  /** The id you assigned to the list row. */
  id: string;
  title: string;
  description?: string;
}

/** Catch-all for message types not explicitly modelled. */
export interface UnknownMessage extends WhatsAppMessageBase {
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Status update types
// ---------------------------------------------------------------------------

export type WhatsAppStatusValue = "sent" | "delivered" | "read" | "failed";

/** Delivery/read receipt for a message you sent. */
export interface WhatsAppStatus {
  /** The message ID you received when you sent the original message. */
  id: string;
  status: WhatsAppStatusValue;
  /** Unix timestamp (seconds). */
  timestamp: string;
  /** Recipient's phone number. */
  recipient_id: string;
  conversation?: {
    id: string;
    expiration_timestamp?: string;
    origin?: { type: string };
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: WhatsAppError[];
}

export interface WhatsAppError {
  code: number;
  title: string;
  message?: string;
  error_data?: { details: string };
}

// ---------------------------------------------------------------------------
// Message sending payload types (outgoing to Meta)
// ---------------------------------------------------------------------------

/** Common fields present on every outgoing message payload. */
interface SendPayloadBase {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
}

export interface SendTextPayload extends SendPayloadBase {
  type: "text";
  text: {
    body: string;
    preview_url?: boolean;
  };
}

export interface SendImagePayload extends SendPayloadBase {
  type: "image";
  image: {
    link: string;
    caption?: string;
  };
}

export interface SendVideoPayload extends SendPayloadBase {
  type: "video";
  video: {
    link: string;
    caption?: string;
  };
}

export interface SendDocumentPayload extends SendPayloadBase {
  type: "document";
  document: {
    link: string;
    caption?: string;
    filename?: string;
  };
}

export interface SendAudioPayload extends SendPayloadBase {
  type: "audio";
  audio: {
    link: string;
  };
}

/** Interactive button message payload (max 3 buttons, 20 chars per title). */
export interface SendButtonsPayload extends SendPayloadBase {
  type: "interactive";
  interactive: {
    type: "button";
    body: { text: string };
    action: {
      buttons: Array<{
        type: "reply";
        reply: { id: string; title: string };
      }>;
    };
  };
}

/** Interactive list message payload. */
export interface SendListPayload extends SendPayloadBase {
  type: "interactive";
  interactive: {
    type: "list";
    body: { text: string };
    action: {
      button: string;
      sections: Array<{
        title: string;
        rows: Array<{
          id: string;
          title: string;
          description?: string;
        }>;
      }>;
    };
  };
}

/** CTA URL button message (call-to-action with external link). */
export interface SendCtaUrlPayload extends SendPayloadBase {
  type: "interactive";
  interactive: {
    type: "cta_url";
    body: { text: string };
    action: {
      name: "cta_url";
      parameters: {
        display_text: string;
        url: string;
      };
    };
  };
}

/** Template message payload (required when outside the 24-hour window). */
export interface SendTemplatePayload extends SendPayloadBase {
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: TemplateComponent[];
  };
}

export type TemplateComponent =
  | { type: "header"; parameters: TemplateParameter[] }
  | { type: "body"; parameters: TemplateParameter[] }
  | { type: "button"; sub_type: string; index: string; parameters: TemplateParameter[] };

export type TemplateParameter =
  | { type: "text"; text: string }
  | { type: "currency"; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: "image"; image: { link: string } };

/** Mark-as-read payload. */
export interface MarkAsReadPayload {
  messaging_product: "whatsapp";
  status: "read";
  message_id: string;
}

/** Response returned by the Messages API on success. */
export interface SendMessageResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

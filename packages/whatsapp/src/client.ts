import type {
  SendMessageResponse,
  SendTextPayload,
  SendImagePayload,
  SendButtonsPayload,
  SendListPayload,
  SendCtaUrlPayload,
  SendTemplatePayload,
  MarkAsReadPayload,
} from "./types.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface WhatsAppClientConfig {
  accessToken: string;
  phoneNumberId: string;
  /** Defaults to 'v21.0'. */
  graphApiVersion?: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorData: unknown
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

// ---------------------------------------------------------------------------
// Sleep helper for backoff
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// WhatsAppClient
// ---------------------------------------------------------------------------

/**
 * Client for Meta's WhatsApp Cloud API (v21.0).
 *
 * All send methods POST to the Messages API endpoint for the configured phone
 * number. Media must be hosted on a publicly accessible HTTPS URL.
 *
 * Phone number format: E.164 without the '+' (e.g. "919876543210" for India).
 *
 * 24-hour window rule: free-form messages (sendText, sendImage, sendButtons,
 * sendList, sendPaymentLink) are only allowed within 24 hours of the user's
 * last inbound message. Outside that window, use sendTemplate() with a
 * pre-approved template.
 */
export class WhatsAppClient {
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  constructor(config: WhatsAppClientConfig) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.apiVersion = config.graphApiVersion ?? "v21.0";
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  // -------------------------------------------------------------------------
  // Public send methods
  // -------------------------------------------------------------------------

  /**
   * Send a plain text message.
   *
   * @param to   Recipient phone number (E.164 without '+'). E.g. "919876543210".
   * @param body Message body text (max 4096 characters).
   */
  async sendText(to: string, body: string): Promise<SendMessageResponse> {
    const payload: SendTextPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body },
    };
    return this._send("messages", payload);
  }

  /**
   * Send an image by URL with an optional caption.
   *
   * The URL must be publicly accessible over HTTPS. WhatsApp will fetch it
   * server-side — presigned or auth-gated URLs will fail.
   *
   * @param to         Recipient phone number.
   * @param imageUrl   Public HTTPS URL of the image (JPEG, PNG, WebP).
   * @param caption    Optional caption shown below the image (max 1024 chars).
   */
  async sendImage(
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<SendMessageResponse> {
    const payload: SendImagePayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    };
    return this._send("messages", payload);
  }

  /**
   * Send an interactive quick-reply button message.
   *
   * WhatsApp limits: max 3 buttons, button title max 20 characters.
   * Titles exceeding 20 characters are automatically truncated with "…".
   * Buttons beyond the third are silently dropped.
   *
   * @param to      Recipient phone number.
   * @param body    Body text shown above the buttons (max 1024 chars).
   * @param buttons Up to 3 buttons, each with a unique id and a title.
   *                Button ids must be unique within the message (max 256 chars).
   */
  async sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<SendMessageResponse> {
    const MAX_BUTTONS = 3;
    const MAX_TITLE_LENGTH = 20;

    // Validate: at least one button required.
    if (buttons.length === 0) {
      throw new Error("sendButtons: at least one button is required.");
    }

    const sanitized = buttons.slice(0, MAX_BUTTONS).map((b) => ({
      id: b.id,
      title:
        b.title.length > MAX_TITLE_LENGTH
          ? b.title.slice(0, MAX_TITLE_LENGTH - 1) + "\u2026"
          : b.title,
    }));

    const payload: SendButtonsPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: sanitized.map((b) => ({
            type: "reply" as const,
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    };
    return this._send("messages", payload);
  }

  /**
   * Send an interactive list message (a scrollable menu of options).
   *
   * WhatsApp limits: max 10 sections, max 10 rows per section,
   * row title max 24 characters, row description max 72 characters.
   *
   * @param to          Recipient phone number.
   * @param body        Body text shown above the list button (max 1024 chars).
   * @param buttonText  Label on the button that opens the list (max 20 chars).
   * @param sections    Array of sections, each with a title and rows.
   */
  async sendList(
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>
  ): Promise<SendMessageResponse> {
    if (sections.length === 0) {
      throw new Error("sendList: at least one section is required.");
    }

    const payload: SendListPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: { button: buttonText, sections },
      },
    };
    return this._send("messages", payload);
  }

  /**
   * Send a CTA URL button message (call-to-action with an external link).
   *
   * Opens the URL in the device browser when the user taps the button.
   * Useful for linking to payment pages, dashboards, or external sites.
   *
   * @param to          Recipient phone number.
   * @param body        Body text shown above the button (max 1024 chars).
   * @param url         The URL that opens when the button is tapped (HTTPS).
   * @param buttonText  Button label (max 20 chars).
   */
  async sendPaymentLink(
    to: string,
    body: string,
    url: string,
    buttonText: string
  ): Promise<SendMessageResponse> {
    const payload: SendCtaUrlPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: body },
        action: {
          name: "cta_url",
          parameters: {
            display_text: buttonText,
            url,
          },
        },
      },
    };
    return this._send("messages", payload);
  }

  /**
   * Mark an incoming message as read, triggering the blue double-tick on the
   * sender's device.
   *
   * Call this as soon as you have processed the inbound message. Marking as
   * read also resets the 24-hour customer service window timer.
   *
   * @param messageId The message id from the incoming webhook (message.id).
   */
  async markAsRead(messageId: string): Promise<void> {
    const payload: MarkAsReadPayload = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    };
    await this._send("messages", payload);
  }

  /**
   * Send a pre-approved template message.
   *
   * Templates are mandatory when messaging a user outside the 24-hour window.
   * Templates must be approved via Meta Business Manager before use.
   * Approval typically takes 24–48 hours.
   *
   * @param to            Recipient phone number.
   * @param templateName  Exact template name as registered in Meta.
   * @param languageCode  BCP-47 language code, e.g. "en", "en_US", "hi".
   * @param components    Optional template variable substitutions.
   */
  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: SendTemplatePayload["template"]["components"]
  ): Promise<SendMessageResponse> {
    const payload: SendTemplatePayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    };
    return this._send("messages", payload);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Base fetch wrapper for the Messages API.
   *
   * Retries up to 3 times on network errors or 5xx responses with exponential
   * backoff (1 s → 2 s → 4 s). Throws WhatsAppApiError on permanent failures.
   *
   * @param endpoint Relative endpoint, e.g. "messages".
   * @param body     JSON payload to POST.
   */
  private async _send<T = SendMessageResponse>(
    endpoint: string,
    body: object
  ): Promise<T> {
    const url = `${this.baseUrl}/${this.phoneNumberId}/${endpoint}`;
    const delays = [1000, 2000, 4000];
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        // On 5xx, retry if we have attempts left.
        if (response.status >= 500 && attempt < delays.length) {
          const delay = delays[attempt];
          this._logError("WhatsApp API 5xx — will retry", {
            attempt: attempt + 1,
            status: response.status,
            url,
            delayMs: delay,
          });
          await sleep(delay!);
          continue;
        }

        if (!response.ok) {
          let errorData: unknown;
          try {
            errorData = await response.json();
          } catch {
            errorData = await response.text();
          }
          this._logError("WhatsApp API error", {
            status: response.status,
            url,
            errorData,
          });
          throw new WhatsAppApiError(
            `WhatsApp API request failed with status ${response.status}`,
            response.status,
            errorData
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof WhatsAppApiError) {
          // Permanent API error — do not retry.
          throw error;
        }

        // Network-level error (fetch threw) — retry if attempts remain.
        lastError = error;
        if (attempt < delays.length) {
          const delay = delays[attempt];
          this._logError("WhatsApp API network error — will retry", {
            attempt: attempt + 1,
            url,
            error: error instanceof Error ? error.message : String(error),
            delayMs: delay,
          });
          await sleep(delay!);
        }
      }
    }

    this._logError("WhatsApp API request failed after all retries", {
      url,
      error:
        lastError instanceof Error ? lastError.message : String(lastError),
    });
    throw new WhatsAppApiError(
      "WhatsApp API request failed after 3 attempts",
      0,
      lastError
    );
  }

  /** Structured error logger (avoids console.log in production code paths). */
  private _logError(message: string, data: Record<string, unknown>): void {
    // Write to stderr so it shows up in server logs without polluting stdout.
    process.stderr.write(
      JSON.stringify({ level: "error", message, ...data, ts: new Date().toISOString() }) + "\n"
    );
  }
}

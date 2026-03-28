/**
 * WhatsApp Cloud API — Media download helpers.
 *
 * Incoming webhook messages reference media by ID, not by URL. Fetching the
 * binary is a two-step process:
 *   1. Resolve the media ID to a CDN URL via the Graph API.
 *   2. Download the CDN URL (also requires the Bearer token).
 *
 * IMPORTANT: CDN URLs expire after 5 minutes. Call downloadMedia() inside
 * your webhook handler, not deferred in a background queue. Once you have the
 * Buffer, persist it to durable storage (e.g. Supabase Storage) immediately.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
  /** File size in bytes as reported by the Graph API. */
  fileSize?: number;
}

interface MediaMetadataResponse {
  url: string;
  mime_type: string;
  sha256: string;
  file_size?: number;
  id: string;
  messaging_product: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class WhatsAppMediaError extends Error {
  constructor(
    message: string,
    public readonly step: "resolve" | "download",
    public readonly originalCause?: unknown
  ) {
    super(message);
    this.name = "WhatsAppMediaError";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Download a WhatsApp media attachment given its media ID.
 *
 * @param mediaId     The media ID from the incoming webhook message payload
 *                    (e.g. message.image.id, message.audio.id).
 * @param accessToken Your WhatsApp Cloud API access token (Bearer).
 * @param apiVersion  Graph API version. Defaults to "v21.0".
 *
 * @returns An object containing the binary buffer and the MIME type.
 *
 * @throws WhatsAppMediaError if either the resolve or download step fails.
 *
 * @example
 * // Inside your webhook POST handler:
 * const { buffer, mimeType } = await downloadMedia(message.image.id, accessToken);
 * // Then immediately upload to Supabase Storage or S3.
 */
export async function downloadMedia(
  mediaId: string,
  accessToken: string,
  apiVersion: string = "v21.0"
): Promise<DownloadedMedia> {
  const authHeader = `Bearer ${accessToken}`;

  // Step 1: Resolve media ID → CDN URL
  let metaResponse: MediaMetadataResponse;
  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/${apiVersion}/${mediaId}`,
      { headers: { Authorization: authHeader } }
    );

    if (!metaRes.ok) {
      let body: unknown;
      try {
        body = await metaRes.json();
      } catch {
        body = await metaRes.text();
      }
      throw new WhatsAppMediaError(
        `Failed to resolve media ID ${mediaId}: HTTP ${metaRes.status}`,
        "resolve",
        body
      );
    }

    metaResponse = (await metaRes.json()) as MediaMetadataResponse;
  } catch (error) {
    if (error instanceof WhatsAppMediaError) throw error;
    throw new WhatsAppMediaError(
      `Network error while resolving media ID ${mediaId}`,
      "resolve",
      error
    );
  }

  const { url: cdnUrl, mime_type: mimeType, file_size: fileSize } = metaResponse;

  if (!cdnUrl) {
    throw new WhatsAppMediaError(
      `No CDN URL returned for media ID ${mediaId}`,
      "resolve",
      metaResponse
    );
  }

  // Step 2: Download the binary from the CDN URL
  // The CDN URL is signed and also requires the Bearer token.
  let buffer: Buffer;
  try {
    const cdnRes = await fetch(cdnUrl, {
      headers: { Authorization: authHeader },
    });

    if (!cdnRes.ok) {
      throw new WhatsAppMediaError(
        `Failed to download media from CDN: HTTP ${cdnRes.status}`,
        "download",
        { cdnUrl, status: cdnRes.status }
      );
    }

    const arrayBuffer = await cdnRes.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch (error) {
    if (error instanceof WhatsAppMediaError) throw error;
    throw new WhatsAppMediaError(
      `Network error while downloading media from CDN`,
      "download",
      error
    );
  }

  return { buffer, mimeType, fileSize };
}

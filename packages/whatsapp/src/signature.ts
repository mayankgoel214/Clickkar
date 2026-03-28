import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify the X-Hub-Signature-256 header sent by Meta on every webhook POST.
 *
 * Meta signs the raw request body with your app secret using HMAC-SHA256 and
 * prefixes the hex digest with "sha256=".
 *
 * IMPORTANT: Always pass the raw (unparsed) request body — never the parsed
 * JSON object. The signature is computed over the exact bytes Meta sent.
 *
 * @param rawBody   The raw request body bytes or string.
 * @param signature The value of the X-Hub-Signature-256 header.
 * @param appSecret Your Meta app secret (from the App Dashboard).
 * @returns         True when the signature is valid, false otherwise.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  appSecret: string
): boolean {
  const expectedSignature =
    "sha256=" +
    createHmac("sha256", appSecret).update(rawBody).digest("hex");

  // Use timing-safe comparison to prevent timing-based attacks.
  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    // timingSafeEqual throws if buffers are different lengths, which means
    // the signature format is wrong — treat as invalid.
    return false;
  }
}

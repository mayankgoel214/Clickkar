/**
 * Produce a safe masked fingerprint for a key.
 * Format: first 3 chars + "..." + last 3 chars.
 * Short keys (<=8 chars) are fully replaced with "***" to avoid revealing them.
 * Empty/whitespace keys return "(empty)".
 *
 * SECURITY: this is the ONLY representation of a key safe to log or expose.
 * Never return or embed the full key in events, errors, or HTTP responses.
 */
export function maskKey(key: string): string {
  if (!key || key.trim().length === 0) return '(empty)';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '***';
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-3)}`;
}

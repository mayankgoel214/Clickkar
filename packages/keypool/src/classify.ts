/**
 * Classify an error or HTTP status into a failure reason understood by the pool.
 *
 * The pool does NOT inspect error.message (could contain keys). It only looks
 * at `.status`, `.statusCode`, `.code` — well-known HTTP/provider fields.
 */
export type FailureReason = 'rate_limited' | 'auth_error' | 'server_error' | 'network' | 'unknown';

export interface ClassifyInput {
  errorCode?: number | string;
  reason?: FailureReason;
}

export function classifyFailure(input: ClassifyInput): FailureReason {
  if (input.reason) return input.reason;
  const code = input.errorCode;
  if (code === undefined || code === null) return 'unknown';
  const num = typeof code === 'number' ? code : Number.parseInt(String(code), 10);
  if (!Number.isFinite(num)) {
    // String codes like 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH'
    const s = String(code).toUpperCase();
    if (s.startsWith('E')) return 'network';
    return 'unknown';
  }
  if (num === 429) return 'rate_limited';
  if (num === 401 || num === 403) return 'auth_error';
  if (num >= 500 && num < 600) return 'server_error';
  return 'unknown';
}

/**
 * Extract a status code from a caught exception. Walks common shapes
 * from fetch-like clients, @google/genai, @fal-ai/client, node-fetch errors.
 * Never reads `.message` or embeds the error into anything user-visible.
 */
export function extractErrorCode(err: unknown): number | string | undefined {
  if (err === null || typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown>;
  // direct fields
  if (typeof e['status'] === 'number') return e['status'] as number;
  if (typeof e['statusCode'] === 'number') return e['statusCode'] as number;
  if (typeof e['code'] === 'number') return e['code'] as number;
  if (typeof e['code'] === 'string') return e['code'] as string;
  // nested response.status (fetch Response-like)
  const resp = e['response'];
  if (resp && typeof resp === 'object') {
    const r = resp as Record<string, unknown>;
    if (typeof r['status'] === 'number') return r['status'] as number;
    if (typeof r['statusCode'] === 'number') return r['statusCode'] as number;
  }
  // @google/genai: error.error.code
  const nested = e['error'];
  if (nested && typeof nested === 'object') {
    const n = nested as Record<string, unknown>;
    if (typeof n['code'] === 'number') return n['code'] as number;
    if (typeof n['status'] === 'number') return n['status'] as number;
  }
  return undefined;
}

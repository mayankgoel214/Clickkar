/**
 * @autmn/keypool — shared types.
 *
 * A provider is one of the external AI APIs we pool keys for.
 * A key is a single credential string. The pool never logs keys or
 * error-stringifies them; only the masked `hint` is safe to surface.
 */

export type Provider = 'gemini' | 'fal' | 'groq' | 'sarvam';

export type ReleaseOutcome =
  | { success: true }
  | { success: false; errorCode?: number | string; reason?: 'rate_limited' | 'auth_error' | 'server_error' | 'network' | 'unknown' };

export interface KeyHealth {
  /** Masked fingerprint — safe to log. First 3 + last 3 chars, e.g. "AIz...xyz". */
  hint: string;
  healthy: boolean;
  /** Milliseconds since epoch. Null when healthy. */
  coolDownUntil: number | null;
  successCount: number;
  failureCount: number;
  /** Milliseconds since epoch. Null when never-failed. */
  lastFailureAt: number | null;
  /** Last classified reason, only useful in-flight. */
  lastFailureReason?: string | null;
}

export interface ProviderHealth {
  provider: Provider;
  total: number;
  healthy: number;
  coolDown: number;
  keys: KeyHealth[];
}

export interface AcquireResult {
  key: string;
  /** Must be called exactly once. Extra calls are ignored. */
  release: (outcome: ReleaseOutcome) => void;
}

export interface KeyPoolConfig {
  /** Cool-down window after 429 (ms). Default 60_000. */
  coolDownOn429Ms?: number;
  /** Cool-down window after auth error (ms). Default Infinity (manual revive). */
  coolDownOnAuthErrorMs?: number;
  /** Cool-down after a 5xx / network failure (ms). Default 30_000. */
  coolDownOnServerErrorMs?: number;
  /** Max time to wait for an exhausted pool before rejecting (ms). Default 2_000. */
  maxWaitOnExhaustionMs?: number;
  /** Injectable clock for tests. Returns ms-since-epoch. */
  now?: () => number;
  /** Called on every significant event. Use for structured logs. */
  onEvent?: (event: KeyPoolEvent) => void;
}

export type KeyPoolEvent =
  | { type: 'acquired'; provider: Provider; hint: string }
  | { type: 'released_success'; provider: Provider; hint: string }
  | { type: 'released_failure'; provider: Provider; hint: string; reason: string; coolDownMs: number | null }
  | { type: 'marked_unhealthy'; provider: Provider; hint: string; coolDownUntil: number | null; reason: string }
  | { type: 'recovered'; provider: Provider; hint: string }
  | { type: 'exhausted'; provider: Provider; waitingMs: number }
  | { type: 'pool_initialized'; provider: Provider; count: number };

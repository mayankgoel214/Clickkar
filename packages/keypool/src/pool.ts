/**
 * KeyPool — round-robin, health-aware key rotation for a single provider.
 *
 * Concurrency model: single-process, single-threaded (Node). Round-robin
 * counter is plain number. Not safe across workers — each worker has its
 * own pool instance, which is fine: the provider rate limit is per-key,
 * not per-pool.
 */

import { classifyFailure, extractErrorCode, type FailureReason } from './classify.js';
import { maskKey } from './mask.js';
import type {
  AcquireResult,
  KeyHealth,
  KeyPoolConfig,
  KeyPoolEvent,
  Provider,
  ProviderHealth,
  ReleaseOutcome,
} from './types.js';

interface KeyEntry {
  key: string;
  hint: string;
  healthy: boolean;
  coolDownUntil: number | null;
  successCount: number;
  failureCount: number;
  lastFailureAt: number | null;
  lastFailureReason: FailureReason | null;
}

const DEFAULT_COOLDOWN_429_MS = 60_000;
const DEFAULT_COOLDOWN_AUTH_MS = Number.POSITIVE_INFINITY;
const DEFAULT_COOLDOWN_SERVER_MS = 30_000;
const DEFAULT_WAIT_ON_EXHAUSTION_MS = 2_000;

export class KeyPool {
  private readonly provider: Provider;
  private readonly entries: KeyEntry[];
  private readonly config: Required<Omit<KeyPoolConfig, 'onEvent' | 'now'>> & {
    onEvent?: (event: KeyPoolEvent) => void;
    now: () => number;
  };
  private rrCursor = 0;

  constructor(provider: Provider, keys: string[], config: KeyPoolConfig = {}) {
    this.provider = provider;
    const now = config.now ?? (() => Date.now());
    this.config = {
      coolDownOn429Ms: config.coolDownOn429Ms ?? DEFAULT_COOLDOWN_429_MS,
      coolDownOnAuthErrorMs: config.coolDownOnAuthErrorMs ?? DEFAULT_COOLDOWN_AUTH_MS,
      coolDownOnServerErrorMs: config.coolDownOnServerErrorMs ?? DEFAULT_COOLDOWN_SERVER_MS,
      maxWaitOnExhaustionMs: config.maxWaitOnExhaustionMs ?? DEFAULT_WAIT_ON_EXHAUSTION_MS,
      now,
      onEvent: config.onEvent,
    };

    // Dedupe, drop empty. Preserve order for deterministic round-robin.
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const k of keys) {
      const trimmed = (k ?? '').trim();
      if (!trimmed) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      cleaned.push(trimmed);
    }

    if (cleaned.length === 0) {
      throw new Error(`[keypool] ${provider}: no keys provided — check env vars`);
    }

    this.entries = cleaned.map((key) => ({
      key,
      hint: maskKey(key),
      healthy: true,
      coolDownUntil: null,
      successCount: 0,
      failureCount: 0,
      lastFailureAt: null,
      lastFailureReason: null,
    }));

    this.emit({ type: 'pool_initialized', provider, count: this.entries.length });
  }

  /** Number of keys loaded (for boot-time summary). */
  size(): number {
    return this.entries.length;
  }

  /**
   * Synchronous acquire — returns immediately if any key is healthy.
   * If all keys are in cool-down, waits up to maxWaitOnExhaustionMs for
   * the shortest-remaining cool-down to expire, then retries.
   *
   * If the pool is STILL exhausted (e.g. all keys are auth_error/Infinity
   * cool-down), throws `KeyPoolExhaustedError`.
   */
  async acquire(): Promise<AcquireResult> {
    this.recoverExpired();
    let selected = this.selectHealthy();

    if (!selected) {
      const waitMs = this.timeUntilNextRecovery();
      if (waitMs === null || waitMs > this.config.maxWaitOnExhaustionMs) {
        this.emit({ type: 'exhausted', provider: this.provider, waitingMs: 0 });
        throw new KeyPoolExhaustedError(this.provider);
      }
      this.emit({ type: 'exhausted', provider: this.provider, waitingMs: waitMs });
      await this.sleep(waitMs + 5);
      this.recoverExpired();
      selected = this.selectHealthy();
      if (!selected) {
        throw new KeyPoolExhaustedError(this.provider);
      }
    }

    const entry = selected;
    this.emit({ type: 'acquired', provider: this.provider, hint: entry.hint });

    let released = false;
    const release = (outcome: ReleaseOutcome): void => {
      if (released) return;
      released = true;
      if (outcome.success) {
        entry.successCount += 1;
        this.emit({ type: 'released_success', provider: this.provider, hint: entry.hint });
        return;
      }
      const reason = classifyFailure({ errorCode: outcome.errorCode, reason: outcome.reason });
      entry.failureCount += 1;
      entry.lastFailureAt = this.config.now();
      entry.lastFailureReason = reason;
      const coolDownMs = this.coolDownForReason(reason);
      if (coolDownMs === null) {
        // 'unknown' — don't penalize, caller will retry
        this.emit({
          type: 'released_failure',
          provider: this.provider,
          hint: entry.hint,
          reason,
          coolDownMs: null,
        });
        return;
      }
      entry.healthy = false;
      entry.coolDownUntil =
        coolDownMs === Number.POSITIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : this.config.now() + coolDownMs;
      this.emit({
        type: 'released_failure',
        provider: this.provider,
        hint: entry.hint,
        reason,
        coolDownMs,
      });
      this.emit({
        type: 'marked_unhealthy',
        provider: this.provider,
        hint: entry.hint,
        coolDownUntil: entry.coolDownUntil,
        reason,
      });
    };

    return { key: entry.key, release };
  }

  /**
   * High-level wrapper: acquire, run fn(key), release based on fn's outcome.
   * fn should throw on failure — the thrown error's status is auto-classified.
   *
   * Retries once with a different key on rate_limited / server_error / network.
   * Auth errors and unknown errors are not retried — they surface immediately.
   */
  async call<T>(fn: (key: string) => Promise<T>, options?: { maxAttempts?: number }): Promise<T> {
    const maxAttempts = options?.maxAttempts ?? 2;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const { key, release } = await this.acquire();
      try {
        const result = await fn(key);
        release({ success: true });
        return result;
      } catch (err) {
        const errorCode = extractErrorCode(err);
        const reason = classifyFailure({ errorCode });
        release({ success: false, errorCode, reason });
        lastErr = err;
        const retryable = reason === 'rate_limited' || reason === 'server_error' || reason === 'network';
        if (!retryable || attempt === maxAttempts) {
          throw err;
        }
      }
    }
    throw lastErr ?? new Error(`[keypool] ${this.provider}: call failed after ${maxAttempts} attempts`);
  }

  /** Manual health override — force a key back to healthy. For /admin/keypool/revive. */
  revive(hint: string): boolean {
    const entry = this.entries.find((e) => e.hint === hint);
    if (!entry) return false;
    if (entry.healthy) return true;
    entry.healthy = true;
    entry.coolDownUntil = null;
    this.emit({ type: 'recovered', provider: this.provider, hint: entry.hint });
    return true;
  }

  /** Observability snapshot. Masks keys — safe to serialize to JSON. */
  health(): ProviderHealth {
    this.recoverExpired();
    const keys: KeyHealth[] = this.entries.map((e) => ({
      hint: e.hint,
      healthy: e.healthy,
      coolDownUntil:
        e.coolDownUntil === Number.POSITIVE_INFINITY
          ? Number.MAX_SAFE_INTEGER
          : e.coolDownUntil,
      successCount: e.successCount,
      failureCount: e.failureCount,
      lastFailureAt: e.lastFailureAt,
      lastFailureReason: e.lastFailureReason,
    }));
    return {
      provider: this.provider,
      total: this.entries.length,
      healthy: keys.filter((k) => k.healthy).length,
      coolDown: keys.filter((k) => !k.healthy).length,
      keys,
    };
  }

  // ---------- private ----------

  private recoverExpired(): void {
    const now = this.config.now();
    for (const entry of this.entries) {
      if (entry.healthy) continue;
      if (entry.coolDownUntil === null) continue;
      if (entry.coolDownUntil === Number.POSITIVE_INFINITY) continue;
      if (entry.coolDownUntil <= now) {
        entry.healthy = true;
        entry.coolDownUntil = null;
        this.emit({ type: 'recovered', provider: this.provider, hint: entry.hint });
      }
    }
  }

  private selectHealthy(): KeyEntry | null {
    const n = this.entries.length;
    for (let i = 0; i < n; i += 1) {
      const idx = (this.rrCursor + i) % n;
      const entry = this.entries[idx];
      if (entry && entry.healthy) {
        this.rrCursor = (idx + 1) % n;
        return entry;
      }
    }
    return null;
  }

  private timeUntilNextRecovery(): number | null {
    const now = this.config.now();
    let min: number | null = null;
    for (const entry of this.entries) {
      if (entry.healthy) return 0;
      if (entry.coolDownUntil === null) continue;
      if (entry.coolDownUntil === Number.POSITIVE_INFINITY) continue;
      const remaining = Math.max(0, entry.coolDownUntil - now);
      if (min === null || remaining < min) min = remaining;
    }
    return min;
  }

  private coolDownForReason(reason: FailureReason): number | null {
    switch (reason) {
      case 'rate_limited':
        return this.config.coolDownOn429Ms;
      case 'auth_error':
        return this.config.coolDownOnAuthErrorMs;
      case 'server_error':
      case 'network':
        return this.config.coolDownOnServerErrorMs;
      case 'unknown':
        return null;
    }
  }

  private emit(event: KeyPoolEvent): void {
    const onEvent = this.config.onEvent;
    if (onEvent) {
      try {
        onEvent(event);
      } catch {
        // never let a logger take down the pool
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class KeyPoolExhaustedError extends Error {
  public readonly provider: Provider;
  constructor(provider: Provider) {
    super(`[keypool] ${provider}: all keys unhealthy, no recovery within max-wait window`);
    this.name = 'KeyPoolExhaustedError';
    this.provider = provider;
  }
}

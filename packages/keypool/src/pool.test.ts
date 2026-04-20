import { describe, expect, it, vi } from 'vitest';
import { KeyPool, KeyPoolExhaustedError } from './pool.js';
import type { KeyPoolEvent } from './types.js';

// helper: a controllable clock
function makeClock(start = 1_700_000_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

function captureEvents(): { events: KeyPoolEvent[]; onEvent: (e: KeyPoolEvent) => void } {
  const events: KeyPoolEvent[] = [];
  return { events, onEvent: (e) => events.push(e) };
}

describe('KeyPool — construction', () => {
  it('rejects an empty key set', () => {
    expect(() => new KeyPool('gemini', [])).toThrow(/no keys provided/);
  });

  it('rejects a whitespace-only key set', () => {
    expect(() => new KeyPool('gemini', ['', '   '])).toThrow(/no keys provided/);
  });

  it('dedupes and trims keys, preserves order', () => {
    const pool = new KeyPool('gemini', ['  k1  ', 'k2', 'k1', '', 'k3']);
    expect(pool.size()).toBe(3);
    expect(pool.health().keys.map((k) => k.hint)).toEqual([
      expect.any(String),
      expect.any(String),
      expect.any(String),
    ]);
  });

  it('emits a pool_initialized event with the count', () => {
    const { events, onEvent } = captureEvents();
    new KeyPool('fal', ['fal-key-abc123', 'fal-key-def456'], { onEvent });
    expect(events).toContainEqual({ type: 'pool_initialized', provider: 'fal', count: 2 });
  });
});

describe('KeyPool — round-robin selection', () => {
  it('rotates through all healthy keys in order', async () => {
    const pool = new KeyPool('gemini', ['k1-abcxyz', 'k2-abcxyz', 'k3-abcxyz']);
    const seen: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const { key, release } = await pool.acquire();
      seen.push(key);
      release({ success: true });
    }
    // should see all three keys, each twice, in a cycle
    expect(new Set(seen).size).toBe(3);
    expect(seen[0]).toBe(seen[3]);
    expect(seen[1]).toBe(seen[4]);
    expect(seen[2]).toBe(seen[5]);
  });

  it('skips unhealthy keys', async () => {
    const clock = makeClock();
    const pool = new KeyPool('gemini', ['k1-abcxyz', 'k2-abcxyz', 'k3-abcxyz'], { now: clock.now });

    const first = await pool.acquire();
    first.release({ success: false, errorCode: 429 }); // k1 → cool-down

    // next two acquires should return k2 and k3, never k1
    const a = await pool.acquire();
    const b = await pool.acquire();
    expect(a.key).not.toBe(first.key);
    expect(b.key).not.toBe(first.key);
    expect(a.key).not.toBe(b.key);
    a.release({ success: true });
    b.release({ success: true });

    // and one more — should cycle back to k2 (not k1, still cooling)
    const c = await pool.acquire();
    expect(c.key).not.toBe(first.key);
    c.release({ success: true });
  });
});

describe('KeyPool — forced 429 marks key unhealthy and rotates', () => {
  it('429 on primary routes the next acquire to a secondary', async () => {
    const { events, onEvent } = captureEvents();
    const pool = new KeyPool('gemini', ['primary-abcxyz', 'secondary-abcxyz'], { onEvent });

    const first = await pool.acquire();
    expect(first.key).toBe('primary-abcxyz');
    first.release({ success: false, errorCode: 429 });

    const second = await pool.acquire();
    expect(second.key).toBe('secondary-abcxyz');
    second.release({ success: true });

    const markedUnhealthy = events.filter((e) => e.type === 'marked_unhealthy');
    expect(markedUnhealthy).toHaveLength(1);
    expect((markedUnhealthy[0] as { reason: string; hint: string }).reason).toBe('rate_limited');
    expect((markedUnhealthy[0] as { hint: string }).hint).toBe('pri...xyz');
  });

  it('includes no raw keys in any event', async () => {
    const { events, onEvent } = captureEvents();
    const pool = new KeyPool('gemini', ['super-secret-key-abc123'], { onEvent });
    const { release } = await pool.acquire();
    release({ success: false, errorCode: 429 });

    const blob = JSON.stringify(events);
    expect(blob).not.toContain('super-secret-key-abc123');
  });
});

describe('KeyPool — cool-down and recovery', () => {
  it('recovers a rate-limited key after the cool-down elapses', async () => {
    const clock = makeClock();
    const pool = new KeyPool('gemini', ['only-key-abcxyz'], {
      coolDownOn429Ms: 60_000,
      maxWaitOnExhaustionMs: 0, // force synchronous exhaustion
      now: clock.now,
    });

    const first = await pool.acquire();
    first.release({ success: false, errorCode: 429 });

    // immediately after: all cooling → should throw
    await expect(pool.acquire()).rejects.toThrow(KeyPoolExhaustedError);

    // advance past the cool-down
    clock.advance(61_000);
    const next = await pool.acquire();
    expect(next.key).toBe('only-key-abcxyz');
    next.release({ success: true });
  });

  it('auth error uses indefinite cool-down', async () => {
    const clock = makeClock();
    const pool = new KeyPool('gemini', ['only-key-abcxyz'], {
      maxWaitOnExhaustionMs: 0,
      now: clock.now,
    });

    const first = await pool.acquire();
    first.release({ success: false, errorCode: 403 });

    // advance a full day — still exhausted
    clock.advance(86_400_000);
    await expect(pool.acquire()).rejects.toThrow(KeyPoolExhaustedError);

    // manual revive recovers it
    const hint = pool.health().keys[0]!.hint;
    expect(pool.revive(hint)).toBe(true);
    const next = await pool.acquire();
    expect(next.key).toBe('only-key-abcxyz');
    next.release({ success: true });
  });

  it('server error triggers a 30s cool-down by default', async () => {
    const clock = makeClock();
    const pool = new KeyPool('gemini', ['only-key-abcxyz'], {
      maxWaitOnExhaustionMs: 0,
      now: clock.now,
    });

    const first = await pool.acquire();
    first.release({ success: false, errorCode: 503 });

    clock.advance(15_000);
    await expect(pool.acquire()).rejects.toThrow(KeyPoolExhaustedError);

    clock.advance(20_000);
    const next = await pool.acquire();
    expect(next.key).toBe('only-key-abcxyz');
    next.release({ success: true });
  });

  it('unknown error does NOT penalize the key', async () => {
    const pool = new KeyPool('gemini', ['only-key-abcxyz']);
    const first = await pool.acquire();
    first.release({ success: false }); // no errorCode → 'unknown'

    // still healthy — next acquire succeeds immediately
    const next = await pool.acquire();
    expect(next.key).toBe('only-key-abcxyz');
    expect(pool.health().keys[0]!.failureCount).toBe(1); // only the first release counted
    expect(pool.health().keys[0]!.healthy).toBe(true);
    expect(pool.health().keys[0]!.coolDownUntil).toBeNull();
    next.release({ success: true });
  });
});

describe('KeyPool — exhaustion behavior', () => {
  it('waits for the shortest-remaining cool-down within the max-wait window', async () => {
    const clock = makeClock();
    const pool = new KeyPool('gemini', ['k1-abcxyz', 'k2-abcxyz'], {
      coolDownOn429Ms: 100,
      maxWaitOnExhaustionMs: 500,
      now: clock.now,
    });

    const a = await pool.acquire();
    a.release({ success: false, errorCode: 429 });
    const b = await pool.acquire();
    b.release({ success: false, errorCode: 429 });

    // Both cooling, but for only 100ms — within the 500ms wait window.
    // The pool's acquire uses real setTimeout; we must advance the clock
    // AND flush the timer. The easiest way: use vi.useFakeTimers.
    vi.useFakeTimers();
    clock.advance(150);
    const promise = pool.acquire();
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(['k1-abcxyz', 'k2-abcxyz']).toContain(result.key);
    result.release({ success: true });
    vi.useRealTimers();
  });

  it('throws KeyPoolExhaustedError when wait exceeds max-wait window', async () => {
    const clock = makeClock();
    const pool = new KeyPool('gemini', ['only-key-abcxyz'], {
      coolDownOn429Ms: 60_000,
      maxWaitOnExhaustionMs: 500,
      now: clock.now,
    });

    const first = await pool.acquire();
    first.release({ success: false, errorCode: 429 });

    await expect(pool.acquire()).rejects.toThrow(KeyPoolExhaustedError);
  });
});

describe('KeyPool — call() wrapper', () => {
  it('returns fn result on success and records it', async () => {
    const pool = new KeyPool('gemini', ['only-key-abcxyz']);
    const result = await pool.call(async (key) => `used:${key.slice(0, 4)}`);
    expect(result).toMatch(/^used:only$/);
    expect(pool.health().keys[0]!.successCount).toBe(1);
  });

  it('classifies thrown errors and retries on a different key', async () => {
    const pool = new KeyPool('gemini', ['k1-abcxyz', 'k2-abcxyz']);
    const keysUsed: string[] = [];
    let calls = 0;
    const result = await pool.call(async (key) => {
      calls += 1;
      keysUsed.push(key);
      if (calls === 1) {
        const err: Error & { status?: number } = new Error('rate limited');
        err.status = 429;
        throw err;
      }
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    expect(new Set(keysUsed).size).toBe(2); // different keys on each attempt
  });

  it('does not retry on auth errors', async () => {
    const pool = new KeyPool('gemini', ['k1-abcxyz', 'k2-abcxyz']);
    let calls = 0;
    await expect(
      pool.call(async () => {
        calls += 1;
        const err: Error & { status?: number } = new Error('unauthorized');
        err.status = 401;
        throw err;
      }),
    ).rejects.toThrow(/unauthorized/);
    expect(calls).toBe(1);
  });
});

describe('KeyPool — health report', () => {
  it('reports totals and masks keys', async () => {
    const pool = new KeyPool('gemini', ['aaa-bbb-ccc', 'ddd-eee-fff']);
    const health = pool.health();
    expect(health.total).toBe(2);
    expect(health.healthy).toBe(2);
    expect(health.coolDown).toBe(0);
    expect(health.provider).toBe('gemini');
    expect(health.keys[0]!.hint).toBe('aaa...ccc');
    expect(health.keys[1]!.hint).toBe('ddd...fff');
    // crucially: no `key` field on KeyHealth
    expect((health.keys[0]! as unknown as Record<string, unknown>).key).toBeUndefined();
  });

  it('reflects cool-down state after a 429', async () => {
    const pool = new KeyPool('gemini', ['k1-abcxyz', 'k2-abcxyz']);
    const a = await pool.acquire();
    a.release({ success: false, errorCode: 429 });
    const h = pool.health();
    expect(h.healthy).toBe(1);
    expect(h.coolDown).toBe(1);
  });
});

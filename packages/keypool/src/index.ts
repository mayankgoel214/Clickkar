/**
 * @autmn/keypool — multi-key round-robin with health-aware failover.
 *
 * Typical use:
 *
 *   import { getKeyPool } from '@autmn/keypool';
 *
 *   const pool = getKeyPool('gemini');
 *   const result = await pool.call(async (apiKey) => {
 *     const ai = new GoogleGenAI({ apiKey });
 *     return ai.models.generateContent({ ... });
 *   });
 *
 * The pool auto-classifies HTTP status codes (429, 401/403, 5xx) on the
 * thrown error and marks the key unhealthy with an appropriate cool-down.
 * It rotates to the next healthy key on the next acquire.
 *
 * Never logs, returns, or embeds the full key. Only masked hints escape.
 */

export { KeyPool, KeyPoolExhaustedError } from './pool.js';
export { maskKey } from './mask.js';
export { classifyFailure, extractErrorCode } from './classify.js';
export { readKeysFromEnv, providerEnvSpec } from './env.js';
export {
  getKeyPool,
  hasKeyPool,
  allHealth,
  reviveKey,
  setKeyPoolEventSink,
  __resetRegistryForTests,
} from './registry.js';
export type {
  Provider,
  ReleaseOutcome,
  KeyHealth,
  ProviderHealth,
  AcquireResult,
  KeyPoolConfig,
  KeyPoolEvent,
} from './types.js';
export type { FailureReason } from './classify.js';

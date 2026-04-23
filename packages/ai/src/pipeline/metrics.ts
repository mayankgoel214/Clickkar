/**
 * Pipeline metrics helper (Phase C, 2026-04-22).
 *
 * Emits a SINGLE `pipeline_metrics` structured log line per completed order.
 * Parseable from logs by a downstream aggregator without touching the DB.
 *
 * Schema is stable and machine-readable — don't rename fields without
 * also updating the aggregation script in scripts/aggregate-metrics.ts.
 *
 * Field semantics:
 *   orderId / phoneNumber / style  — identity
 *   tier                            — which tier shipped (1/2/3) or 'refund'
 *   qaScore / fidelityScore         — QA scorer output (0-100 / 0-35)
 *   totalDurationMs                 — wall-clock from tier1_start to delivery
 *   tier1Attempts / tier2Attempts   — number of gen attempts per tier
 *   artDirectorSource               — llm | fallback_* | skipped
 *   compositionSeedUsed             — did we seed AD with a library variant
 *   pickerSource                    — deterministic_only | ai_vision | ai_vision_failed
 *   safetyBlocked                   — true if safety check rejected
 *   productName / productCategory   — what was in the order
 */

export type PipelineTier = 1 | 2 | 3 | 'refund';

export type ArtDirectorSource =
  | 'llm'
  | 'fallback_empty'
  | 'fallback_unparseable'
  | 'fallback_too_short'
  | 'fallback_timeout'
  | 'fallback_error'
  | 'skipped';

export type PickerSource = 'deterministic_only' | 'ai_vision' | 'ai_vision_failed' | 'single';

/**
 * Headline pipeline_metrics record — emitted once per order.
 *
 * The aggregation script (scripts/aggregate-metrics.ts) reads THIS event
 * for pass-rate / tier-distribution / latency. Nuanced rates like
 * art_director_source and picker_source stay in their own event streams
 * and the aggregator correlates them by timestamp.
 */
export interface PipelineMetricsRecord {
  orderId?: string;
  phoneNumber?: string;
  style: string;
  tier: PipelineTier;
  shipped: boolean;
  qaScore: number;
  fidelityScore: number;
  totalDurationMs: number;
  safetyBlocked: boolean;
  safetyBlockReason?: string;
  productName: string;
  productCategory: string;
  model?: string;
  refundReason?: string;
}

/**
 * Emit a single pipeline_metrics log line. Call at the END of processImageNeverFail
 * (success or refund paths — the one log aggregator can compute all rates from this
 * single event).
 */
export function emitPipelineMetrics(record: PipelineMetricsRecord): void {
  console.info(JSON.stringify({ event: 'pipeline_metrics', ...record }));
}

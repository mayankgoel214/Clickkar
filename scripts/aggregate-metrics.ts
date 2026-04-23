#!/usr/bin/env tsx
/**
 * Aggregate pipeline_metrics log lines into pass-rate statistics.
 *
 * Usage:
 *   tsx scripts/aggregate-metrics.ts path/to/worker.log
 *   cat /tmp/api-test.log | tsx scripts/aggregate-metrics.ts -
 *
 * Parses `{"event":"pipeline_metrics", ...}` lines only. Ignores everything else.
 * Prints per-style pass rate, tier distribution, average fidelity, AD success rate.
 */

import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';

interface Metrics {
  style: string;
  tier: number | 'refund';
  shipped: boolean;
  qaScore: number;
  fidelityScore: number;
  totalDurationMs: number;
  artDirectorSource: string;
  pickerSource: string;
  safetyBlocked: boolean;
  productCategory: string;
  model?: string;
}

async function readInput(): Promise<Metrics[]> {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: aggregate-metrics.ts <log-path> (or "-" for stdin)');
    process.exit(1);
  }

  const stream = path === '-' ? process.stdin : createReadStream(path);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const records: Metrics[] = [];

  for await (const line of rl) {
    if (!line.includes('pipeline_metrics')) continue;
    try {
      const parsed = JSON.parse(line) as Metrics & { event?: string };
      if (parsed.event === 'pipeline_metrics') {
        records.push(parsed);
      }
    } catch {
      // skip malformed
    }
  }

  return records;
}

function pct(num: number, denom: number): string {
  if (denom === 0) return '—';
  return ((num / denom) * 100).toFixed(1) + '%';
}

function groupBy<T, K extends string | number>(arr: T[], key: (x: T) => K): Record<K, T[]> {
  const out: Partial<Record<K, T[]>> = {};
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out as Record<K, T[]>;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function summary(records: Metrics[]): void {
  if (records.length === 0) {
    console.log('No pipeline_metrics records found.');
    return;
  }

  console.log(`\nTotal generations analyzed: ${records.length}\n`);

  // ── Tier distribution ──────────────────────────────────────────────
  const byTier = groupBy(records, r => String(r.tier));
  console.log('Tier distribution');
  console.log('-'.repeat(50));
  for (const tier of ['1', '2', '3', 'refund']) {
    const group = byTier[tier] ?? [];
    console.log(
      `  Tier ${tier.padEnd(6)} ${String(group.length).padStart(4)} (${pct(group.length, records.length).padStart(6)})`,
    );
  }

  // ── Per-style pass rate ────────────────────────────────────────────
  const byStyle = groupBy(records, r => r.style);
  console.log('\nPer-style Tier 1 pass rate');
  console.log('-'.repeat(50));
  for (const [style, group] of Object.entries(byStyle).sort()) {
    const tier1Hits = group.filter(r => r.tier === 1).length;
    const shipped = group.filter(r => r.shipped).length;
    const avgFidelity = mean(group.filter(r => r.fidelityScore > 0).map(r => r.fidelityScore));
    console.log(
      `  ${style.padEnd(22)} ` +
      `tier1: ${pct(tier1Hits, group.length).padStart(6)}  ` +
      `shipped: ${pct(shipped, group.length).padStart(6)}  ` +
      `avg_fidelity: ${avgFidelity.toFixed(1).padStart(5)}  ` +
      `n=${group.length}`,
    );
  }

  // ── Per-category pass rate ─────────────────────────────────────────
  const byCategory = groupBy(records, r => r.productCategory || 'unknown');
  console.log('\nPer-category pass rate');
  console.log('-'.repeat(50));
  for (const [category, group] of Object.entries(byCategory).sort()) {
    const tier1Hits = group.filter(r => r.tier === 1).length;
    const shipped = group.filter(r => r.shipped).length;
    console.log(
      `  ${category.padEnd(14)} ` +
      `tier1: ${pct(tier1Hits, group.length).padStart(6)}  ` +
      `shipped: ${pct(shipped, group.length).padStart(6)}  ` +
      `n=${group.length}`,
    );
  }

  // ── Art Director success ───────────────────────────────────────────
  const adRecords = records.filter(r => r.artDirectorSource !== 'skipped');
  const adSuccess = adRecords.filter(r => r.artDirectorSource === 'llm').length;
  console.log('\nArt Director success rate');
  console.log('-'.repeat(50));
  console.log(
    `  LLM briefs generated: ${pct(adSuccess, adRecords.length)} (${adSuccess}/${adRecords.length})`,
  );

  // ── AI vision picker success ───────────────────────────────────────
  const pickerRecords = records.filter(r => r.pickerSource !== 'single');
  const aiVisionWins = pickerRecords.filter(r => r.pickerSource === 'ai_vision').length;
  console.log('\nAI vision picker success rate');
  console.log('-'.repeat(50));
  console.log(
    `  AI vision decisions: ${pct(aiVisionWins, pickerRecords.length)} (${aiVisionWins}/${pickerRecords.length})`,
  );

  // ── Safety blocks ──────────────────────────────────────────────────
  const safetyBlocked = records.filter(r => r.safetyBlocked).length;
  console.log('\nSafety blocks');
  console.log('-'.repeat(50));
  console.log(
    `  Rejected at preflight: ${safetyBlocked} (${pct(safetyBlocked, records.length)})`,
  );

  // ── Latency ────────────────────────────────────────────────────────
  const durations = records.map(r => r.totalDurationMs).filter(d => d > 0).sort((a, b) => a - b);
  const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0;
  const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;
  console.log('\nLatency (per-style generation)');
  console.log('-'.repeat(50));
  console.log(`  p50: ${(p50 / 1000).toFixed(1)}s`);
  console.log(`  p95: ${(p95 / 1000).toFixed(1)}s`);

  // ── Headline: overall Tier 1 + shipped rate ───────────────────────
  const tier1Total = records.filter(r => r.tier === 1).length;
  const shippedTotal = records.filter(r => r.shipped).length;
  console.log('\n' + '='.repeat(50));
  console.log(`HEADLINE`);
  console.log('='.repeat(50));
  console.log(`  Tier 1 hit rate:   ${pct(tier1Total, records.length)} (target: 95%)`);
  console.log(`  Overall shipped:   ${pct(shippedTotal, records.length)} (target: 100%)`);
  console.log('='.repeat(50) + '\n');
}

async function main(): Promise<void> {
  const records = await readInput();
  summary(records);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

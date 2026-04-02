/**
 * Test all non-model styles with a single product (skincare bottle).
 * Validates that every style produces a passing QA score.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv(p: string) {
  try {
    const c = readFileSync(p, 'utf-8');
    for (const l of c.split('\n')) {
      const t = l.trim();
      if (!t || t.startsWith('#')) continue;
      const e = t.indexOf('=');
      if (e === -1) continue;
      process.env[t.slice(0, e).trim()] = t.slice(e + 1).trim();
    }
  } catch {}
}

loadEnv(resolve(import.meta.dirname ?? '.', '../.env'));

const { processProductImage } = await import('../packages/ai/dist/index.js');

// Skincare bottle — branded, good test product
const TEST_IMAGE = 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=800&q=80';

const STYLES = [
  { id: 'style_clean_white', name: 'Clean White' },
  { id: 'style_lifestyle', name: 'Lifestyle' },
  { id: 'style_gradient', name: 'Gradient' },
  { id: 'style_outdoor', name: 'Outdoor' },
  { id: 'style_studio', name: 'Studio' },
  { id: 'style_festive', name: 'Festive' },
  { id: 'style_minimal', name: 'Minimal' },
];

interface Result {
  style: string;
  score: number;
  time: number;
  attempts: number;
  pass: boolean;
  output: string;
}

const results: Result[] = [];

for (const style of STYLES) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STYLE: ${style.name} (${style.id})`);
  console.log('='.repeat(60));

  try {
    const r = await processProductImage({
      imageUrl: TEST_IMAGE,
      style: style.id,
      productCategory: 'skincare',
    });

    const pass = r.qaScore >= 65;
    results.push({
      style: style.name,
      score: r.qaScore,
      time: Math.round(r.durationMs / 1000),
      attempts: r.attempts,
      pass,
      output: r.outputUrl,
    });

    console.log(`  Score: ${r.qaScore} | Time: ${Math.round(r.durationMs / 1000)}s | Attempts: ${r.attempts} | ${pass ? 'PASS' : 'FAIL'}`);
    console.log(`  Output: ${r.outputUrl}`);
  } catch (err) {
    console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    results.push({ style: style.name, score: 0, time: 0, attempts: 0, pass: false, output: '' });
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log('ALL STYLES SUMMARY');
console.log('='.repeat(60));
for (const r of results) {
  const status = r.pass ? '[OK]' : '[FAIL]';
  console.log(`  ${status} ${r.style.padEnd(20)} QA: ${String(r.score).padEnd(5)} Time: ${r.time}s  Attempts: ${r.attempts}`);
  if (r.output) console.log(`       ${r.output}`);
}
const passed = results.filter(r => r.pass).length;
console.log(`\nPASSED: ${passed}/${results.length} | FAILED: ${results.length - passed}`);

if (passed < results.length) process.exit(1);

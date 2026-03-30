/**
 * Test script: run the full AI pipeline (Nano Banana → Segmentation → Bria)
 * with deep product analysis and tailored ad prompts.
 *
 * Run:
 *   cd /Users/lending/WhatsAds && npx tsx scripts/test-pipeline.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env with override so we get fresh values
function loadEnv(envPath: string): void {
  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf-8');
  } catch {
    console.error(`Could not read ${envPath}`);
    return;
  }
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) process.env[key] = value;
  }
}

loadEnv(resolve('/Users/lending/WhatsAds/.env'));

import { processProductImage } from '../packages/ai/dist/index.js';

// ---------------------------------------------------------------------------
// Test config — public product image (leather bag)
// ---------------------------------------------------------------------------

const TEST_IMAGE_URL =
  'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=80';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60));
  console.log('Clickkar Pipeline Test — Nano Banana + Smart Analysis');
  console.log('='.repeat(60));
  console.log('Image URL:', TEST_IMAGE_URL);
  console.log('FAL_KEY:', (process.env['FAL_KEY'] ?? '').slice(0, 12) + '...');
  console.log('GOOGLE_GENAI_API_KEY:', (process.env['GOOGLE_GENAI_API_KEY'] ?? '').slice(0, 12) + '...');
  console.log('(No style or category — system auto-detects everything)');
  console.log();

  const startMs = Date.now();

  try {
    const result = await processProductImage({
      imageUrl: TEST_IMAGE_URL,
      // No style, no category — let the system figure it out
      maxAttempts: 3,
    });

    console.log('\n' + '='.repeat(60));
    console.log('PIPELINE RESULT');
    console.log('='.repeat(60));
    console.log('Pipeline used:', result.pipeline);
    console.log('QA Score:', result.qaScore);
    console.log('Attempts:', result.attempts);
    console.log('Duration:', result.durationMs, 'ms');
    console.log('Output URL:', result.outputUrl);
    if (result.cutoutUrl) {
      console.log('Cutout URL:', result.cutoutUrl);
    }
    if (result.adPrompt) {
      console.log('\nAd Prompt Used:', result.adPrompt);
    }
    if (result.productAnalysis) {
      console.log('\nProduct Analysis:', JSON.stringify({
        productName: result.productAnalysis.productName,
        category: result.productAnalysis.category,
        priceSegment: result.productAnalysis.priceSegment,
        targetAudience: result.productAnalysis.targetAudience,
        mood: result.productAnalysis.recommendedScene.mood,
      }, null, 2));
    }
    if (result.rejected) {
      console.log('REJECTED:', result.rejectionReason);
    }

    console.log('\nSUCCESS — Total time:', Date.now() - startMs, 'ms');
    console.log('\nOpen the Output URL in your browser to inspect the result.');
  } catch (err) {
    console.error('\nPIPELINE FAILED:', err);
    process.exit(1);
  }
}

main().then(() => process.exit(0));

/**
 * Content-safety pre-flight check (Phase B, 2026-04-22).
 *
 * Before launching an expensive 4-candidate Gemini Pro generation, cheaply
 * verify the product is something Gemini can actually render. Products that
 * trip Gemini's safety filters (weapons, explicit items, certain regulated
 * categories) will retry-loop-refund through 3 tiers — wasting $0.50+ in
 * generation cost and ~3 minutes of user wait time.
 *
 * This check runs ONCE per order, before any generation tier fires. If
 * flagged, we fail fast with a clear error (which the refund path picks up
 * in Phase C).
 *
 * Cost: ~$0.001 per order (single Gemini 2.5 Flash Lite call).
 * Latency: ~0.5-1.5s.
 *
 * Never blocks the pipeline on its own failure — if the safety check itself
 * errors out, we default to "safe" and let generation proceed. The Gemini
 * safety filters downstream will catch anything this misses.
 */

import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import type { LightAnalysis } from './light-analyzer.js';

const MODEL = 'gemini-2.5-flash-lite';
const TIMEOUT_MS = 8_000;
const MAX_OUTPUT_TOKENS = 200;

export interface SafetyCheckResult {
  safe: boolean;
  /** Machine-readable category for logging/metrics */
  blockReason?: 'weapon' | 'explicit' | 'drug' | 'alcohol' | 'hate' | 'violence' | 'other';
  /** Human-readable reason, shown to user via WhatsApp if blocked */
  userMessage?: string;
  source: 'llm' | 'fallback_error' | 'fallback_timeout';
  durationMs: number;
}

/**
 * Check if the analyzed product is safe to generate ads for.
 *
 * Takes the lightAnalyze output (not the raw image — cheaper, and the analyzer
 * has already seen the photo). Returns { safe: true } unless there's a clear
 * signal the product is in a category Gemini will block.
 */
export async function checkContentSafety(
  analysis: LightAnalysis,
): Promise<SafetyCheckResult> {
  const startMs = Date.now();

  const prompt = `You are a content policy gate for an AI product-photography service in India. The service generates ad images for D2C small businesses.

Product analyzed:
- Name: ${analysis.productName}
- Category: ${analysis.productCategory}
- Colors: ${analysis.dominantColors?.join(', ') ?? 'unknown'}

Decide: is this product safe to generate commercial ad images for? The generator (Gemini/GPT) will REFUSE if the product is:
- A weapon (gun, knife as weapon, explosives)
- Explicit/adult content (lingerie is borderline; outright adult toys are blocked)
- Illegal drugs or drug paraphernalia
- Branded alcohol (regulated in India — but generic bottles are fine)
- Hate symbols
- Content promoting violence or self-harm

Respond with JSON only:
{"safe": true} OR {"safe": false, "blockReason": "weapon"|"explicit"|"drug"|"alcohol"|"hate"|"violence"|"other", "userMessage": "<one friendly sentence explaining in Hinglish why we can't generate this, e.g. 'Sorry, we can't generate ads for weapons — please try a different product.'>"}`;

  try {
    const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });
    const response = await Promise.race([
      genai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('safety_check_timeout')), TIMEOUT_MS),
      ),
    ]);

    const allText = response.candidates?.[0]?.content?.parts
      ?.map(p => (p as { text?: string }).text ?? '')
      .filter(Boolean)
      .join('\n') ?? '';
    const raw = allText.trim();

    if (!raw) {
      console.warn(JSON.stringify({
        event: 'content_safety_empty_response',
        productName: analysis.productName,
      }));
      return { safe: true, source: 'fallback_error', durationMs: Date.now() - startMs };
    }

    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const jsonStart = stripped.indexOf('{');
    const jsonEnd = stripped.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      try {
        const parsed = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as {
          safe?: boolean;
          blockReason?: string;
          userMessage?: string;
        };

        const safe = parsed.safe !== false;
        const result: SafetyCheckResult = {
          safe,
          source: 'llm',
          durationMs: Date.now() - startMs,
        };

        if (!safe) {
          // Narrow blockReason to our enum
          const validReasons = ['weapon', 'explicit', 'drug', 'alcohol', 'hate', 'violence', 'other'] as const;
          const rawReason = parsed.blockReason;
          result.blockReason =
            typeof rawReason === 'string' && (validReasons as readonly string[]).includes(rawReason)
              ? (rawReason as SafetyCheckResult['blockReason'])
              : 'other';
          result.userMessage =
            typeof parsed.userMessage === 'string' && parsed.userMessage.length > 0
              ? parsed.userMessage
              : 'Sorry, we can\'t generate ads for this product. Please try a different one.';
        }

        console.info(JSON.stringify({
          event: 'content_safety_complete',
          productName: analysis.productName,
          safe,
          blockReason: result.blockReason,
          durationMs: Date.now() - startMs,
        }));

        return result;
      } catch {
        // Parse failed — default to safe so we don't block legitimate products
      }
    }

    console.warn(JSON.stringify({
      event: 'content_safety_unparseable',
      productName: analysis.productName,
      rawText: raw.slice(0, 120),
    }));
    return { safe: true, source: 'fallback_error', durationMs: Date.now() - startMs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('timeout');
    console.warn(JSON.stringify({
      event: 'content_safety_failed',
      productName: analysis.productName,
      error: msg,
      isTimeout,
    }));
    // Fail open: if the safety check itself errored, proceed with generation.
    // Gemini's own filters downstream are the second line of defence.
    return {
      safe: true,
      source: isTimeout ? 'fallback_timeout' : 'fallback_error',
      durationMs: Date.now() - startMs,
    };
  }
}

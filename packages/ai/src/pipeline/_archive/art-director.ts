/**
 * Art Director — LLM-driven creative brief generation per product (Day 2, 2026-04-23).
 *
 * Before image generation, this module receives (productName + style + context)
 * and writes a custom creative brief tailored to THIS specific product —
 * concrete environment, composition, lighting.
 *
 * The brief replaces the static SCHEMA template scene description inside
 * style-prompts-v5 while all preservation anchors and aspect-ratio suffixes
 * stay intact. The goal: make a Bluetooth speaker's ad look different from a
 * jewelry ad from a food ad, instead of forcing all through the same template.
 *
 * Failure-tolerant: if the LLM call fails or returns garbage, returns null
 * and the caller falls back to the static SCHEMA template. The pipeline is
 * never blocked by Art Director unavailability.
 *
 * Cost: ~$0.002 per call. Latency: 3-10s. Runs once per style per attempt
 * (so a 3-style order with 1 retry could fire up to 6 AD calls — still under
 * $0.02 even at max).
 */

import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import type { LightAnalysis } from './light-analyzer.js';
import { pickCompositionSeed } from './composition-library.js';

// gemini-2.5-flash has "thinking" tokens that silently eat the maxOutputTokens
// budget, truncating the visible JSON output. gemini-2.5-flash-lite skips
// thinking entirely — correct choice for this short structured-output task.
// (Same fix pattern we applied to the AI vision best-of-N picker.)
const MODEL = 'gemini-2.5-flash-lite';
const TIMEOUT_MS = 15_000;
const MAX_OUTPUT_TOKENS = 800;
const MIN_BRIEF_LEN = 80;
const MAX_BRIEF_LEN = 1400;

// Human-readable style philosophy. Injected into the LLM prompt so the
// Art Director understands what the style is FOR, not just its ID.
const STYLE_PHILOSOPHY: Record<string, string> = {
  style_clean_white:
    'Clean, commercial product photography on a seamless white cyclorama. Minimal, precise, catalog-ready for an e-commerce listing.',
  style_studio:
    'Bold colored studio backdrop with 1-2 contextual props that match the product\'s use. Editorial, vibrant, confident.',
  style_gradient:
    'Cinematic dark luxury. Premium magazine campaign feel. Moody, theatrical, refined — black marble, velvet, brass, dramatic shadows.',
  style_lifestyle:
    'Warm lived-in lifestyle. Product placed naturally in the real-world setting where customers actually use it (home, cafe, desk, kitchen).',
  style_outdoor:
    'Natural outdoor setting with golden-hour light. Environmental framing — park, beach, forest, street — picked to match the product.',
  style_festive:
    'Indian festive celebration. Traditional elements (diyas, marigolds, gold, rangoli, silk), warm 2700K light, celebratory and joyful.',
  style_minimal:
    'Architectural minimalism. Vast negative space, one subtle geometric element (pedestal, cast shadow, color block), pastel palette, calm restraint.',
  style_with_model:
    'Lifestyle shot featuring a single person naturally using, wearing, or holding the product. Relatable, authentic, unposed.',
  style_autmn_special:
    'Striking, unexpected creative direction. Art-directed to be memorable and thumb-stopping on Instagram — but strictly photorealistic (no illustration, no 3D render). Wild Card mode: push for a composition nobody else would think of, while staying authentic to the product category.',
};

const STYLE_NAME: Record<string, string> = {
  style_clean_white: 'Clean White',
  style_studio: 'Colored Studio',
  style_gradient: 'Dark Luxury',
  style_lifestyle: 'Lifestyle',
  style_outdoor: 'Outdoor',
  style_festive: 'Festive Indian',
  style_minimal: 'Minimal',
  style_with_model: 'With Model',
  // Internal: "Creative Signature" (avoids Gemini misreading "Autmn" as autumn).
  style_autmn_special: 'Creative Signature',
};

export interface ArtDirectorParams {
  style: string;
  analysis: LightAnalysis;
  /** Customer notes if they attached instructions alongside their photos. */
  userInstructions?: string;
}

export interface ArtDirectorResult {
  /** Custom creative brief (80-1400 chars) or null if the LLM call failed. */
  brief: string | null;
  /** Why we got this result — useful for metrics. */
  source: 'llm' | 'fallback_empty' | 'fallback_unparseable' | 'fallback_too_short' | 'fallback_timeout' | 'fallback_error';
  /** Wall-clock time for the AD call. */
  durationMs: number;
}

/**
 * Generate a custom creative brief for one (product, style) pair.
 *
 * Pure function — no side effects beyond structured logs. Safe to call
 * concurrently for all N styles of a single order.
 */
export async function generateCreativeBrief(
  params: ArtDirectorParams,
): Promise<ArtDirectorResult> {
  const startMs = Date.now();
  const { style, analysis, userInstructions } = params;

  const stylePhilosophy = STYLE_PHILOSOPHY[style] ?? STYLE_PHILOSOPHY['style_lifestyle']!;
  const styleName = STYLE_NAME[style] ?? 'Lifestyle';

  const productDescriptor =
    analysis.itemCount > 1 && analysis.items.length > 1
      ? `${analysis.setDescription ?? `${analysis.items.length}-piece set`} consisting of ${analysis.items.join(', ')}`
      : analysis.productName;

  // Phase A (2026-04-22): seed the AD with a random composition from the
  // library. This forces variety across runs — AD riffs on the seed instead
  // of converging on the same "polished marble, warm amber" default every
  // time for Dark Luxury, etc.
  const compositionSeed = pickCompositionSeed(style);

  const prompt = buildArtDirectorPrompt({
    productDescriptor,
    category: analysis.productCategory,
    dominantColors: analysis.dominantColors?.join(', ') ?? 'neutral',
    typicalSetting: analysis.typicalSetting ?? 'tabletop',
    physicalSize: analysis.physicalSize,
    styleName,
    stylePhilosophy,
    isWildCard: style === 'style_autmn_special',
    compositionSeed,
    userInstructions,
  });

  try {
    const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });
    const response = await Promise.race([
      genai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.7, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('art_director_timeout')), TIMEOUT_MS),
      ),
    ]);

    const allText = response.candidates?.[0]?.content?.parts
      ?.map(p => (p as { text?: string }).text ?? '')
      .filter(Boolean)
      .join('\n') ?? '';
    const raw = allText.trim();

    if (!raw) {
      console.warn(JSON.stringify({ event: 'art_director_empty', style, productName: analysis.productName }));
      return { brief: null, source: 'fallback_empty', durationMs: Date.now() - startMs };
    }

    // Parse JSON (strip prose prefix and markdown fences)
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const jsonStart = stripped.indexOf('{');
    const jsonEnd = stripped.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      try {
        const parsed = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as { brief?: unknown };
        if (typeof parsed.brief === 'string') {
          const brief = parsed.brief.trim();
          if (brief.length >= MIN_BRIEF_LEN && brief.length <= MAX_BRIEF_LEN) {
            console.info(JSON.stringify({
              event: 'art_director_brief_generated',
              style,
              productName: analysis.productName,
              briefLength: brief.length,
              compositionSeedUsed: !!compositionSeed,
              durationMs: Date.now() - startMs,
            }));
            return { brief, source: 'llm', durationMs: Date.now() - startMs };
          }
          console.warn(JSON.stringify({
            event: 'art_director_brief_out_of_bounds',
            style,
            briefLength: brief.length,
            min: MIN_BRIEF_LEN,
            max: MAX_BRIEF_LEN,
          }));
          return { brief: null, source: 'fallback_too_short', durationMs: Date.now() - startMs };
        }
      } catch {
        // fall through to unparseable
      }
    }

    console.warn(JSON.stringify({
      event: 'art_director_unparseable',
      style,
      rawText: raw.slice(0, 160),
    }));
    return { brief: null, source: 'fallback_unparseable', durationMs: Date.now() - startMs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('timeout');
    console.warn(JSON.stringify({
      event: 'art_director_failed',
      style,
      productName: analysis.productName,
      error: msg,
      isTimeout,
    }));
    return {
      brief: null,
      source: isTimeout ? 'fallback_timeout' : 'fallback_error',
      durationMs: Date.now() - startMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Prompt template
// ---------------------------------------------------------------------------

function buildArtDirectorPrompt(ctx: {
  productDescriptor: string;
  category: string;
  dominantColors: string;
  typicalSetting: string;
  physicalSize: string;
  styleName: string;
  stylePhilosophy: string;
  isWildCard: boolean;
  compositionSeed: string;
  userInstructions?: string;
}): string {
  const wildCardAddendum = ctx.isWildCard
    ? `

## Creative Signature mode (wild card)
For THIS style specifically, push past obvious. Pick a composition that would make a D2C founder want to ship this immediately to Instagram Reels. Unexpected but authentic to what the product IS and what it DOES — not thematically random. The strangest-composition-that-still-makes-sense wins.`
    : '';

  const compositionSection = ctx.compositionSeed
    ? `

## Starting composition (seed — riff on this, don't repeat verbatim)
${ctx.compositionSeed}

Use this seed as inspiration. Adapt it to THIS product. Keep the spirit (surface, lighting direction, mood) but make it work for the specific product category.`
    : '';

  return `You are an art director for a D2C product advertisement. Write a short creative brief for the SCENE ONLY — the product itself will be preserved exactly from a reference photo (you don't control the product's appearance).

## Product
Name: ${ctx.productDescriptor}
Category: ${ctx.category}
Dominant colors: ${ctx.dominantColors}
Typical real-world setting: ${ctx.typicalSetting}
Physical size: ${ctx.physicalSize}

## Style
"${ctx.styleName}" — ${ctx.stylePhilosophy}${wildCardAddendum}${compositionSection}${ctx.userInstructions ? `

## Customer note (honor this above style defaults)
"${ctx.userInstructions}"` : ''}

## Your brief must cover
1. Environment — concrete setting/surface/location
2. Composition — framing, angle, depth of field, where in frame the product sits
3. Lighting — source, quality, direction, color temperature (cinematographer-level specifics)
4. Mood — one or two adjectives

## Rules
- Photographic language only: "50mm f/1.8, warm 3000K key light, tungsten spotlight from camera-left". NOT "atmospheric haze" by itself.
- Be specific to THIS product. A Dark Luxury ad for a Bluetooth speaker shouldn't match one for jewelry.
- No meta-prompts ("think about...", "imagine..."). State direct art direction.
- Do NOT describe the product itself — it'll be preserved from the reference. Describe the scene AROUND the product.
- Target length: 200-400 characters.

## Output format
Respond with JSON only, no prose outside the JSON:
{"brief": "<your 200-400 character creative brief>"}`;
}

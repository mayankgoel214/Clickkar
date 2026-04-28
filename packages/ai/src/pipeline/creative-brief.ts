/**
 * Creative Brief — V1.1 per-product art direction.
 *
 * Single Gemini 2.5 Flash call that:
 *   1. Looks at the product photo(s)
 *   2. Builds a product profile (what it is, who buys it, cultural fit)
 *   3. Generates per-style creative direction (10-25 words per style)
 *
 * The creative direction is appended to the Beta prompt so each product
 * gets a UNIQUE ad direction per style, not a generic style template.
 *
 * Failure mode: any error → returns null. The pipeline falls back to V1
 * base Beta prompt (proven). Never breaks the pipeline.
 *
 * Cost: ~₹0.08-0.12 per order (one call regardless of style count).
 * Latency: ~3-5s.
 */

import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const ProductProfileSchema = z.object({
  productType: z.string().min(1).max(150),
  brandIdentity: z.string().min(1).max(200),
  visualCharacter: z.array(z.string()).min(1).max(6),
  targetAudience: z.string().min(1).max(180),
  emotionalHooks: z.array(z.string()).min(1).max(5),
  useContexts: z.array(z.string()).min(1).max(5),
  culturalFit: z.string().min(1).max(180),
  uniqueness: z.string().min(1).max(200),
});

export type ProductProfile = z.infer<typeof ProductProfileSchema>;

export const StyleDirectionSchema = z.object({
  sceneDirection: z.string().min(1).max(250),
  moodAnchor: z.string().min(1).max(80),
});

export type StyleDirection = z.infer<typeof StyleDirectionSchema>;

export const CreativeBriefSchema = z.object({
  profile: ProductProfileSchema,
  directions: z.record(z.string(), StyleDirectionSchema),
});

export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Per-style specialist photographer persona — V1.2.
 *
 * Each style is treated as a SPECIALIST studio. The brief LLM is told to
 * think like that specialist photographer when writing per-product direction.
 * This pulls Pro toward a coherent aesthetic per style instead of generic
 * "good ad photography".
 *
 * Format: Persona + Reference aesthetic + Technical signature + Direction rule.
 * Each section ~1 line. Total ~4 lines per style — short enough that the LLM
 * doesn't drown in instructions, rich enough to drive specialized output.
 */
const STYLE_INTENT: Record<string, string> = {
  style_clean_white:
    `Persona: luxury e-commerce hero photographer (Apple, Hermès, Sephora flagship style). Signature: seamless white cyclorama, dual studio strobes, 100mm macro, focus-stacked. Direction must describe: clean hero composition + lighting setup. NO model, no human, no scene narrative.`,

  style_studio:
    `Persona: editorial fashion magazine photographer (Vogue, Elle, GQ campaign style). Signature: saturated cyclorama backdrop, single rim light, 50mm prime, color-block confidence. Direction must describe: bold backdrop color + composition + at most one minimal prop. NO model, no human.`,

  style_lifestyle:
    `Persona: environmental commercial photographer (Apple, IKEA, Airbnb campaign style). Signature: natural window light, 35-50mm, shallow DOF, real lived-in setting. Direction must describe: specific Indian everyday context (home counter / cafe table / desk) + 2-3 contextual props + lighting time-of-day. NO model — environmental product shot only.`,

  style_gradient:
    `Persona: luxury campaign cinematographer (Tom Ford, Bvlgari, Cartier style). Signature: cinematic key + rim lighting, deep shadows, 85mm portrait lens, atmospheric haze. Direction must describe: dark surface choice + rim light angle + atmospheric depth. NO model, no human.`,

  style_outdoor:
    `Persona: travel/adventure environmental photographer (National Geographic, REI, Patagonia style). Signature: golden hour natural light, 35mm wide, environmental depth, shallow DOF separating product from environment. Direction must describe: outdoor setting matching product use context + lighting time + environmental depth. NO model, no person, no human.`,

  style_festive:
    `Persona: Indian celebration campaign photographer (Tanishq, Sabyasachi, Manyavar style). Signature: warm 2700K diya/candle key light, brass + marigold + silk props, environmental depth, traditional moment. Direction must describe: specific Indian festive context (Diwali / wedding / Karwa Chauth / Eid) + 2-3 traditional props + warm light source. NO model — product placed in cultural setting only.`,

  style_minimal:
    `Persona: architectural design photographer (Aesop, Muji, Apple Pro Display style). Signature: even soft light, deliberate negative space, geometric precision, restrained palette. Direction must describe: muted background color + intentional empty-space composition + 0-1 geometric element. NO model, no human.`,

  style_with_model:
    `Persona: authentic candid lifestyle portraitist (Apple "Shot on iPhone", Levi's, Patagonia style). Signature: natural light, 50-85mm, shallow DOF, candid expression. ONLY style permitted to include a person. Direction must describe: who the model is + how they interact with the product + the setting + the emotional moment.`,

  style_autmn_special:
    `Persona: art-direction-driven editorial photographer (Wallpaper*, Kinfolk, Apartamento style). Signature: unconventional angle/setup, conceptual hook, magazine-cover composition. Direction must describe: ONE bold creative concept (suspended product / unusual surface / frozen-moment scene / scattered elements) + lighting + mood. NO model, no human — pure conceptual product hero.`,
};

function buildBriefPrompt(
  styles: string[],
  productCategory: string | undefined,
  perStyleInstructions: Record<string, string | null> | undefined,
  globalInstruction: string | null | undefined,
): string {
  const stylesWithIntent = styles
    .map(s => `- ${s}: ${STYLE_INTENT[s] ?? 'professional ad campaign'}`)
    .join('\n');

  const categoryHint = productCategory
    ? `\nThe seller categorized this as: ${productCategory}`
    : '';

  // V1.2.1 — surface parsed customer instructions so brief LLM weaves them
  // into per-style direction instead of letting them conflict with the brief.
  const hasPerStyle = perStyleInstructions && Object.values(perStyleInstructions).some(v => v && v.trim().length > 0);
  const hasGlobal = !!(globalInstruction && globalInstruction.trim().length > 0);

  const instructionBlock = (hasPerStyle || hasGlobal)
    ? `\n\n🎯 CUSTOMER INSTRUCTIONS (honor these — weave into your direction, do NOT just replace it):
${hasGlobal ? `- Apply to ALL styles: "${globalInstruction}"` : ''}
${hasPerStyle ? Object.entries(perStyleInstructions!).filter(([_, v]) => v && v.trim()).map(([s, v]) => `- ${s}: "${v}"`).join('\n') : ''}

When integrating: keep your professional photographer's eye. The customer's words are intent, not exact wording. E.g. if they say "green color", you decide what shade, where, how — sage green linen backdrop / emerald cyclorama / pistachio gradient — pick what flatters the product.`
    : '';

  return `You are an Indian D2C ad creative director. Look at the product photo(s) and write a creative brief for an ad photographer.${categoryHint}${instructionBlock}

🛑 STRICT RULES (violations = wrong output):

1. ONLY \`style_with_model\` may include a person, model, hands, face, or human body in the scene. Every other style MUST be product-only — no model, no hands, no face, no person visible. If you write "on a model's neck" or "a person holding" for any style other than \`style_with_model\`, the output is wrong.

2. Describe ONLY the scene, environment, lighting, props, and composition. NEVER suggest the product itself should change color, change variant, match the mood, or be modified in any way. The product is FIXED — only the world around it varies. Do NOT write things like "darkened can", "matching the dark mood", "tinted to match the backdrop". The product stays exactly as shown in the reference photos.

3. Direction must be UNIQUE per product. A festive direction for jewellery should not equal a festive direction for tech. Pull on the product profile, the brand identity, and the cultural fit you assessed.

4. Direction must be CONCRETE and PHOTOGRAPHABLE. Vague: "festive scene with warm lighting". Correct: "bridal preparation moment, gold jewellery on red velvet, marigold strings draped, candlelight from brass diyas".

Output STRICT JSON in this exact shape (no markdown fences, no commentary):

{
  "profile": {
    "productType": "Specific product description, 5-15 words",
    "brandIdentity": "Brand name + visual personality, one sentence",
    "visualCharacter": ["3-5 visual descriptors as single words"],
    "targetAudience": "Who buys this (Indian context where relevant), one phrase",
    "emotionalHooks": ["2-4 emotional promises this product makes"],
    "useContexts": ["2-4 typical scenarios where this product is used"],
    "culturalFit": "Indian-coded / modern global / traditional / festive — pick the best fit + why, one phrase",
    "uniqueness": "What makes THIS specific product distinctive — one sentence"
  },
  "directions": {
${styles.map(s => `    "${s}": { "sceneDirection": "...", "moodAnchor": "..." }`).join(',\n')}
  }
}

For each style direction:
- "sceneDirection" is 10-25 words: WHERE the product is placed + WHAT'S happening + ONE specific visual element. Concrete. Photographable. Indian-culturally-fluent where it fits the product.
- "moodAnchor" is 3-7 words capturing emotional/visual tone (e.g. "warm and aspirational", "bold editorial confidence", "opulent traditional luxury").
- Each direction must be UNIQUE to this product — not a generic style template. A jewellery festive direction should not equal a tech festive direction.

Style intents:
${stylesWithIntent}

Indian D2C cultural notes (apply where the product fits):
- Festive moments: Diwali, weddings, Karwa Chauth, Eid, Onam — soft warm 2700-3200K light, marigolds, diyas, gold trims
- Lifestyle settings: Indian homes (joint family, kirana), modern apartments, balconies with plants, Indian streets, cafes
- Models: Indian skin tones, real body types, modest poses for traditional products, modern poses for tech/casual
- Festive jewellery: bridal preparation, family blessing moments
- Tech/electronics: young urban professional, work-from-home, weekend hangout
- Beauty/skincare: bathroom counter routines, morning light, ingredient hints (turmeric, neem)
- Apparel: festive vs everyday context, fabric draping clearly visible
- Food: family meal context, kirana shop, cafe table, kitchen counter
- Home goods: lived-in Indian home, brass/wood/textile elements

Be SPECIFIC and CONCRETE. Direction like "festive scene with warm lighting" is too generic. Direction like "bridal preparation moment, gold jewellery on velvet tray, marigold strings, candlelight" is right.

Return ONLY the JSON. No commentary.`;
}

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

const BASE_TIMEOUT_MS = 12_000;
const PER_EXTRA_PHOTO_MS = 3_000;
const MAX_TIMEOUT_MS = 25_000;

function computeTimeoutMs(bufferCount: number): number {
  if (bufferCount <= 1) return BASE_TIMEOUT_MS;
  return Math.min(BASE_TIMEOUT_MS + PER_EXTRA_PHOTO_MS * (bufferCount - 1), MAX_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a per-product creative brief covering the requested styles.
 *
 * V1.2.1: optionally accepts parsed per-style + global customer instructions.
 * When provided, the brief LLM weaves them into its per-style direction so the
 * customer's wishes inform the scene from the start, instead of conflicting
 * with the brief at the final-prompt stage.
 *
 * Returns null on any error — caller should fall back to V1 base Beta prompt.
 */
export async function generateCreativeBrief(params: {
  buffers: Buffer[];
  styles: string[];
  productCategory?: string;
  perStyleInstructions?: Record<string, string | null>;
  globalInstruction?: string | null;
}): Promise<CreativeBrief | null> {
  const { buffers, styles, productCategory, perStyleInstructions, globalInstruction } = params;

  if (buffers.length === 0 || styles.length === 0) return null;

  const start = Date.now();

  try {
    const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });
    const timeoutMs = computeTimeoutMs(buffers.length);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`creative_brief_timeout:${timeoutMs}ms`)),
        timeoutMs,
      ),
    );

    const imageParts = buffers.flatMap((buf, idx) => [
      { text: `Photo ${idx + 1}:` },
      { inlineData: { mimeType: 'image/jpeg' as const, data: buf.toString('base64') } },
    ]);

    const briefPrompt = buildBriefPrompt(styles, productCategory, perStyleInstructions, globalInstruction);

    const response = await Promise.race([
      genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [...imageParts, { text: briefPrompt }],
          },
        ],
        config: { temperature: 0.4 },
      }),
      timeoutPromise,
    ]);

    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn(JSON.stringify({
        event: 'creative_brief_parse_failed',
        rawText: rawText.slice(0, 500),
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      }));
      return null;
    }

    const result = CreativeBriefSchema.safeParse(parsed);
    if (!result.success) {
      console.warn(JSON.stringify({
        event: 'creative_brief_validation_failed',
        zodError: result.error.issues.slice(0, 5),
        rawSnippet: cleaned.slice(0, 300),
      }));
      return null;
    }

    // Verify all requested styles got a direction
    const missingStyles = styles.filter(s => !result.data.directions[s]);
    if (missingStyles.length > 0) {
      console.warn(JSON.stringify({
        event: 'creative_brief_missing_styles',
        missingStyles,
      }));
      return null;
    }

    const durationMs = Date.now() - start;
    console.info(JSON.stringify({
      event: 'creative_brief_generated',
      stylesCount: styles.length,
      bufferCount: buffers.length,
      productType: result.data.profile.productType.slice(0, 60),
      durationMs,
    }));

    return result.data;
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'creative_brief_failed',
      reason: err instanceof Error ? err.message.slice(0, 200) : String(err),
      durationMs: Date.now() - start,
    }));
    return null;
  }
}

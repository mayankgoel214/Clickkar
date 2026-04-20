import { getProviderKey } from '@autmn/keypool';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const PerStyleInstructionResultSchema = z.object({
  perStyle: z.record(z.string(), z.string().nullable()),
  globalInstruction: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type PerStyleInstructionResult = z.infer<typeof PerStyleInstructionResultSchema>;

// ---------------------------------------------------------------------------
// Style display names (must match getStyleDisplayName in style-prompts-v5.ts)
// ---------------------------------------------------------------------------

function getStyleDisplayName(style: string): string {
  switch (style) {
    case 'style_clean_white':    return 'Clean White';
    case 'style_studio':         return 'Colored Studio';
    case 'style_gradient':       return 'Gradient';
    case 'style_lifestyle':      return 'Lifestyle';
    case 'style_outdoor':        return 'Outdoor';
    case 'style_festive':        return 'Festive';
    case 'style_minimal':        return 'Minimal';
    case 'style_with_model':     return 'With Model';
    case 'style_autmn_special':  return 'Autmn Special';
    default:                     return style;
  }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parses a free-form customer instruction and splits it into per-style slices.
 *
 * Example input:
 *   rawInstructions: "for the model style make him Kashmiri male, for the colored studio add pride flag background"
 *   styles: ['style_autmn_special', 'style_with_model', 'style_studio']
 *
 * Example output:
 *   {
 *     perStyle: {
 *       style_autmn_special: null,
 *       style_with_model: 'make the model a Kashmiri male',
 *       style_studio: 'add pride flag background',
 *     },
 *     globalInstruction: null,
 *     confidence: 0.9
 *   }
 *
 * Uses Gemini 2.5 Flash (text-only — no images). Falls back gracefully on any error
 * by returning the raw instruction as globalInstruction (current behavior — apply
 * everywhere). Timeout: 12s.
 */
export async function parsePerStyleInstructions(params: {
  rawInstructions: string;
  styles: string[];
}): Promise<PerStyleInstructionResult> {
  const { rawInstructions, styles } = params;

  // Build a fallback result where the entire raw instruction becomes the global
  // instruction. This preserves current behavior if parsing fails.
  const buildFallback = (): PerStyleInstructionResult => ({
    perStyle: Object.fromEntries(styles.map(s => [s, null])),
    globalInstruction: rawInstructions,
    confidence: 0,
  });

  if (!rawInstructions.trim() || styles.length === 0) {
    return buildFallback();
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

    const styleList = styles
      .map((s, i) => `${i + 1}. "${getStyleDisplayName(s)}" (id: ${s})`)
      .join('\n');

    const prompt = `You are an instruction parser for a product photography service.

The customer selected these styles for their order:
${styleList}

They sent this free-form instruction (may be in English, Hindi, or Hinglish):
"${rawInstructions}"

Your job: split the instruction into per-style slices. Each style gets only the parts that were explicitly directed at it. Any parts that have no style reference and apply generally go in globalInstruction.

Rules:
1. If a clause explicitly names a style (e.g. "for the model style", "in the colored studio one", "autmn special mein", "the creative one"), assign the full clause (including all sub-clauses scoped under it) to that style.
2. "Model style" / "with model" / "model shot" / "model wala" → style_with_model
3. "Colored studio" / "studio shot" / "color backdrop" / "studio wala" → style_studio
4. "Autmn special" / "creative one" / "special one" / "autumn special" → style_autmn_special
5. "Clean white" / "white background" → style_clean_white
6. "Lifestyle" → style_lifestyle (unless "with model" is also mentioned, then style_with_model)
7. "Gradient" / "dark" / "moody" → style_gradient
8. "Outdoor" / "nature" / "golden hour" → style_outdoor
9. "Festive" / "Diwali" / "Indian festival" → style_festive
10. "Minimal" / "minimalist" → style_minimal
11. If a clause scoped to one style has multiple sub-parts joined by "and"/"also"/"plus", keep them all together in that style's instruction (do NOT split them).
12. Global = applies to all styles (e.g. "make everything premium", "sunset lighting mein banao", "use warm tones", "in Mumbai").
13. Translate Hindi / Hinglish fragments to clean English in your output.
14. Keep each instruction concise — just the actionable directive, stripped of filler words.
15. Styles not mentioned: set to null.
16. Confidence: 0.9+ if clear per-style tags, 0.5-0.8 if ambiguous, <0.5 if you had to guess.

Respond with ONLY valid JSON. No markdown, no commentary.

{
  "perStyle": {
${styles.map(s => `    "${s}": "instruction or null"`).join(',\n')}
  },
  "globalInstruction": "instruction that applies to all styles, or null",
  "confidence": 0.0
}`;

    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.1 },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('per-style instruction parsing timed out after 12s')), 12_000)
      ),
    ]);

    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error(JSON.stringify({
        event: 'per_style_parse_json_failed',
        rawText: rawText.slice(0, 500),
      }));
      return buildFallback();
    }

    const result = PerStyleInstructionResultSchema.parse(parsed);

    // Ensure every requested style has an entry (null if Gemini omitted it)
    for (const s of styles) {
      if (!(s in result.perStyle)) {
        result.perStyle[s] = null;
      }
    }

    console.info(JSON.stringify({
      event: 'per_style_parse_complete',
      styleCount: styles.length,
      confidence: result.confidence,
      perStyle: result.perStyle,
      globalInstruction: result.globalInstruction,
    }));

    return result;
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'per_style_parse_failed',
      error: err instanceof Error ? err.message : String(err),
      fallback: 'apply_raw_to_all_styles',
    }));
    return buildFallback();
  }
}

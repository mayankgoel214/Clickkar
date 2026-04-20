/**
 * V5 Light Analyzer — fast 7-field product analysis.
 * Replaces the 42-field analyzeProductV4 for routing/labeling only.
 * ~3s, one Gemini text call, minimal tokens.
 */

import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = [
  'food',
  'jewellery',
  'garment',
  'skincare',
  'candle',
  'bag',
  'home_goods',
  'electronics',
  'handicraft',
  'other',
] as const;

export const LightAnalysisSchema = z.object({
  productName: z.string().catch('product'),
  productCategory: z
    .string()
    .transform(v =>
      (VALID_CATEGORIES as readonly string[]).includes(v) ? v : 'other',
    )
    .catch('other'),
  hasBranding: z.boolean().catch(true), // conservative default
  physicalSize: z.enum(['tiny', 'small', 'medium', 'large']).catch('medium'),
  dominantColors: z.array(z.string()).max(3).catch(['neutral']),
  typicalSetting: z.string().catch('tabletop'),
  usable: z.boolean().catch(true),
  // How many distinct pieces/items visible in the photo.
  // 1 for a single product, 2+ for multi-piece sets (jewelry sets, cosmetics bundles, gift hampers, etc.)
  itemCount: z.number().int().min(1).max(10).catch(1),
  // Each individual item enumerated — e.g., ["necklace", "matching earrings", "maang tika"]
  // For single items, a 1-element array (e.g., ["chocolate bar"])
  items: z.array(z.string()).min(1).max(10).catch(['product']),
  // Collective name for the set (only populated when itemCount > 1).
  // Examples: "bridal jewelry set", "3-piece cosmetics bundle", "gift hamper"
  setDescription: z.string().nullable().catch(null),
});

export type LightAnalysis = z.infer<typeof LightAnalysisSchema>;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildAnalysisPrompt(bufferCount: number): string {
  return `You are looking at ${bufferCount} photo(s) of the SAME product — multiple angles/faces/views of one item (or one set). Analyze them TOGETHER to build a complete understanding of the product. Your job:
- If they show the same single-item product from different angles, itemCount is 1, and your productName should capture the full product (all colors, all sides visible across the photos).
- If they show a multi-piece set (e.g., jewelry necklace + earrings + tika), itemCount is the number of distinct pieces across all photos, and items[] enumerates each piece.
- Do NOT count the same item photographed from different angles as multiple items.

Answer these 10 questions as JSON. Nothing else.

1. productName: What is this product? Be specific (e.g. "Cadbury Dairy Milk chocolate bar", not "chocolate"). For multi-piece sets, give a short collective name (e.g. "Kundan Polki bridal jewelry set").
2. productCategory: One of: food, jewellery, garment, skincare, candle, bag, home_goods, electronics, handicraft, other.
3. hasBranding: Can you see any brand name, logo, or printed text on the product? true/false.
4. physicalSize: How big is ONE unit of this product in real life? Use these anchors:
   - tiny (<5cm): ring, earring stud, coin, small pendant
   - small (5-15cm): phone, wallet, earring jhumka, small bottle, stapler
   - medium (15-30cm): book, necklace, bottle of wine, shoe
   - large (30cm+): laptop, bag, saree, backpack
   For a multi-piece set (necklace + earrings + tikka), classify by the MAIN piece (necklace).
5. dominantColors: The 2-3 main colors of the product (e.g. ["gold", "maroon"]). Use ALL photos to capture colors visible from any angle.
6. typicalSetting: Where would you naturally find/use this product? One phrase (e.g. "kitchen counter", "woman's neck", "office desk").
7. usable: Is this a clear photo of a product that can be used for advertising? false if blurry, no product visible, screenshot, or meme.
8. itemCount: How many DISTINCT pieces/items exist across ALL photos? Use 1 for a single product shown from multiple angles (single chocolate bar, single bottle, single dress). Use 2+ when the photos collectively show multiple distinct pieces that form a set (necklace + earrings + maang tika = 3; lehenga + dupatta + blouse = 3; 4 different candles = 4). Count only distinct items, not the same item seen from different angles. itemCount MUST equal the length of the "items" array.
9. items: An array enumerating each distinct item across ALL photos, in plain descriptive English. Examples: ["Kundan Polki necklace with emerald drops", "matching kundan drop earrings", "maang tika"] for a jewelry set; or ["Kinder Bueno White chocolate bar"] for a single bar. Use 1-10 entries. For a single product, put one entry. This array's length MUST equal itemCount.
10. setDescription: If itemCount > 1, give a concise collective name for the set (e.g. "bridal jewelry set", "lehenga set", "skincare kit", "chocolate hamper"). If itemCount === 1, set to null.

Return ONLY valid JSON, no markdown fences.`;
}

const TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function lightAnalyze(buffers: Buffer[]): Promise<LightAnalysis> {
  if (buffers.length === 0) {
    throw new Error('lightAnalyze requires at least 1 buffer');
  }

  const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('lightAnalyze timed out after 10s')),
      TIMEOUT_MS,
    ),
  );

  const analysisPrompt = buildAnalysisPrompt(buffers.length);

  // Build image parts — one inlineData part per buffer, labeled "Photo 1", "Photo 2", etc.
  const imageParts = buffers.flatMap((buf, idx) => [
    { text: `Photo ${idx + 1}:` },
    { inlineData: { mimeType: 'image/jpeg' as const, data: buf.toString('base64') } },
  ]);

  try {
    const response = await Promise.race([
      genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              ...imageParts,
              { text: analysisPrompt },
            ],
          },
        ],
        config: { temperature: 0 },
      }),
      timeoutPromise,
    ]);

    const rawText =
      response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed: unknown = JSON.parse(cleaned);
    const result = LightAnalysisSchema.parse(parsed);

    console.info(
      JSON.stringify({
        event: 'v5_light_analysis_done',
        photoCount: buffers.length,
        productName: result.productName,
        category: result.productCategory,
        hasBranding: result.hasBranding,
        size: result.physicalSize,
        usable: result.usable,
        itemCount: result.itemCount,
        items: result.items,
        setDescription: result.setDescription,
      }),
    );

    return result;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: 'v5_light_analysis_failed',
        error: err instanceof Error ? err.message : String(err),
        fallback: 'using conservative defaults',
      }),
    );

    return {
      productName: 'product',
      productCategory: 'other',
      hasBranding: true,
      physicalSize: 'medium',
      dominantColors: ['neutral'],
      typicalSetting: 'tabletop',
      usable: true,
      itemCount: 1,
      items: ['product'],
      setDescription: null,
    };
  }
}

import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { PRODUCT_ANALYSIS_PROMPT } from '../prompts/product-analysis.js';
import { AD_PROMPT_GENERATOR_PROMPT } from '../prompts/ad-prompt-generator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const ProductAnalysisSchema = z.object({
  productName: z.string(),
  brandName: z.string().nullable(),
  productType: z.string(),
  specificDescription: z.string(),
  dominantColors: z.array(z.string()),
  material: z.string(),
  shape: z.string(),
  keyVisualElements: z.array(z.string()),
  visibleText: z.array(z.string()),
  targetAudience: z.string(),
  priceSegment: z.enum(['budget', 'mid_range', 'premium', 'luxury']),
  salesChannel: z.string(),
  desiredEmotion: z.string(),
  recommendedScene: z.object({
    surface: z.string(),
    background: z.string(),
    lighting: z.string(),
    colorPalette: z.string(),
    props: z.array(z.string()),
    mood: z.string(),
    photographyStyle: z.string(),
  }),
  category: z.enum([
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
  ]),
});

export type ProductAnalysis = z.infer<typeof ProductAnalysisSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------------
// Deep product analysis via Gemini
// ---------------------------------------------------------------------------

/**
 * Analyze a product image deeply using Gemini vision.
 *
 * Returns structured data about the product: name, brand, colors, materials,
 * target audience, and a recommended ad scene — everything needed to generate
 * a tailored prompt for the image generation model.
 */
export async function analyzeProduct(
  imageBuffer: Buffer
): Promise<ProductAnalysis> {
  const startMs = Date.now();

  const genai = new GoogleGenAI({
    apiKey: process.env['GOOGLE_GENAI_API_KEY']!,
  });

  const base64Image = imageBuffer.toString('base64');
  const mimeType = detectMime(imageBuffer);

  const response = await genai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: PRODUCT_ANALYSIS_PROMPT },
        ],
      },
    ],
  });

  const rawText =
    response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Gemini returned non-JSON for product analysis: ${rawText.slice(0, 300)}`
    );
  }

  const result = ProductAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Product analysis schema validation failed: ${result.error.message}`
    );
  }

  console.info(
    JSON.stringify({
      event: 'product_analysis_complete',
      productName: result.data.productName,
      category: result.data.category,
      priceSegment: result.data.priceSegment,
      mood: result.data.recommendedScene.mood,
      durationMs: Date.now() - startMs,
    })
  );

  return result.data;
}

// ---------------------------------------------------------------------------
// Ad prompt generation via Gemini
// ---------------------------------------------------------------------------

/**
 * Generate a tailored Nano Banana prompt from the product analysis.
 *
 * Uses Gemini Flash Lite (cheaper, text-only) to transform the structured
 * analysis into a 40-80 word scene description optimized for the image
 * generation model.
 */
export async function generateAdPrompt(
  analysis: ProductAnalysis,
  voiceInstructions?: string
): Promise<string> {
  const startMs = Date.now();

  const genai = new GoogleGenAI({
    apiKey: process.env['GOOGLE_GENAI_API_KEY']!,
  });

  let promptInput = AD_PROMPT_GENERATOR_PROMPT + JSON.stringify(analysis, null, 2);

  if (voiceInstructions && voiceInstructions.trim().length > 0) {
    promptInput += `\n\nAdditional instructions from the user (incorporate these into the scene): ${voiceInstructions.trim()}`;
  }

  const response = await genai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [{ text: promptInput }],
      },
    ],
  });

  const rawText =
    response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Clean up — remove any quotes or markdown the model might wrap around the prompt
  const adPrompt = rawText
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!adPrompt || adPrompt.length < 20) {
    throw new Error(
      `Ad prompt generation returned empty or too short result: "${adPrompt}"`
    );
  }

  console.info(
    JSON.stringify({
      event: 'ad_prompt_generated',
      promptLength: adPrompt.length,
      promptPreview: adPrompt.slice(0, 120),
      durationMs: Date.now() - startMs,
    })
  );

  return adPrompt;
}

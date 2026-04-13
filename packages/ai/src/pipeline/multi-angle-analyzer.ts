import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { analyzeAndPlanV3 } from './product-analyzer-v3.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const MultiAngleProductProfileSchema = z.object({
  // Which image is the best primary (0-indexed)
  primaryImageIndex: z.number().int().min(0),

  // Why this image was chosen as primary
  primaryImageReason: z.string(),

  // Full product analysis (aligned with V3 fields)
  productName: z.string(),
  brandName: z.string().nullable(),
  productType: z.string(),
  specificDescription: z.string(),
  dominantColors: z.union([z.array(z.string()), z.string()]).transform(v =>
    Array.isArray(v) ? v : [v],
  ),
  material: z.string(),
  shape: z.string(),
  keyVisualElements: z.union([z.array(z.string()), z.string()]).transform(v =>
    Array.isArray(v) ? v : [v],
  ),
  productComponents: z.union([z.array(z.string()), z.string()])
    .transform(v => (Array.isArray(v) ? v : v === 'none' || v === '' ? [] : [v]))
    .catch([]),
  visibleText: z.union([z.array(z.string()), z.string()]).transform(v =>
    Array.isArray(v) ? v : v === 'none' || v === '' ? [] : [v],
  ),

  // Branding (aggregated across all angles)
  hasBranding: z.boolean(),
  brandingConfidence: z.number().min(0).max(1).catch(0.5).transform(v =>
    Math.max(0, Math.min(1, v)),
  ),
  brandElements: z.union([z.array(z.string()), z.string()]).transform(v =>
    Array.isArray(v) ? v : v === 'none' || v === '' ? [] : [v],
  ),

  // Physical characteristics
  productPhysicalSize: z.string().transform(v => {
    const valid = ['tiny', 'small', 'medium', 'large'] as const;
    return valid.includes(v as (typeof valid)[number])
      ? (v as (typeof valid)[number])
      : 'medium';
  }),
  productDimensionality: z.string().transform(v => {
    const valid = ['flat_2d', 'shallow_3d', 'deep_3d'] as const;
    return valid.includes(v as (typeof valid)[number])
      ? (v as (typeof valid)[number])
      : 'shallow_3d';
  }),

  // Category
  productCategory: z.string().transform(v => {
    const valid = [
      'food', 'jewellery', 'garment', 'skincare', 'candle', 'bag',
      'home_goods', 'electronics', 'handicraft', 'other',
    ] as const;
    return valid.includes(v as (typeof valid)[number])
      ? (v as (typeof valid)[number])
      : 'other';
  }),
  isColdBeverage: z.boolean().catch(false),

  // Multi-angle insights (only possible with multiple photos)
  crossAngleInsights: z.string(),

  // Per-angle quality assessment
  angleQualities: z.array(
    z.object({
      index: z.number().int().min(0),
      quality: z.string().transform(v => {
        const valid = ['excellent', 'good', 'usable', 'poor'] as const;
        return valid.includes(v as (typeof valid)[number])
          ? (v as (typeof valid)[number])
          : 'usable';
      }),
      bestFor: z.string(),
    }),
  ),

  // Target audience & scene recommendations
  targetAudience: z.string(),
  priceSegment: z.string().transform(v => {
    const valid = ['budget', 'mid_range', 'premium', 'luxury'] as const;
    return valid.includes(v as (typeof valid)[number])
      ? (v as (typeof valid)[number])
      : 'mid_range';
  }),
  desiredEmotion: z.string(),

  // Input quality
  usable: z.boolean(),
  rejectionReason: z.string().nullable(),
});

export type MultiAngleProductProfile = z.infer<typeof MultiAngleProductProfileSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildMultiAnglePrompt(
  imageCount: number,
  voiceInstructions?: string,
  styles?: string[],
): string {
  const styleHint =
    styles && styles.length > 0
      ? `The intended ad style(s) for these images are: ${styles.join(', ')}. Tailor your crossAngleInsights and scene recommendations to suit these styles.`
      : '';

  let prompt = `You are an expert product photographer and advertising creative director.

You are given ${imageCount} photo${imageCount > 1 ? 's' : ''} of THE SAME product from different angles. Analyze ALL photos together to build a COMPLETE and UNIFIED understanding of this product.

Your response MUST be valid JSON only — no markdown, no explanation, no code fences.

== YOUR TASKS ==

### Task 1: Choose the best primary image
Examine all ${imageCount} image${imageCount > 1 ? 's' : ''} and identify which one is the BEST primary photo. The best primary image is:
- Sharpest and best-lit
- Most front-facing or label-forward
- Shows the most branding (logo, text, label)
- Has the clearest representation of the product's main face
- Has the least clutter, glare, or obstruction

Return "primaryImageIndex" as a 0-indexed integer (0 = first image, 1 = second image, etc.).
Return "primaryImageReason" explaining briefly why this image was chosen.

### Task 2: Build unified product analysis
Extract details visible from ANY angle across ALL photos. If brand text appears on the back label (visible in image 2), include it. If the cylindrical shape is clearest from the side (image 3), use that. Synthesize the BEST possible product understanding from ALL angles.

- "productName": Full, specific product name including brand, variant, and format. NOT "bottle" but "Himalaya Neem Face Wash, 150ml pump bottle."
- "brandName": Brand name or null if unbranded
- "productType": The type of product (e.g., "face wash", "earrings", "kurti")
- "specificDescription": 2-3 sentences describing the product in detail as seen across ALL angles
- "dominantColors": Array of colors visible on the product across all angles
- "material": Primary material(s) the product is made from
- "shape": Geometric shape description (e.g., "tall cylindrical bottle with pump dispenser")
- "keyVisualElements": All notable visual elements visible across ALL angles
- "productComponents": Every visible physical sub-component — caps, lids, straws, cables, stands, boxes, tags, applicators. Be exhaustive.
- "visibleText": ALL text visible across ALL angles — brand names, taglines, ingredients, certifications, barcodes

### Task 3: Aggregate branding detection
Look across ALL images for any brand markings.
- "hasBranding": true if ANY brand text/logo/mark is visible in ANY of the images
- "brandingConfidence": 0.0–1.0 — err HIGH when uncertain; it is better to preserve branding than destroy it
- "brandElements": List every distinct brand element found across ALL angles

### Task 4: Physical characteristics
- "productPhysicalSize": "tiny" (palm-sized) | "small" (hand-sized) | "medium" (forearm-sized) | "large" (bigger than forearm)
- "productDimensionality": "flat_2d" (cards, stickers, pouches) | "shallow_3d" (plates, slabs, thin boxes) | "deep_3d" (bottles, cans, boxes with depth)
- "productCategory": "food" | "jewellery" | "garment" | "skincare" | "candle" | "bag" | "home_goods" | "electronics" | "handicraft" | "other"
- "isColdBeverage": true if this is any beverage typically served cold or at room temperature (energy drinks, soda, juice, water, beer, sports drinks, cold coffee). False for hot beverages and all non-beverages.

### Task 5: Multi-angle insights
This is the UNIQUE value of having multiple photos.
- "crossAngleInsights": Summarize what ADDITIONAL information each non-primary angle reveals. E.g., "Back angle (image 2) reveals a full ingredient list and '100% natural' certification badge. Side angle (image 3) shows the cylindrical profile and confirms the product has a shoulder taper."
If only 1 image was provided, set crossAngleInsights to "Single image provided — no cross-angle synthesis possible."

### Task 6: Per-angle quality assessment
For each of the ${imageCount} image${imageCount > 1 ? 's' : ''} (indexed 0 to ${imageCount - 1}), assess:
- "index": 0-indexed image number
- "quality": "excellent" (sharp, well-lit, perfect angle) | "good" (minor issues) | "usable" (acceptable but flawed) | "poor" (blurry, dark, or severely obstructed)
- "bestFor": What this specific angle is best suited for — e.g., "front label visibility", "shape and profile", "brand logo clarity", "ingredient list", "side view depth"

### Task 7: Target audience and scene
- "targetAudience": Who buys this product (demographics, lifestyle, aspirations)
- "priceSegment": "budget" | "mid_range" | "premium" | "luxury"
- "desiredEmotion": The single strongest emotion this product should evoke in an ad

### Task 8: Usability
- "usable": false ONLY if no product is visible in ANY of the images, or ALL images are severely corrupted. Accept poor lighting, messy backgrounds, or suboptimal angles — at least one angle is usually usable.
- "rejectionReason": Explanation if usable is false, otherwise null.
${styleHint}
`;

  if (voiceInstructions && voiceInstructions.trim().length > 0) {
    const sanitized = voiceInstructions
      .trim()
      .slice(0, 500)
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/\n{3,}/g, '\n\n');
    prompt += `
== USER'S CREATIVE DIRECTION ==
"${sanitized}"

Factor this into your crossAngleInsights and recommendations where relevant. The user's direction may inform which angle is chosen as primary (e.g., if they want to highlight a specific side or detail).
`;
  }

  prompt += `
Return this EXACT JSON structure (no extra fields, no markdown):
{
  "primaryImageIndex": number,
  "primaryImageReason": string,
  "productName": string,
  "brandName": string | null,
  "productType": string,
  "specificDescription": string,
  "dominantColors": string[],
  "material": string,
  "shape": string,
  "keyVisualElements": string[],
  "productComponents": string[],
  "visibleText": string[],
  "hasBranding": boolean,
  "brandingConfidence": number,
  "brandElements": string[],
  "productPhysicalSize": "tiny" | "small" | "medium" | "large",
  "productDimensionality": "flat_2d" | "shallow_3d" | "deep_3d",
  "productCategory": "food" | "jewellery" | "garment" | "skincare" | "candle" | "bag" | "home_goods" | "electronics" | "handicraft" | "other",
  "isColdBeverage": boolean,
  "crossAngleInsights": string,
  "angleQualities": [
    { "index": number, "quality": "excellent" | "good" | "usable" | "poor", "bestFor": string }
  ],
  "targetAudience": string,
  "priceSegment": "budget" | "mid_range" | "premium" | "luxury",
  "desiredEmotion": string,
  "usable": boolean,
  "rejectionReason": string | null
}`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Minimal fallback profile builder from V3 result
// ---------------------------------------------------------------------------

function buildFallbackProfile(
  v3Result: Awaited<ReturnType<typeof analyzeAndPlanV3>>,
): MultiAngleProductProfile {
  return MultiAngleProductProfileSchema.parse({
    primaryImageIndex: 0,
    primaryImageReason: 'Fallback to single-image analysis — multi-angle Gemini call failed.',
    productName: v3Result.analysis.productName,
    brandName: v3Result.analysis.brandName,
    productType: v3Result.analysis.productType,
    specificDescription: v3Result.analysis.specificDescription,
    dominantColors: v3Result.analysis.dominantColors,
    material: v3Result.analysis.material,
    shape: v3Result.analysis.shape,
    keyVisualElements: v3Result.analysis.keyVisualElements,
    productComponents: v3Result.analysis.productComponents,
    visibleText: v3Result.analysis.visibleText,
    hasBranding: v3Result.hasBranding,
    brandingConfidence: v3Result.brandingConfidence,
    brandElements: v3Result.brandElements,
    productPhysicalSize: v3Result.productPhysicalSize,
    productDimensionality: v3Result.productDimensionality,
    productCategory: v3Result.productCategory,
    isColdBeverage: v3Result.isColdBeverage,
    crossAngleInsights: 'Single image analyzed — no cross-angle synthesis possible.',
    angleQualities: [
      {
        index: 0,
        quality: v3Result.inputAngleQuality === 'good'
          ? 'excellent'
          : v3Result.inputAngleQuality === 'suboptimal'
            ? 'usable'
            : 'poor',
        bestFor: 'primary product view',
      },
    ],
    targetAudience: v3Result.analysis.targetAudience,
    priceSegment: v3Result.analysis.priceSegment,
    desiredEmotion: v3Result.analysis.desiredEmotion,
    usable: v3Result.usable,
    rejectionReason: v3Result.rejectionReason,
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function analyzeMultiAngleProduct(
  imageBuffers: Buffer[],
  voiceInstructions?: string,
  styles?: string[],
): Promise<MultiAngleProductProfile> {
  if (imageBuffers.length === 0) {
    throw new Error('analyzeMultiAngleProduct: at least one image buffer is required');
  }

  const startMs = Date.now();
  const imageCount = imageBuffers.length;

  // Clamp primaryImageIndex to valid range after parsing
  const clampPrimaryIndex = (profile: MultiAngleProductProfile): MultiAngleProductProfile => {
    if (profile.primaryImageIndex >= imageCount) {
      return { ...profile, primaryImageIndex: 0 };
    }
    return profile;
  };

  // -------------------------------------------------------------------
  // Fast path: single image — skip multi-angle call, use V3 analyzer
  // -------------------------------------------------------------------
  if (imageCount === 1) {
    try {
      const v3 = await analyzeAndPlanV3(
        imageBuffers[0]!,
        voiceInstructions,
        styles?.[0],
      );
      const profile = buildFallbackProfile(v3);
      console.info(JSON.stringify({
        event: 'multi_angle_single_image_complete',
        productName: profile.productName,
        category: profile.productCategory,
        hasBranding: profile.hasBranding,
        durationMs: Date.now() - startMs,
      }));
      return profile;
    } catch (err) {
      throw new Error(
        `analyzeMultiAngleProduct single-image fallback failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // -------------------------------------------------------------------
  // Multi-image path: send all images in one Gemini call
  // -------------------------------------------------------------------
  const genai = new GoogleGenAI({
    apiKey: process.env['GOOGLE_AI_API_KEY'] ?? process.env['GOOGLE_GENAI_API_KEY'] ?? '',
  });

  const prompt = buildMultiAnglePrompt(imageCount, voiceInstructions, styles);

  // Build parts: all images first, then the text prompt
  const imageParts = imageBuffers.map(buf => ({
    inlineData: {
      mimeType: detectMime(buf),
      data: buf.toString('base64'),
    },
  }));

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('analyzeMultiAngleProduct timed out after 30s')),
      30_000,
    ),
  );

  let rawText: string;
  try {
    const response = await Promise.race([
      genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              ...imageParts,
              { text: prompt },
            ],
          },
        ],
      }),
      timeoutPromise,
    ]);
    rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } catch (err) {
    // Graceful fallback: use the first image with V3 single-image analyzer
    console.error(JSON.stringify({
      event: 'multi_angle_gemini_failed',
      imageCount,
      error: err instanceof Error ? err.message : String(err),
      fallback: 'analyzeAndPlanV3 on first image',
    }));
    const v3 = await analyzeAndPlanV3(imageBuffers[0]!, voiceInstructions, styles?.[0]);
    return clampPrimaryIndex(buildFallbackProfile(v3));
  }

  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error(JSON.stringify({
      event: 'multi_angle_parse_failed',
      imageCount,
      rawPreview: rawText.slice(0, 300),
      fallback: 'analyzeAndPlanV3 on first image',
    }));
    const v3 = await analyzeAndPlanV3(imageBuffers[0]!, voiceInstructions, styles?.[0]);
    return clampPrimaryIndex(buildFallbackProfile(v3));
  }

  const result = MultiAngleProductProfileSchema.safeParse(parsed);
  if (!result.success) {
    console.error(JSON.stringify({
      event: 'multi_angle_schema_failed',
      imageCount,
      error: result.error.message,
      fallback: 'analyzeAndPlanV3 on first image',
    }));
    const v3 = await analyzeAndPlanV3(imageBuffers[0]!, voiceInstructions, styles?.[0]);
    return clampPrimaryIndex(buildFallbackProfile(v3));
  }

  const profile = clampPrimaryIndex(result.data);

  console.info(JSON.stringify({
    event: 'multi_angle_analyze_complete',
    imageCount,
    primaryImageIndex: profile.primaryImageIndex,
    productName: profile.productName,
    category: profile.productCategory,
    hasBranding: profile.hasBranding,
    brandingConfidence: profile.brandingConfidence,
    crossAngleInsights: profile.crossAngleInsights.slice(0, 120),
    usable: profile.usable,
    durationMs: Date.now() - startMs,
  }));

  return profile;
}

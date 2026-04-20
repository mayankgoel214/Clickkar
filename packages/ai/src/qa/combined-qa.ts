import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const CombinedQASchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(100),
  hasRandomText: z.boolean(),
  hasSketchesOrDrawings: z.boolean(),
  hasFundamentalError: z.boolean(),
  fundamentalErrorDescription: z.string().nullable(),
  productFidelity: z.string().transform((v) => {
    const valid = ['identical', 'minor_shift', 'altered', 'regenerated'] as const;
    if ((valid as readonly string[]).includes(v)) return v as typeof valid[number];
    if (v.includes('regenerat')) return 'regenerated' as const;
    if (v.includes('alter') || v.includes('significant')) return 'altered' as const;
    if (v.includes('minor') || v.includes('shift')) return 'minor_shift' as const;
    return 'altered' as const;
  }),
  productFidelityScore: z.number().min(0).max(35),
  sceneQuality: z.enum(['poor', 'acceptable', 'good', 'excellent']),
  physicallyPlausible: z.boolean(),
  humanAnatomy: z.enum(['no_person', 'natural', 'minor_issue', 'major_issue']),
  productIntegration: z.enum(['natural', 'awkward', 'impossible']),
  sceneAppropriate: z.boolean().optional().default(true),
  issues: z.array(z.string()),
});

export type CombinedQAResult = z.infer<typeof CombinedQASchema>;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const COMBINED_QA_PROMPT_WITH_FIDELITY = `You are a VERY strict product ad quality inspector. Your job is to ensure ZERO defective images reach customers. You are given TWO images:

**Image 1:** The ORIGINAL product photo (ground truth).
**Image 2:** The AI-generated advertisement.

Check Image 2 against Image 1 and score:

## 0. FUNDAMENTAL ERROR CHECK (INSTANT REJECTION — check this FIRST)
A fundamental error is anything that makes the image UNUSABLE for a customer. If ANY of these exist, hasFundamentalError = true and pass = false:
- Product is DISTORTED (melted, warped, wrong proportions vs original)
- Product is MISSING or barely visible
- Product is MERGED into another object or person's body
- Any person present has WRONG ANATOMY: extra/missing fingers, extra limbs, distorted face, uncanny valley expression, impossible body proportions
- Person holding product in physically impossible way
- Product appears TWICE or is duplicated unnaturally
- Image has major artifacts: half-rendered objects, glitch patterns, smeared regions
- Person has blurry/smeared face or clearly AI-generated "plastic" skin
EXCEPTION: Photos/artwork of people PRINTED ON the product surface (photo mugs, t-shirts, etc.) are NOT real people — ignore them for anatomy evaluation. Also, images/photos printed on curved product surfaces (mugs, bottles) will naturally appear warped — this is NOT a defect.

## 1. RANDOM TEXT CHECK (auto-fail if found)
- Is there any random/generated text in the SCENE/BACKGROUND that is NOT on the product?
- ANY text, images, artwork, photos, or designs that are physically PRINTED ON or PART OF the product surface are fine — this includes product labels, brand names, custom text, photo collages, decorative patterns, names, dates, quotes, and any printed imagery on mugs, t-shirts, phone cases, greeting cards, posters, etc.
- Generated text like "8K", "QUALITY", watermarks, gibberish = INSTANT FAIL
- EXCEPTION: The small Autmn logo watermark at the bottom-right corner of the image is INTENTIONAL branding. IGNORE it completely.
- hasRandomText = true ONLY for scene/background text, not product text, and NOT for the Autmn watermark

## 2. SKETCHES/DRAWINGS CHECK (auto-fail if found)
- Any line drawings, sketches, illustrations, or cartoon elements? = INSTANT FAIL

## 3. PRODUCT FIDELITY (0-35 points, MOST IMPORTANT — scrutinize carefully)
Compare the product in Image 2 to the product in Image 1 with EXTREME attention to detail:
- SHAPE ACCURACY: Are ALL proportions, curves, angles, and dimensions identical? For multi-piece items (jewellery sets, product bundles), does EACH piece match?
- COLOR ACCURACY: Are colors exactly the same? Gold should be gold (not grey). Blue sapphires should be the same blue. Material finish (matte/glossy/metallic) must match.
- COMPONENT ACCURACY: If the input shows multiple pieces (necklace + earrings, bottle + cap), are ALL pieces present with their EXACT original design? Missing or redesigned components = major penalty.
- DETAIL ACCURACY: Fine details like individual stones, stitching, patterns, textures — are they preserved or smoothed out?
- TEXT/LOGO ACCURACY: All brand text, logos must be legible and correctly spelled.

Scoring:
- 35: IDENTICAL — Every detail matches. Components, proportions, colors, textures are perfect.
- 28-34: NEAR IDENTICAL — Product is correct with only imperceptible differences (very slight color shift from lighting).
- 20-27: MINOR ISSUES — Product is recognizably the same but has noticeable differences (slightly wrong proportions, one component slightly altered).
- 10-19: ALTERED — Product has clear differences from original (wrong proportions, missing fine details, color changes, simplified design).
- 0-9: REGENERATED — Product looks like a DIFFERENT product. Major shape/proportion/color changes, missing components, or brand elements missing.

BE HARSH HERE. Most AI outputs will have SOME fidelity issues — score them honestly. A slightly altered product that a seller would REJECT is not 25+.

## 4. SCENE QUALITY (0-30 points)
- Is the scene photorealistic with proper lighting, shadows, reflections?
- Does the product look like it BELONGS in the scene (not pasted on)?
- Is the product the VISUAL FOCUS? It can dominate through SIZE (filling 40%+) OR through LIGHTING (brightest/sharpest element) OR through COMPOSITION (strategic placement with intentional negative space). All three are valid — the product just needs to be what your eye goes to first.
- SURFACE CONSISTENCY: Does the surface material maintain consistent texture, color, and grain? Deduct 5-10 points if surface abruptly changes near product edges.
- LIGHTING CONSISTENCY: Do shadows all fall in the same direction? Is the product lit from the same source as the scene?
- DYNAMIC ELEMENTS: If splashes, floating particles, or scattered elements are present, do they look physically plausible and add to the composition? Bonus points for compelling dynamic elements.

## 5. PHYSICAL PLAUSIBILITY (0-15 points)
- Product sitting naturally ON a flat surface or held naturally by a person?
- Not embedded inside another object?
- No floating or defying gravity?

## 6. AD READINESS (0-20 points)
- Would a real brand use this for Instagram/advertising?
- No distracting artifacts?
- Professional composition?

## 7. HUMAN ANATOMY (if a person is present)
- "no_person": No human in the image
- "natural": Person looks completely real and natural
- "minor_issue": Slight imperfections but still usable (slightly odd finger position, etc.)
- "major_issue": Obvious AI artifacts on person — INSTANT FAIL

## 8. PRODUCT INTEGRATION
- "natural": Product looks like it naturally belongs (held properly, sitting on surface correctly)
- "awkward": Product placement looks slightly off but still usable
- "impossible": Product is floating, merged into person, or physically impossible — INSTANT FAIL

## 9. SCENE APPROPRIATENESS
Is the setting/scene contextually appropriate for this product type?
Examples of contextually WRONG scenes (sceneAppropriate = false):
- A protein bar or energy drink in a fine dining or restaurant setting
- Chai/Indian tea in a Western coffee mug (should be in a kulhad, glass, or traditional cup)
- Jewellery on a kitchen counter (should be on velvet, silk, or an aesthetic surface)
- A candle that is unlit in a scene that implies it should be lit (birthday, romantic setting)
- A face wash or skincare product in a gym locker room (should be in a bathroom/vanity)
- Street food in a corporate boardroom
Examples of contextually CORRECT scenes (sceneAppropriate = true):
- Fitness supplement near gym equipment / outdoors / active setting
- Skincare near a bathroom vanity, marble surface, or botanical props
- Food product near its natural ingredients or in a kitchen/dining setting
- Candle lit with warm ambient glow in a home/cozy setting
If no obvious context mismatch exists, default sceneAppropriate = true.

**Total score: fidelity(0-35) + scene(0-30) + plausibility(0-15) + readiness(0-20) = 0-100**
**Pass: score >= 65 AND productFidelityScore >= 25 AND no random text AND no sketches AND no fundamental errors AND humanAnatomy != "major_issue" AND productIntegration != "impossible" AND sceneAppropriate != false**

Return valid JSON only:
{
  "pass": boolean,
  "score": number,
  "hasRandomText": boolean,
  "hasSketchesOrDrawings": boolean,
  "hasFundamentalError": boolean,
  "fundamentalErrorDescription": string | null,
  "productFidelity": "identical" | "minor_shift" | "altered" | "regenerated",
  "productFidelityScore": number,
  "sceneQuality": "poor" | "acceptable" | "good" | "excellent",
  "physicallyPlausible": boolean,
  "humanAnatomy": "no_person" | "natural" | "minor_issue" | "major_issue",
  "productIntegration": "natural" | "awkward" | "impossible",
  "sceneAppropriate": boolean,
  "issues": string[]
}`;

const COMBINED_QA_PROMPT_NO_FIDELITY = `You are a VERY strict product ad quality inspector. Your job is to ensure ZERO defective images reach customers. Check this AI-generated advertisement image:

## 0. FUNDAMENTAL ERROR CHECK (INSTANT REJECTION — check this FIRST)
A fundamental error is anything that makes the image UNUSABLE for a customer. If ANY of these exist, hasFundamentalError = true and pass = false:
- Product is DISTORTED (melted, warped, wrong proportions)
- Product is MISSING or barely visible
- Product is MERGED into another object or person's body
- Any person present has WRONG ANATOMY: extra/missing fingers, extra limbs, distorted face, uncanny valley expression, impossible body proportions, teeth that look wrong
- Person holding product in physically impossible way (hand going through product, wrong grip)
- Product appears TWICE or is duplicated unnaturally
- Image has major artifacts: half-rendered objects, glitch patterns, smeared regions
- Person has blurry/smeared face or clearly AI-generated "plastic" skin
- Person's hand has wrong number of fingers (count them carefully — must be exactly 5 per hand)
EXCEPTION: Photos/artwork of people PRINTED ON the product surface (photo mugs, t-shirts, etc.) are NOT real people — ignore them for anatomy evaluation. Also, images/photos printed on curved product surfaces (mugs, bottles) will naturally appear warped — this is NOT a defect.

## 1. RANDOM TEXT CHECK (auto-fail if found)
- Any random/generated text in the SCENE/BACKGROUND? (ANY text, images, artwork, or designs PRINTED ON or PART OF the product surface are fine — product labels, custom text, photo collages, decorative patterns, etc. Only flag text floating in the background scene.)
- "8K", "QUALITY", watermarks, gibberish = INSTANT FAIL
- EXCEPTION: The small Autmn logo watermark at the bottom-right corner of the image is INTENTIONAL branding. IGNORE it completely.

## 2. SKETCHES/DRAWINGS CHECK (auto-fail if found)
- Any line drawings, sketches, illustrations, or cartoon elements?

## 3. SCENE QUALITY (0-40 points)
- Photorealistic with proper lighting, shadows, reflections?
- Product is clearly visible and the VISUAL FOCUS (through size, lighting, sharpness, or strategic placement)?
- Professional composition with intentional dynamic elements (splashes, particles, scattered ingredients)?
- Bonus for compelling creative direction — does this look like a scroll-stopping AD, not just a product photo?

## 4. PHYSICAL PLAUSIBILITY (0-20 points)
- Product held naturally / sitting on surface naturally?
- No floating or defying physics?
- No impossible interactions?

## 5. HUMAN QUALITY (0-20 points, if person present; skip if no person → give 20)
- Person looks completely photorealistic? (not AI-generated looking)
- Natural skin texture, realistic eyes, natural expression?
- Hands look correct? (right number of fingers, natural grip)
- Person's clothing looks real and natural?
- 20: Looks like a real photo of a real person
- 10: Minor imperfections but still believable
- 0: Obviously AI-generated person, uncanny valley, anatomy issues

## 6. AD READINESS (0-20 points)
- Would a brand use this for Instagram?
- Professional quality, no artifacts?

**Total: scene(0-40) + plausibility(0-20) + human(0-20) + readiness(0-20) = 0-100**
**Pass: score >= 65 AND no random text AND no sketches AND no fundamental errors AND humanAnatomy != "major_issue" AND productIntegration != "impossible"**

## 7. HUMAN ANATOMY (if a person is present)
- "no_person": No human in the image
- "natural": Person looks completely real and natural
- "minor_issue": Slight imperfections but still usable
- "major_issue": Obvious AI artifacts on person — extra fingers, distorted face, impossible anatomy

## 8. PRODUCT INTEGRATION
- "natural": Product looks like it naturally belongs
- "awkward": Product placement looks slightly off but still usable
- "impossible": Product is floating, merged into person, or physically impossible

## 9. SCENE APPROPRIATENESS
Is the setting/scene contextually appropriate for this product type?
Examples of contextually WRONG scenes (sceneAppropriate = false):
- A protein bar or energy drink in a fine dining or restaurant setting
- Chai/Indian tea in a Western coffee mug (should be in a kulhad, glass, or traditional cup)
- Jewellery on a kitchen counter (should be on velvet, silk, or an aesthetic surface)
- A candle that is unlit in a scene that implies it should be lit (birthday, romantic setting)
- Street food in a corporate boardroom
If no obvious context mismatch exists, default sceneAppropriate = true.

**Total: scene(0-40) + plausibility(0-20) + human(0-20) + readiness(0-20) = 0-100**
**Pass: score >= 65 AND no random text AND no sketches AND no fundamental errors AND humanAnatomy != "major_issue" AND productIntegration != "impossible" AND sceneAppropriate != false**

Return valid JSON only:
{
  "pass": boolean,
  "score": number,
  "hasRandomText": boolean,
  "hasSketchesOrDrawings": boolean,
  "hasFundamentalError": boolean,
  "fundamentalErrorDescription": string | null,
  "productFidelity": "identical",
  "productFidelityScore": 35,
  "sceneQuality": "poor" | "acceptable" | "good" | "excellent",
  "physicallyPlausible": boolean,
  "humanAnatomy": "no_person" | "natural" | "minor_issue" | "major_issue",
  "productIntegration": "natural" | "awkward" | "impossible",
  "sceneAppropriate": boolean,
  "issues": string[]
}`;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

function detectMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Single combined QA check — replaces separate supervisor + comparative QA.
 * One Gemini call instead of two.
 *
 * @param checkFidelity - true for Track A (branded), false for Track B (unbranded)
 */
export async function combinedQualityCheck(
  inputBuffer: Buffer,
  outputBuffer: Buffer,
  options: { checkFidelity: boolean; voiceInstructions?: string }
): Promise<CombinedQAResult> {
  const startMs = Date.now();

  const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

  const outputBase64 = outputBuffer.toString('base64');
  const outputMime = detectMime(outputBuffer);

  const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];

  let promptText = options.checkFidelity
    ? COMBINED_QA_PROMPT_WITH_FIDELITY
    : COMBINED_QA_PROMPT_NO_FIDELITY;

  if (options.voiceInstructions) {
    promptText += `\n\nIMPORTANT EXCEPTION: The user gave these specific instructions: "${options.voiceInstructions.slice(0, 300)}"\nIf the image follows these instructions (e.g., floating product, unusual angles, specific backgrounds, surreal effects), those are INTENTIONAL creative choices and should NOT be penalized as defects, impossible integration, or implausible physics. Score them positively as creative execution.`;
  }

  if (options.checkFidelity) {
    // Send both images for fidelity comparison
    const inputBase64 = inputBuffer.toString('base64');
    const inputMime = detectMime(inputBuffer);
    parts.push({ inlineData: { mimeType: inputMime, data: inputBase64 } });
    parts.push({ inlineData: { mimeType: outputMime, data: outputBase64 } });
    parts.push({ text: promptText });
  } else {
    // Only send the output for scene quality check
    parts.push({ inlineData: { mimeType: outputMime, data: outputBase64 } });
    parts.push({ text: promptText });
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('combinedQualityCheck timed out after 30s')), 30_000)
    );
    const response = await Promise.race([
      genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
      }),
      timeoutPromise,
    ]);

    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    const result = CombinedQASchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(`Combined QA schema failed: ${result.error.message}`);
    }

    // Server-side re-validation — don't trust the model's pass boolean
    const data = result.data;
    const serverPass =
      data.score >= 65 &&
      data.productFidelityScore >= 25 &&
      !data.hasRandomText &&
      !data.hasSketchesOrDrawings &&
      !data.hasFundamentalError &&
      data.humanAnatomy !== 'major_issue' &&
      data.productIntegration !== 'impossible' &&
      data.sceneAppropriate !== false;

    // Override the model's pass with server-computed pass
    data.pass = serverPass;

    console.info(JSON.stringify({
      event: 'combined_qa_complete',
      pass: result.data.pass,
      score: result.data.score,
      fidelity: result.data.productFidelity,
      fidelityScore: result.data.productFidelityScore,
      hasRandomText: result.data.hasRandomText,
      issues: result.data.issues,
      durationMs: Date.now() - startMs,
    }));

    return result.data;
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.includes('timed out');
    if (isTimeout) {
      console.warn(JSON.stringify({
        event: 'combined_qa_timeout',
        error: err.message,
        durationMs: Date.now() - startMs,
      }));
    } else {
      console.error(JSON.stringify({
        event: 'combined_qa_error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startMs,
      }));
    }

    // Neutral score — avoid discarding good images due to QA timeout
    return {
      pass: false,
      score: 55,
      hasRandomText: false,
      hasSketchesOrDrawings: false,
      hasFundamentalError: false,
      fundamentalErrorDescription: null,
      productFidelity: 'altered',
      productFidelityScore: 20,
      sceneQuality: 'acceptable',
      physicallyPlausible: true,
      humanAnatomy: 'no_person',
      productIntegration: 'natural',
      sceneAppropriate: true,
      issues: ['QA check failed — defaulting to conservative score'],
    };
  }
}

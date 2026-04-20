import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const UnifiedQASchema = z.object({
  // Overall
  pass: z.boolean(),
  score: z.number().min(0).max(100),

  // Fundamental error (from focused checks)
  hasFundamentalError: z.boolean(),
  fundamentalErrorDescription: z.string().nullable(),

  // Random text (from focused checks + combined QA)
  hasRandomText: z.boolean(),
  hasSketchesOrDrawings: z.boolean(),

  // Product count (from focused checks)
  productCount: z.number().int(),

  // Product fidelity (from combined QA)
  productFidelity: z.string().transform((v) => {
    const valid = ['identical', 'minor_shift', 'altered', 'regenerated'] as const;
    if ((valid as readonly string[]).includes(v)) return v as (typeof valid)[number];
    if (v.includes('regenerat')) return 'regenerated' as const;
    if (v.includes('alter') || v.includes('significant')) return 'altered' as const;
    if (v.includes('minor') || v.includes('shift')) return 'minor_shift' as const;
    return 'altered' as const;
  }),
  productFidelityScore: z.number().min(0).max(35),

  // Scene quality (from combined QA)
  sceneQuality: z.enum(['poor', 'acceptable', 'good', 'excellent']),
  physicallyPlausible: z.boolean(),
  sceneAppropriate: z.boolean().catch(true),

  // Anatomy (from focused checks)
  humanAnatomy: z.enum(['no_person', 'natural', 'minor_issue', 'major_issue']),

  // Product integration (from combined QA)
  productIntegration: z.enum(['natural', 'awkward', 'impossible']),

  // Component accuracy (from focused checks)
  hasComponentIssue: z.boolean(),
  componentDescription: z.string().catch('none'),

  // Branding accuracy (merged from branding verify)
  brandingAccurate: z.boolean(),
  brandingIssues: z.array(z.string()).catch([]),

  // Instruction compliance (from focused checks)
  instructionFollowed: z.boolean().catch(true),

  // Issues list
  issues: z.array(z.string()),
});

export type UnifiedQAResult = z.infer<typeof UnifiedQASchema>;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface UnifiedQAOptions {
  checkFidelity: boolean;
  voiceInstructions?: string;
  brandingInventory?: Array<{
    text: string;
    type: string;
    prominence: string;
  }>;
  isPairedProduct?: boolean;
  style?: string;
  productPhysicalSize?: string;
}

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

function buildUnifiedPrompt(
  checkFidelity: boolean,
  voiceInstructions?: string,
  brandingInventory?: UnifiedQAOptions['brandingInventory'],
  productPhysicalSize?: string,
): string {
  const brandingSection = brandingInventory && brandingInventory.length > 0
    ? `BRANDING INVENTORY (verified from multiple product angles):
${brandingInventory.map((b) => `- ${b.prominence}: "${b.text}" (${b.type})`).join('\n')}
All DOMINANT and SECONDARY brand elements listed above MUST be accurately reproduced in Image 2.`
    : null;

  const fidelityBlock = checkFidelity ? `
## 3. PRODUCT FIDELITY (0-35 points — MOST IMPORTANT, scrutinize carefully)
Compare the product in Image 2 to the product in Image 1 with EXTREME attention to detail:
- SHAPE ACCURACY: Are ALL proportions, curves, angles, and dimensions identical? For multi-piece items (jewellery sets, product bundles), does EACH piece match?
- COLOR ACCURACY: Are colors exactly the same? Gold should be gold (not grey). Material finish (matte/glossy/metallic) must match.
- COMPONENT ACCURACY: If the input shows multiple pieces (necklace + earrings, bottle + cap), are ALL pieces present with their EXACT original design? Missing or redesigned components = major penalty.
- DETAIL ACCURACY: Fine details like individual stones, stitching, patterns, textures — are they preserved or smoothed out?
- TEXT/LOGO ACCURACY: All brand text, logos must be legible and correctly spelled.
- FORM FACTOR: A flat pouch that becomes a structured bag, a wristlet that becomes a shoulder bag, a small coin purse that becomes a large clutch counts as ALTERED — even if colors and branding match.

Scoring:
- 35: IDENTICAL — Every detail matches. Components, proportions, colors, textures are perfect.
- 28-34: NEAR IDENTICAL — Product is correct with only imperceptible differences (very slight color shift from lighting).
- 20-27: MINOR ISSUES — Product is recognizably the same but has noticeable differences (slightly wrong proportions, one component slightly altered).
- 10-19: ALTERED — Product has clear differences from original (wrong proportions, missing fine details, color changes, simplified design).
- 0-9: REGENERATED — Product looks like a DIFFERENT product. Major shape/proportion/color changes, missing components, or brand elements missing.

BE HARSH HERE. A slightly altered product that a seller would REJECT is not 25+.` : `
## 3. PRODUCT FIDELITY (no original provided — default to full score)
No original image provided for comparison. Set productFidelity = "identical" and productFidelityScore = 35.`;

  const brandingVerifyBlock = brandingInventory && brandingInventory.length > 0
    ? `
## 5. BRANDING ACCURACY
Compare all visible text and logos on the product in Image 2 against the branding inventory above.
- brandingAccurate = true if all DOMINANT brand elements (brand name, main logo, product name) are correctly reproduced — legible, correctly spelled, correct logo shape.
- Secondary elements like Nutrition Facts panels, ingredient lists, fine print, barcode numbers, weight text (net wt, fl oz, g, ml), legal copy, and guarantee text being slightly blurry or illegible is ACCEPTABLE and should NOT cause brandingAccurate to be false.
- brandingIssues = list only DOMINANT elements (brand name, main logo, product name) that are misspelled, garbled, or missing. Do NOT list blurry fine print, Nutrition Facts, barcodes, or weight text as issues.
- Only set brandingAccurate = false if a dominant brand element is clearly wrong.`
    : `
## 5. BRANDING ACCURACY
No branding inventory provided. Set brandingAccurate = true and brandingIssues = [].`;

  const instructionBlock = voiceInstructions
    ? `
## 13. INSTRUCTION COMPLIANCE
The user requested: "${voiceInstructions.slice(0, 400)}"
Was this instruction clearly incorporated into the scene?
Set instructionFollowed = true if yes, false if the instruction was ignored or not visible.
IMPORTANT: If the user requested floating, levitation, unusual angles, or surreal effects, those are INTENTIONAL creative choices. Do NOT penalize them as defects or implausible physics in the scoring above — treat them as correct creative execution.`
    : `
## 13. INSTRUCTION COMPLIANCE
No user instructions given. Set instructionFollowed = true.`;

  const prompt = `You are a VERY strict product ad quality inspector. Your job is to ensure ZERO defective images reach customers.${checkFidelity ? `

You are given:
- Image 1: The ORIGINAL product photo (ground truth)
- Image 2: The AI-generated advertisement` : `

You are given:
- Image 1: The AI-generated advertisement`}
${brandingSection ? `\n${brandingSection}\n` : ''}
Evaluate Image 2 against Image 1 and return a comprehensive quality assessment:

## 1. FUNDAMENTAL ERROR CHECK (instant rejection — check this FIRST)
A fundamental error is anything that makes the image UNUSABLE for a customer. If ANY of these exist, set hasFundamentalError = true (the overall pass will be forced to false):
- Product is DISTORTED (melted, warped, wrong proportions vs original or vs reality)
- Product is MISSING or barely visible
- Product is MERGED into another object or person's body
- Any person present has WRONG ANATOMY: extra/missing fingers, extra limbs, distorted face, uncanny valley expression, impossible body proportions
- Person holding product in physically impossible way (hand going through product, wrong grip)
- Product appears TWICE or is duplicated unnaturally
- Image has major artifacts: half-rendered objects, glitch patterns, smeared regions covering >10% of image
- Person has blurry/smeared face or clearly AI-generated "plastic" skin
- Scene looks like a CGI RENDER or CARTOON instead of a photograph
EXCEPTION: Photos/artwork of people PRINTED ON the product surface (photo mugs, t-shirts, etc.) are NOT real people — ignore them for anatomy evaluation. Images/photos printed on curved product surfaces (mugs, bottles) will naturally appear warped — this is NOT a defect.

## 2. RANDOM TEXT AND SKETCHES CHECK (auto-fail if found)
- hasRandomText = true if there is any generated/random text in the SCENE/BACKGROUND that is NOT on the product. ANY text, images, artwork, or designs PRINTED ON or PART OF the product surface are fine (labels, brand names, custom text, photo collages, decorative patterns, etc.). Only flag text floating in the background scene. Generated words like "8K", "QUALITY", watermarks, gibberish = instant fail.
- EXCEPTION: The small Autmn logo watermark at the bottom-right corner is INTENTIONAL branding. IGNORE it completely.
- hasSketchesOrDrawings = true if any part of the image looks like a line drawing, sketch, illustration, or cartoon instead of a photograph.
${fidelityBlock}

## 4. PRODUCT COUNT
Count the exact number of product instances visible. productCount should be 1 for a single product.
Do NOT count reflections on polished/acrylic/glass surfaces as separate products.
Do NOT count shadows as separate instances.
EXCEPTION: If the product is inherently a PAIR (earrings, shoes, socks, gloves, cufflinks) or a SET (bangles, necklace+earring set), count each piece — a pair of earrings = 2 is CORRECT.
${brandingVerifyBlock}

## 6. SCENE QUALITY (0-30 points)
- Is the scene photorealistic with proper lighting, shadows, reflections?
- Does the product look like it BELONGS in the scene (not pasted on)?
- Is the product the VISUAL FOCUS? It can dominate through SIZE (filling 40%+) OR through LIGHTING (brightest/sharpest element) OR through COMPOSITION (strategic placement with intentional negative space). All three are valid — the product just needs to be what your eye goes to first.
- SURFACE CONSISTENCY: Does the surface material maintain consistent texture, color, and grain? Deduct 5-10 points if surface abruptly changes near product edges.
- LIGHTING CONSISTENCY: Do shadows all fall in the same direction? Is the product lit from the same source as the scene?
- DYNAMIC ELEMENTS: If splashes, floating particles, or scattered elements are present, do they look physically plausible and add to the composition? Bonus points for compelling dynamic elements.

## 7. PHYSICAL PLAUSIBILITY (0-15 points)
- Product sitting naturally ON a flat surface or held naturally by a person?
- Not embedded inside another object?
- No floating or defying gravity (unless intentional per user instructions — see section 13)?
- physicallyPlausible = Product obeys gravity, sits on surfaces naturally, not floating or embedded. ALSO CHECK SCALE: ${productPhysicalSize ? `This product is "${productPhysicalSize}" (tiny=fist-sized, small=palm-sized, medium=forearm-sized, large=two-hands-sized). If a person is visible in the image, the product MUST be correctly sized relative to their hands/body. A "small" product held by a person should fit in their palm — if it appears laptop-sized or torso-sized, physicallyPlausible = false AND hasFundamentalError = true.` : 'Check that product scale looks realistic relative to any scene elements (people, furniture, surfaces).'}

## 8. AD READINESS (0-20 points)
- Would a real brand use this for Instagram/advertising?
- No distracting artifacts?
- Professional composition?
- Does this look like a scroll-stopping AD?

## 9. HUMAN ANATOMY (if a person is present)
CRITICAL EXCEPTION: Photos, images, or artwork PRINTED ON the product surface (photo mugs, t-shirts, phone cases, greeting cards, etc.) are NOT real people. Only evaluate anatomy for actual 3D human subjects physically present in the scene.
- "no_person": No human in the image
- "natural": Person looks completely real and natural
- "minor_issue": Slight imperfections but still usable (slightly odd finger position, etc.)
- "major_issue": Obvious AI artifacts on person — extra fingers, distorted face, impossible anatomy, uncanny valley

## 10. PRODUCT INTEGRATION
- "natural": Product looks like it naturally belongs (held properly, sitting on surface correctly)
- "awkward": Product placement looks slightly off but still usable
- "impossible": Product is floating, merged into person, or physically impossible — instant fail

## 11. COMPONENT ACCURACY
Compare all visible components/pieces in Image 1 (if provided) against Image 2:
- hasComponentIssue = true if ANY component from the original is missing, clearly wrong in shape, or if the overall form factor of the product has changed (e.g., a wristlet became a shoulder bag, a flat pouch became a structured bag)
- componentDescription = description of what is missing, distorted, or form-factor-changed — or "none"
If no original image is provided, set hasComponentIssue = false and componentDescription = "none".

## 12. SCENE APPROPRIATENESS
Is the setting contextually appropriate for this product type?
Examples of contextually WRONG scenes (sceneAppropriate = false):
- Jewellery on a kitchen counter (should be on velvet, silk, or an aesthetic surface)
- A candle that is unlit in a scene that clearly implies it should be lit (birthday, romantic setting)
- Chai/Indian tea in a Western coffee mug (should be in a kulhad, glass, or traditional cup)
- Skincare product in a gym locker room (should be near a bathroom vanity, marble, or botanical props)
- Protein bar in a fine dining restaurant setting
- Street food in a corporate boardroom
If no obvious context mismatch exists, default sceneAppropriate = true.
${instructionBlock}

**Total score: fidelity(0-35) + scene(0-30) + plausibility(0-15) + readiness(0-20) = 0-100**
**Pass (compute yourself, I will re-verify server-side): score >= 60 AND productFidelityScore >= 20 AND no random text AND no sketches AND no fundamental errors AND humanAnatomy != "major_issue" AND productIntegration != "impossible" AND productCount is correct AND sceneAppropriate = true**

Compile a concise issues array listing every meaningful defect you found (max 8 items).

Return valid JSON only:
{
  "pass": boolean,
  "score": number,
  "hasFundamentalError": boolean,
  "fundamentalErrorDescription": string | null,
  "hasRandomText": boolean,
  "hasSketchesOrDrawings": boolean,
  "productCount": number,
  "productFidelity": "identical" | "minor_shift" | "altered" | "regenerated",
  "productFidelityScore": number,
  "sceneQuality": "poor" | "acceptable" | "good" | "excellent",
  "physicallyPlausible": boolean,
  "sceneAppropriate": boolean,
  "humanAnatomy": "no_person" | "natural" | "minor_issue" | "major_issue",
  "productIntegration": "natural" | "awkward" | "impossible",
  "hasComponentIssue": boolean,
  "componentDescription": string,
  "brandingAccurate": boolean,
  "brandingIssues": string[],
  "instructionFollowed": boolean,
  "issues": string[]
}`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Conservative defaults on timeout/error
// ---------------------------------------------------------------------------

function conservativeDefaults(): UnifiedQAResult {
  return {
    pass: false,
    score: 55,
    hasFundamentalError: false,
    fundamentalErrorDescription: null,
    hasRandomText: false,
    hasSketchesOrDrawings: false,
    productCount: 1,
    productFidelity: 'altered',
    productFidelityScore: 20,
    sceneQuality: 'acceptable',
    physicallyPlausible: true,
    sceneAppropriate: true,
    humanAnatomy: 'no_person',
    productIntegration: 'natural',
    hasComponentIssue: false,
    componentDescription: 'none',
    brandingAccurate: true,
    brandingIssues: [],
    instructionFollowed: true,
    issues: ['QA check failed — defaulting to conservative score'],
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Unified QA check — merges focused binary checks, combined scoring QA, and
 * branding verification into a single Gemini call. Replaces:
 *   - combinedQualityCheck() in combined-qa.ts
 *   - runFocusedChecks() in focused-checks.ts
 *   - The verify step of verifyAndFixBranding() in gemini-branding-fix.ts
 *
 * One API call instead of 5-6. ~30s timeout with conservative fallback.
 */
export async function unifiedQualityCheck(
  inputBuffer: Buffer,
  outputBuffer: Buffer,
  options: UnifiedQAOptions,
): Promise<UnifiedQAResult> {
  const startMs = Date.now();

  const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

  const promptText = buildUnifiedPrompt(
    options.checkFidelity,
    options.voiceInstructions,
    options.brandingInventory,
    options.productPhysicalSize,
  );

  const outputBase64 = outputBuffer.toString('base64');
  const outputMime = detectMime(outputBuffer);

  const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];

  if (options.checkFidelity) {
    // Send both images: Image 1 = original, Image 2 = output
    const inputBase64 = inputBuffer.toString('base64');
    const inputMime = detectMime(inputBuffer);
    parts.push({ inlineData: { mimeType: inputMime, data: inputBase64 } });
    parts.push({ inlineData: { mimeType: outputMime, data: outputBase64 } });
  } else {
    // No fidelity check — output only (prompt references it as Image 1)
    parts.push({ inlineData: { mimeType: outputMime, data: outputBase64 } });
  }

  parts.push({ text: promptText });

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('unifiedQualityCheck timed out after 30s')), 30_000),
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
    const result = UnifiedQASchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(`Unified QA schema validation failed: ${result.error.message}`);
    }

    const data = result.data;

    // -------------------------------------------------------------------------
    // Server-side pass re-validation — do not trust the model's pass boolean
    // -------------------------------------------------------------------------

    const correctProductCount =
      options.isPairedProduct
        ? data.productCount >= 1 && data.productCount <= 10
        : data.productCount === 1;

    // style_with_model generates a human scene — fidelity is inherently lower
    const fidelityThreshold = options.style === 'style_with_model' ? 10 : 15;

    const serverPass =
      data.score >= 60 &&
      data.productFidelityScore >= fidelityThreshold &&
      !data.hasRandomText &&
      !data.hasSketchesOrDrawings &&
      !data.hasFundamentalError &&
      data.humanAnatomy !== 'major_issue' &&
      data.productIntegration !== 'impossible' &&
      correctProductCount &&
      data.sceneAppropriate !== false;

    // brandingAccurate is intentionally NOT in the server pass criteria —
    // branding failures trigger the BiRefNet/fix safety net, not QA rejection.

    // Post-processing: if score is high and the only branding issues are fine print /
    // secondary elements, override brandingAccurate to true so the BiRefNet rescue
    // is not triggered unnecessarily.
    if (!data.brandingAccurate && data.score >= 80) {
      const onlyFinePrint = data.brandingIssues.every(issue => {
        const lower = issue.toLowerCase();
        return (
          lower.includes('nutrition') ||
          lower.includes('calories') ||
          lower.includes('ingredients') ||
          lower.includes('barcode') ||
          lower.includes('guarantee') ||
          lower.includes('net wt') ||
          lower.includes('fl oz') ||
          lower.includes('small print') ||
          lower.includes('fine print') ||
          lower.includes('blurry') ||
          lower.includes('illegible')
        );
      });
      if (onlyFinePrint) {
        data.brandingAccurate = true;
        console.info(JSON.stringify({ event: 'unified_qa_fine_print_override', originalIssues: data.brandingIssues }));
      }
    }

    data.pass = serverPass;

    console.info(
      JSON.stringify({
        event: 'unified_qa_complete',
        pass: data.pass,
        score: data.score,
        fidelity: data.productFidelity,
        fidelityScore: data.productFidelityScore,
        hasRandomText: data.hasRandomText,
        hasFundamentalError: data.hasFundamentalError,
        productCount: data.productCount,
        humanAnatomy: data.humanAnatomy,
        brandingAccurate: data.brandingAccurate,
        brandingIssues: data.brandingIssues,
        instructionFollowed: data.instructionFollowed,
        hasComponentIssue: data.hasComponentIssue,
        issues: data.issues,
        durationMs: Date.now() - startMs,
      }),
    );

    return data;
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.includes('timed out');

    if (isTimeout) {
      console.warn(
        JSON.stringify({
          event: 'unified_qa_timeout',
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startMs,
        }),
      );
    } else {
      console.error(
        JSON.stringify({
          event: 'unified_qa_error',
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startMs,
        }),
      );
    }

    return conservativeDefaults();
  }
}

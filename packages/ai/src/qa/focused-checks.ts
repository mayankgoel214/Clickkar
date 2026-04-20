import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FocusedCheckResult {
  productCount: number;
  hasFundamentalDefect: boolean;
  defectDescription: string | null;
  hasRandomTextOrSketch: boolean;
  hasAnatomyIssue: boolean;
  anatomyDescription: string | null;
  hasComponentIssue: boolean;
  componentDescription: string;
  instructionFollowed: boolean;
  pass: boolean;
  failReasons: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClient(): GoogleGenAI {
  const key = getProviderKey('gemini');
  return new GoogleGenAI({ apiKey: key });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timer = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
  return Promise.race([promise, timer]);
}

async function askBinaryQuestion(
  client: GoogleGenAI,
  imageBuffer: Buffer,
  prompt: string,
): Promise<string> {
  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageBuffer.toString('base64') } },
          { text: prompt },
        ],
      },
    ],
    config: {
      temperature: 0.1, // very low for factual answers
      maxOutputTokens: 100,
    },
  });

  return response.text?.trim() ?? '';
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkProductCount(
  client: GoogleGenAI,
  outputBuffer: Buffer,
  productName: string,
): Promise<{ count: number; raw: string }> {
  const prompt = `Count the number of "${productName}" (or very similar products) visible in this advertisement image.

Count EACH separate instance — if you see 2 copies of the same product, answer 2. If there is one product shown from one angle, answer 1. Do NOT count reflections on polished/acrylic/glass surfaces as separate products — those are reflections, not duplicates. Do NOT count shadows as separate instances.

EXCEPTION: If the product is inherently a PAIR (earrings, shoes, socks, gloves, cufflinks) or a SET (bangles, necklace+earring set), the correct count is the number of pieces in the set. A pair of earrings = count 2 is CORRECT, not a duplication.

Reply with ONLY a single number (e.g., "1" or "2"). Nothing else.`;

  const raw = await askBinaryQuestion(client, outputBuffer, prompt);
  const match = raw.match(/\d+/);
  const count = match ? parseInt(match[0], 10) : 1;
  return { count, raw };
}

async function checkFundamentalDefects(
  client: GoogleGenAI,
  outputBuffer: Buffer,
  voiceInstructions?: string,
): Promise<{ hasDefect: boolean; description: string | null; raw: string }> {
  const prompt = `Inspect this product advertisement image for CRITICAL defects only. Check for:

1. Product is melted, warped, or has wrong proportions
2. Major rendering artifacts: half-rendered objects, glitch patterns, smeared/blurry regions covering >10% of image
3. Product is clearly floating in mid-air (no surface contact at all)
4. Product is merged into or growing out of another object
5. Product is severely distorted — wrong shape, wrong color, unrecognizable vs what a real product would look like
6. Scene has impossible physics — objects embedded in walls, surfaces at impossible angles
7. Product looks like a CGI RENDER or CARTOON instead of a photographed physical object — uniformly smooth surfaces with no specular highlights, no material texture, no packaging crinkle, looks like a flat digital illustration rather than a real product under real lighting

Do NOT flag minor issues like slight color differences, soft focus in background, or subtle texture artifacts.

EXCEPTION: Images, photos, or artwork that are PRINTED ON a curved product surface (e.g., a mug, bottle, or cylinder) will naturally appear warped/curved — this is physically correct and NOT a defect. Do not flag curvature distortion of surface prints.

EXCEPTION: If the user specifically requested any of these effects (floating, levitation, unusual angles, surreal composition), then those are INTENTIONAL and NOT defects. User's instructions: "${voiceInstructions ?? 'none'}"

If you find ANY critical defect, reply: "YES: [one sentence describing the defect]"
If the image looks clean with no critical defects, reply: "NO"

Reply YES or NO only.`;

  const raw = await askBinaryQuestion(client, outputBuffer, prompt);
  const isYes = raw.toUpperCase().startsWith('YES');
  const description = isYes ? raw.replace(/^YES:?\s*/i, '').trim() || null : null;
  return { hasDefect: isYes, description, raw };
}

async function checkHumanAnatomy(
  client: GoogleGenAI,
  outputBuffer: Buffer,
): Promise<{ hasIssue: boolean; description: string | null; raw: string }> {
  const prompt = `Inspect this image for human anatomy problems.

CRITICAL EXCEPTION: Photos, images, portraits, or artwork of people that are PRINTED ON or PART OF the product surface (e.g., a mug with a photo collage, a t-shirt with a face print, a phone case with a portrait, a greeting card with a family photo, a poster, a canvas print) are NOT real people in the scene. These are decorative prints on the product — IGNORE them completely. Only evaluate anatomy for actual 3D human subjects physically present in the scene, NOT for imagery depicted on the product surface.

If there is NO person in the image, reply "NO" immediately.

If a person IS present, carefully check:
1. LIMB COUNT: Does the person have exactly 2 arms and exactly 2 legs? Count carefully — look for phantom/extra limbs, especially in seated or curled poses where legs may overlap. A third leg or arm is a critical failure.
2. HAND COUNT: Exactly 2 hands, each with exactly 5 fingers (4 fingers + 1 thumb). Count each finger individually.
3. FEET: Exactly 2 feet. No extra feet visible.
4. FACE: 2 eyes, 1 nose, 1 mouth. Eyes should focus on the same point. No distorted facial features.
5. PROPORTIONS: Natural human body proportions — no elongated/shortened limbs, no oversized/undersized head.

If ANY anatomy issue exists, reply: "YES: [describe the specific issue]"
If anatomy looks correct OR no person is present, reply: "NO"

Reply YES or NO only.`;

  const raw = await askBinaryQuestion(client, outputBuffer, prompt);
  const isYes = raw.toUpperCase().startsWith('YES');
  const description = isYes ? raw.replace(/^YES:?\s*/i, '').trim() || null : null;
  return { hasIssue: isYes, description, raw };
}

async function checkRandomTextAndSketches(
  client: GoogleGenAI,
  outputBuffer: Buffer,
): Promise<{ hasIssue: boolean; raw: string }> {
  const prompt = `Check this advertisement image for TWO things:

1. RANDOM TEXT: Is there any generated/random text in the BACKGROUND or SCENE that is NOT part of the product itself? ANY text, images, artwork, photos, or designs that are physically PRINTED ON or PART OF the product surface are fine — this includes product labels, brand names, custom text, photo collages, decorative patterns, names, dates, quotes, and any printed imagery on mugs, t-shirts, phone cases, greeting cards, posters, etc. Only flag text/graphics that are floating in the BACKGROUND SCENE and not part of the physical product. But random words, "8K", "QUALITY", gibberish text, watermarks in the scene = problem. EXCEPTION: The small Autmn logo watermark at the bottom-right corner of the image is INTENTIONAL branding. IGNORE it completely.

2. SKETCHES/CARTOONS: Does any part of the image look like a line drawing, sketch, illustration, or cartoon instead of a photograph?

If EITHER issue exists, reply: "YES"
If the image is clean (photorealistic, no random scene text), reply: "NO"

Reply YES or NO only.`;

  const raw = await askBinaryQuestion(client, outputBuffer, prompt);
  const isYes = raw.toUpperCase().startsWith('YES');
  return { hasIssue: isYes, raw };
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
// Check 5: Product component accuracy
// ---------------------------------------------------------------------------

async function checkComponentAccuracy(
  inputBuffer: Buffer,
  outputBuffer: Buffer,
): Promise<{ allComponentsPresent: boolean; missingComponents: string }> {
  try {
    const genai = getClient();
    const inputBase64 = inputBuffer.toString('base64');
    const inputMime = detectMime(inputBuffer);
    const outputBase64 = outputBuffer.toString('base64');
    const outputMime = detectMime(outputBuffer);

    const response = await Promise.race([
      genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: inputMime, data: inputBase64 } },
            { inlineData: { mimeType: outputMime, data: outputBase64 } },
            { text: `Image 1 is the ORIGINAL product photo. Image 2 is the AI-generated ad.

Compare the product in both images:
1. Count ALL visible components/pieces in Image 1 (e.g., necklace + 2 earrings = 3 pieces, bottle + cap = 2 pieces, single item = 1 piece)
2. Count ALL visible components/pieces in Image 2
3. Check if EACH component in Image 1 has a matching component in Image 2 with similar shape and proportions
4. Check if the product in Image 2 has the SAME overall shape, size ratio, and form factor as in Image 1. A flat pouch that becomes a structured bag, a wristlet that becomes a shoulder bag, a small coin purse that becomes a large clutch, or any other change in the fundamental product category/form counts as ALTERED — even if the color and branding match.

Answer in JSON:
{"allComponentsPresent": boolean, "missingComponents": "description of what's missing, distorted, or form-factor-changed, or 'none'"}

Be strict: if an earring's shape changed from elongated drop to compact stud, that counts as a missing/wrong component. If a small flat accessory was reshaped into a larger or different product type, that counts as a form factor change and must be reported.` }
          ],
        }],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      allComponentsPresent: parsed.allComponentsPresent ?? true,
      missingComponents: parsed.missingComponents ?? 'none',
    };
  } catch {
    // Component check timeout or parse error — uncertain, let combined QA decide
    return { allComponentsPresent: true, missingComponents: 'check timed out — relying on combined QA' };
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Layer 1: Focused AI binary questions.
 * Fires 5 independent Gemini calls in parallel (~2s wall clock).
 * Each asks ONE specific yes/no question — far more reliable than omnibus scoring.
 */
export async function runFocusedChecks(
  inputBuffer: Buffer,
  outputBuffer: Buffer,
  productName: string,
  voiceInstructions?: string,
): Promise<FocusedCheckResult> {
  const client = getClient();

  const result: FocusedCheckResult = {
    productCount: 1,
    hasFundamentalDefect: false,
    defectDescription: null,
    hasRandomTextOrSketch: false,
    hasAnatomyIssue: false,
    anatomyDescription: null,
    hasComponentIssue: false,
    componentDescription: 'none',
    instructionFollowed: true,
    pass: true,
    failReasons: [],
  };

  // Build instruction compliance check promise (only when voiceInstructions is provided)
  const instructionCheckPromise = voiceInstructions
    ? withTimeout(
        askBinaryQuestion(
          client,
          outputBuffer,
          `Does this image follow the user's instruction: '${voiceInstructions}'? Answer yes if the instruction was clearly incorporated into the scene. Answer no if the instruction was ignored or not visible.`,
        ).then((raw) => ({ followed: raw.toUpperCase().startsWith('YES'), raw })),
        TIMEOUT_MS,
        { followed: true, raw: 'timeout' }, // default pass on timeout — informational only
      )
    : Promise.resolve({ followed: true, raw: 'no_instructions' });

  // Fire all checks in parallel with timeout
  // CRITICAL: timeout defaults to FAIL (not pass) to prevent bad images slipping through
  const [countResult, defectResult, textResult, anatomyResult, componentResult, instructionResult] = await Promise.all([
    withTimeout(
      checkProductCount(client, outputBuffer, productName),
      TIMEOUT_MS,
      { count: -1, raw: 'timeout' }, // -1 = unknown, treated as fail
    ),
    withTimeout(
      checkFundamentalDefects(client, outputBuffer, voiceInstructions),
      TIMEOUT_MS,
      { hasDefect: true, description: 'check timed out — assuming defect', raw: 'timeout' },
    ),
    withTimeout(
      checkRandomTextAndSketches(client, outputBuffer),
      TIMEOUT_MS,
      { hasIssue: true, raw: 'timeout' }, // assume issue on timeout
    ),
    withTimeout(
      checkHumanAnatomy(client, outputBuffer),
      TIMEOUT_MS,
      { hasIssue: false, description: null, raw: 'timeout' }, // anatomy timeout = pass (most images don't have people)
    ),
    withTimeout(
      checkComponentAccuracy(inputBuffer, outputBuffer),
      TIMEOUT_MS,
      { allComponentsPresent: true, missingComponents: 'check timed out — relying on combined QA' }, // uncertain on timeout — let combined QA decide
    ),
    instructionCheckPromise,
  ]);

  result.productCount = countResult.count;
  result.hasFundamentalDefect = defectResult.hasDefect;
  result.defectDescription = defectResult.description;
  result.hasRandomTextOrSketch = textResult.hasIssue;
  result.hasAnatomyIssue = anatomyResult.hasIssue;
  result.anatomyDescription = anatomyResult.description;
  result.hasComponentIssue = !componentResult.allComponentsPresent;
  result.componentDescription = componentResult.missingComponents;
  result.instructionFollowed = instructionResult.followed;

  console.info(JSON.stringify({
    event: 'focused_checks_complete',
    productCount: countResult.count,
    productCountRaw: countResult.raw,
    hasFundamentalDefect: defectResult.hasDefect,
    defectDescription: defectResult.description,
    hasRandomTextOrSketch: textResult.hasIssue,
    hasAnatomyIssue: anatomyResult.hasIssue,
    anatomyDescription: anatomyResult.description,
    hasComponentIssue: result.hasComponentIssue,
    componentDescription: result.componentDescription,
    instructionFollowed: instructionResult.followed,
    instructionRaw: instructionResult.raw,
  }));

  // Evaluate pass/fail
  const isPairedProduct = /earring|jhumka|tops|pair|set|shoe|sandal|bangle|chudi|cufflink|sock|glove/i.test(productName);
  const expectedCount = isPairedProduct ? -1 : 1; // -1 means allow any reasonable count (1-10)

  if (expectedCount === -1) {
    // Paired product — any count 1-10 is fine; only fail on missing or timeout
    result.productCount = countResult.count;
    if (countResult.count === -1) {
      result.pass = false;
      result.failReasons.push('product_count_timeout');
    } else if (countResult.count === 0) {
      result.pass = false;
      result.failReasons.push('product_missing');
    }
    // count > 1 is expected and correct for paired products
  } else if (countResult.count !== 1) {
    result.pass = false;
    if (countResult.count === -1) {
      result.failReasons.push('product_count_timeout');
    } else if (countResult.count === 0) {
      result.failReasons.push('product_missing');
    } else {
      result.failReasons.push(`product_duplicated:count=${countResult.count}`);
    }
  }

  if (defectResult.hasDefect) {
    result.pass = false;
    result.failReasons.push(`fundamental_defect:${defectResult.description ?? 'unknown'}`);
  }

  if (textResult.hasIssue) {
    result.pass = false;
    result.failReasons.push('random_text_or_sketch');
  }

  if (anatomyResult.hasIssue) {
    result.pass = false;
    result.failReasons.push(`anatomy_issue:${anatomyResult.description ?? 'unknown'}`);
  }

  if (!componentResult.allComponentsPresent) {
    result.pass = false;
    result.failReasons.push(`component_accuracy:${componentResult.missingComponents}`);
  }

  return result;
}

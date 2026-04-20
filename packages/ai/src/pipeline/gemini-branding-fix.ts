import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import { geminiEditImage } from './gemini-generate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGenAI(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: getProviderKey('gemini') });
}

function detectMime(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

const VERIFY_MODEL = 'gemini-2.5-flash';
const VERIFY_TIMEOUT_MS = 60_000;

interface BrandingVerifyResult {
  accurate: boolean;
  issues: string[];
}

// ---------------------------------------------------------------------------
// verifyAndFixBranding
// ---------------------------------------------------------------------------

/**
 * Verifies product branding accuracy in a generated ad image vs the original
 * product photo, and attempts to fix it if the branding is incorrect.
 *
 * Uses Gemini text-only for verification, geminiEditImage for the fix.
 * Non-fatal: falls back to the generated ad on any error.
 */
export async function verifyAndFixBranding(params: {
  originalProductBuffer: Buffer;
  generatedAdBuffer: Buffer;
  brandElements: string[];
  hasBranding: boolean;
  brandingConfidence: number;
}): Promise<{ imageBuffer: Buffer; brandingFixed: boolean }> {
  const {
    originalProductBuffer,
    generatedAdBuffer,
    brandElements,
    hasBranding,
    brandingConfidence,
  } = params;

  // -------------------------------------------------------------------------
  // Step 1 — Skip guard
  // -------------------------------------------------------------------------

  if (!hasBranding || brandingConfidence < 0.7 || brandElements.length === 0) {
    console.info(
      JSON.stringify({
        event: 'branding_fix_skipped',
        reason: !hasBranding
          ? 'no_branding'
          : brandingConfidence < 0.3
            ? 'low_confidence'
            : 'no_brand_elements',
        hasBranding,
        brandingConfidence,
        brandElementCount: brandElements.length,
      }),
    );
    return { imageBuffer: generatedAdBuffer, brandingFixed: false };
  }

  // -------------------------------------------------------------------------
  // Step 2 — Verify branding (text-only Gemini call)
  // -------------------------------------------------------------------------

  const verifyStart = Date.now();
  console.info(
    JSON.stringify({
      event: 'branding_verify_start',
      model: VERIFY_MODEL,
      brandElementCount: brandElements.length,
    }),
  );

  let verifyResult: BrandingVerifyResult;

  try {
    const genAI = getGenAI();

    const originalMime = detectMime(originalProductBuffer);
    const originalBase64 = originalProductBuffer.toString('base64');

    const generatedMime = detectMime(generatedAdBuffer);
    const generatedBase64 = generatedAdBuffer.toString('base64');

    const verifyPrompt = `Compare the product branding in these two images.

Image 1: The ORIGINAL product photo (ground truth for text and logos)
Image 2: A generated advertisement

The product should have these brand elements: ${brandElements.join(', ')}

Is the product's branding (text, logos, colors) in Image 2 accurate vs Image 1?
Check: Are brand names readable and correctly spelled? Are logos recognizable? Are brand colors correct?

Return JSON only:
{"accurate": boolean, "issues": string[]}`;

    const verifyPromise = genAI.models.generateContent({
      model: VERIFY_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: originalMime,
                data: originalBase64,
              },
            },
            {
              inlineData: {
                mimeType: generatedMime,
                data: generatedBase64,
              },
            },
            { text: verifyPrompt },
          ],
        },
      ],
    });

    const verifyResponse = await Promise.race([
      verifyPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`branding verify timed out after ${VERIFY_TIMEOUT_MS / 1000}s`)),
          VERIFY_TIMEOUT_MS,
        ),
      ),
    ]);

    const rawText =
      verifyResponse.candidates?.[0]?.content?.parts?.find(
        (p: { text?: string }) => typeof p.text === 'string',
      )?.text ?? '';

    // Strip markdown code fences if present
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    verifyResult = JSON.parse(jsonText) as BrandingVerifyResult;
  } catch (err) {
    const durationMs = Date.now() - verifyStart;
    console.info(
      JSON.stringify({
        event: 'branding_verify_complete',
        durationMs,
        error: String(err),
        fallback: true,
      }),
    );
    // Non-fatal: cannot verify, skip fix
    return { imageBuffer: generatedAdBuffer, brandingFixed: false };
  }

  const verifyDurationMs = Date.now() - verifyStart;
  console.info(
    JSON.stringify({
      event: 'branding_verify_complete',
      durationMs: verifyDurationMs,
      accurate: verifyResult.accurate,
      issues: verifyResult.issues,
    }),
  );

  if (verifyResult.accurate === true) {
    return { imageBuffer: generatedAdBuffer, brandingFixed: false };
  }

  // -------------------------------------------------------------------------
  // Step 3 — Fix branding via geminiEditImage
  // -------------------------------------------------------------------------

  const fixStart = Date.now();
  console.info(
    JSON.stringify({
      event: 'branding_fix_start',
      issues: verifyResult.issues,
      brandElementCount: brandElements.length,
    }),
  );

  const fixPrompt = `Fix the product branding in this advertisement image.

Image 1: The ORIGINAL product (ground truth for all text, logos, and branding)
Image 2: The advertisement (great scene, but product text/logos are incorrect)

The product must show these brand elements EXACTLY: ${brandElements.join(', ')}

Regenerate Image 2 keeping the EXACT same scene, composition, lighting, person (if present), and props.
Only fix the product's text, logos, and branding to match Image 1.
Do not change anything else about the image.`;

  const fixResult = await geminiEditImage({
    originalImageBuffer: originalProductBuffer,
    generatedImageBuffer: generatedAdBuffer,
    prompt: fixPrompt,
  });

  const fixDurationMs = Date.now() - fixStart;

  // geminiEditImage returns the generatedImageBuffer as-is on error (non-fatal fallback)
  const brandingFixed = fixResult.imageBuffer !== generatedAdBuffer;

  console.info(
    JSON.stringify({
      event: 'branding_fix_complete',
      durationMs: fixDurationMs,
      brandingFixed,
    }),
  );

  if (!brandingFixed) {
    return { imageBuffer: generatedAdBuffer, brandingFixed: false };
  }

  return { imageBuffer: fixResult.imageBuffer, brandingFixed: true };
}

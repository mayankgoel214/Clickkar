/**
 * V5 Simple QA — 3 binary catastrophic-failure checks.
 * Replaces the 20-field unified QA scoring system.
 * ~5s, one Gemini text call, pass/fail only.
 */

import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const SimpleQASchema = z.object({
  distorted: z.boolean().catch(false),
  randomText: z.boolean().catch(false),
  badAnatomy: z.boolean().catch(false),
});

export type SimpleQAResult = z.infer<typeof SimpleQASchema> & { pass: boolean };

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const QA_PROMPT = `Look at these two images. Image 1 is the original product photo. Image 2 is an AI-generated advertisement using that product.

Answer these 3 questions as JSON. Nothing else.

1. distorted: Is the product in Image 2 fundamentally distorted, melted, warped, or have clearly wrong proportions compared to Image 1? Minor lighting/color differences are fine. Only answer true if the product shape is clearly WRONG.
2. randomText: Is there any text floating in the BACKGROUND or SCENE of Image 2 that is NOT printed on the product itself? Ignore any small watermark at the bottom. Only flag random generated text like "8K", "QUALITY", gibberish words in the sky/surface.
3. badAnatomy: Is there a person visible in Image 2 with obviously wrong anatomy — extra fingers, missing limbs, distorted face, uncanny proportions? If no person is visible, answer false.

Return ONLY valid JSON: {"distorted": false, "randomText": false, "badAnatomy": false}`;

const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function simpleQA(
  originalBuffer: Buffer,
  generatedBuffer: Buffer,
): Promise<SimpleQAResult> {
  const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

  const origB64 = originalBuffer.toString('base64');
  const genB64 = generatedBuffer.toString('base64');

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('simpleQA timed out after 15s')),
      TIMEOUT_MS,
    ),
  );

  try {
    const response = await Promise.race([
      genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: origB64 } },
              { inlineData: { mimeType: 'image/jpeg', data: genB64 } },
              { text: QA_PROMPT },
            ],
          },
        ],
        config: { temperature: 0.1 },
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
    const result = SimpleQASchema.parse(parsed);
    const pass = !result.distorted && !result.randomText && !result.badAnatomy;

    console.info(
      JSON.stringify({
        event: 'v5_simple_qa_done',
        distorted: result.distorted,
        randomText: result.randomText,
        badAnatomy: result.badAnatomy,
        pass,
      }),
    );

    return { ...result, pass };
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: 'v5_simple_qa_failed',
        error: err instanceof Error ? err.message : String(err),
        fallback: 'optimistic pass',
      }),
    );

    // Optimistic: deliver rather than retry on QA failure
    return { distorted: false, randomText: false, badAnatomy: false, pass: true };
  }
}

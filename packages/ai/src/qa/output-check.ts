import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { OUTPUT_CHECK_PROMPT } from '../prompts/output-check.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const OutputAssessmentSchema = z.object({
  score: z.number().min(0).max(100),
  pass: z.boolean(),
  productVisible: z.boolean(),
  backgroundQuality: z.enum(['poor', 'acceptable', 'good', 'excellent']),
  compositingArtifacts: z.boolean(),
  edgeQuality: z.enum(['poor', 'acceptable', 'good', 'excellent']),
  lightingConsistent: z.boolean(),
  instagramReady: z.boolean(),
  primaryIssue: z.string().nullable(),
  suggestedFix: z.string().nullable(),
});

export type OutputAssessment = z.infer<typeof OutputAssessmentSchema>;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Check the quality of a processed product image output.
 *
 * Sends the image to Gemini 2.5 Flash Lite for multi-dimensional quality scoring.
 * Score >= 65 is a pass. Score >= 80 is Instagram-ready.
 */
export async function checkOutputQuality(
  imageBuffer: Buffer
): Promise<OutputAssessment> {
  const startMs = Date.now();

  const genai = new GoogleGenAI({
    apiKey: process.env['GOOGLE_GENAI_API_KEY']!,
  });

  const base64Image = imageBuffer.toString('base64');

  // Detect MIME type from buffer magic bytes
  let mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg';
  if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
    mimeType = 'image/png';
  } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) {
    mimeType = 'image/webp';
  }

  let assessment: OutputAssessment;

  try {
    const response = await genai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
            {
              text: OUTPUT_CHECK_PROMPT,
            },
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
        `Gemini returned non-JSON for output check: ${rawText.slice(0, 200)}`
      );
    }

    const result = OutputAssessmentSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Output check schema validation failed: ${result.error.message}`
      );
    }

    assessment = result.data;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'output_check_gemini_error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startMs,
      })
    );

    // Fail open: assume a mediocre passing score so processing can continue
    return {
      score: 65,
      pass: true,
      productVisible: true,
      backgroundQuality: 'acceptable',
      compositingArtifacts: false,
      edgeQuality: 'acceptable',
      lightingConsistent: true,
      instagramReady: false,
      primaryIssue: null,
      suggestedFix: null,
    };
  }

  console.info(
    JSON.stringify({
      event: 'output_check_complete',
      score: assessment.score,
      pass: assessment.pass,
      instagramReady: assessment.instagramReady,
      primaryIssue: assessment.primaryIssue,
      durationMs: Date.now() - startMs,
    })
  );

  return assessment;
}

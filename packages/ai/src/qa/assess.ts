import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { QUALITY_ASSESSMENT_PROMPT } from '../prompts/quality-assessment.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const InputAssessmentSchema = z.object({
  usable: z.boolean(),
  productDetected: z.boolean(),
  productCategory: z.enum([
    'food',
    'jewellery',
    'garment',
    'skincare',
    'candle',
    'bag',
    'home_goods',
    'other',
  ]),
  issues: z.array(z.string()),
  angleQuality: z.enum(['poor', 'acceptable', 'good']),
  angleSuggestion: z.string().nullable(),
  lightingQuality: z.enum(['poor', 'acceptable', 'good']),
  blurDetected: z.boolean(),
  confidence: z.number().min(0).max(1),
  rejectionReason: z.string().nullable(),
});

export type InputAssessment = z.infer<typeof InputAssessmentSchema>;

// ---------------------------------------------------------------------------
// Pass 1: Local sharp analysis (free, no API call)
// ---------------------------------------------------------------------------

interface SharpPrecheck {
  passed: boolean;
  rejectionReason: string | null;
  width: number;
  height: number;
  meanBrightness: number;
  fileSizeBytes: number;
}

async function runSharpPrecheck(
  imageBuffer: Buffer
): Promise<SharpPrecheck> {
  const fileSizeBytes = imageBuffer.byteLength;

  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // Resolution check
  if (width < 400 || height < 400) {
    return {
      passed: false,
      rejectionReason: `Image resolution too low (${width}x${height}). Minimum required is 400x400 pixels.`,
      width,
      height,
      meanBrightness: 0,
      fileSizeBytes,
    };
  }

  // File size check
  if (fileSizeBytes < 50 * 1024) {
    return {
      passed: false,
      rejectionReason: `Image file size too small (${Math.round(fileSizeBytes / 1024)}KB). Minimum is 50KB — the image may be too compressed or corrupt.`,
      width,
      height,
      meanBrightness: 0,
      fileSizeBytes,
    };
  }

  // Brightness check via pixel stats
  const stats = await image
    .resize(200, 200, { fit: 'inside' })
    .stats();

  // stats.channels is Sharp ChannelStats[] with mean per channel
  const rgbChannels = stats.channels.slice(0, 3);
  const meanBrightness =
    rgbChannels.reduce((sum: number, ch: { mean: number }) => sum + ch.mean, 0) / rgbChannels.length;

  if (meanBrightness < 30) {
    return {
      passed: false,
      rejectionReason:
        'Image appears too dark (very low brightness). Please retake in better lighting.',
      width,
      height,
      meanBrightness,
      fileSizeBytes,
    };
  }

  if (meanBrightness > 240) {
    return {
      passed: false,
      rejectionReason:
        'Image appears severely overexposed (very high brightness). Please retake with less light or adjust camera exposure.',
      width,
      height,
      meanBrightness,
      fileSizeBytes,
    };
  }

  return {
    passed: true,
    rejectionReason: null,
    width,
    height,
    meanBrightness,
    fileSizeBytes,
  };
}

// ---------------------------------------------------------------------------
// Pass 2: Gemini vision assessment
// ---------------------------------------------------------------------------

async function runGeminiAssessment(
  imageBuffer: Buffer
): Promise<InputAssessment> {
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
            text: QUALITY_ASSESSMENT_PROMPT,
          },
        ],
      },
    ],
  });

  const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Strip any markdown code fences if model wraps response
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Gemini returned non-JSON response for input assessment: ${rawText.slice(0, 200)}`
    );
  }

  const result = InputAssessmentSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Gemini response failed schema validation: ${result.error.message}`
    );
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Assess an input product image for quality and suitability.
 *
 * Pass 1: Local sharp checks (resolution, brightness, file size) — free.
 * Pass 2: Gemini 2.5 Flash Lite vision assessment — charged per call.
 *
 * If Pass 1 fails, Pass 2 is skipped and a synthetic assessment is returned.
 */
export async function assessInputImage(
  imageBuffer: Buffer
): Promise<InputAssessment> {
  const startMs = Date.now();

  // Pass 1: local sharp checks
  const precheck = await runSharpPrecheck(imageBuffer);

  if (!precheck.passed) {
    console.info(
      JSON.stringify({
        event: 'input_assessment_precheck_rejected',
        reason: precheck.rejectionReason,
        durationMs: Date.now() - startMs,
      })
    );

    return {
      usable: false,
      productDetected: false,
      productCategory: 'other',
      issues: ['precheck_failed'],
      angleQuality: 'poor',
      angleSuggestion: null,
      lightingQuality: 'poor',
      blurDetected: false,
      confidence: 1.0,
      rejectionReason: precheck.rejectionReason,
    };
  }

  // Pass 2: Gemini vision assessment
  let assessment: InputAssessment;
  try {
    assessment = await runGeminiAssessment(imageBuffer);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'input_assessment_gemini_error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startMs,
      })
    );
    // Fail open with a low-confidence "usable" result so pipeline can continue
    return {
      usable: true,
      productDetected: true,
      productCategory: 'other',
      issues: ['assessment_unavailable'],
      angleQuality: 'acceptable',
      angleSuggestion: null,
      lightingQuality: 'acceptable',
      blurDetected: false,
      confidence: 0.1,
      rejectionReason: null,
    };
  }

  console.info(
    JSON.stringify({
      event: 'input_assessment_complete',
      usable: assessment.usable,
      productCategory: assessment.productCategory,
      angleQuality: assessment.angleQuality,
      lightingQuality: assessment.lightingQuality,
      issueCount: assessment.issues.length,
      confidence: assessment.confidence,
      durationMs: Date.now() - startMs,
    })
  );

  return assessment;
}

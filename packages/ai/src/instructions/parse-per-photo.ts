import { getProviderKey } from '@autmn/keypool';
import { z } from 'zod';

const InstructionParseResultSchema = z.object({
  assignments: z.record(z.string(), z.string().nullable()),
  globalInstruction: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type InstructionParseResult = z.infer<typeof InstructionParseResultSchema>;

/**
 * Parses free-form user instructions and maps them to specific photos.
 * Uses Gemini 2.5 Flash with vision to identify products in photos
 * and match instruction fragments to the right photo.
 *
 * Only called for multi-photo orders with instructions.
 * Falls back gracefully on any failure.
 */
export async function parsePerPhotoInstructions(params: {
  imageUrls: string[];
  rawInstructions: string;
}): Promise<InstructionParseResult> {
  const { imageUrls, rawInstructions } = params;

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

  // Download and create thumbnails (256px) for each photo
  const sharp = (await import('sharp')).default;
  const imageParts: Array<{ inlineData: { mimeType: string; data: string } } | null> = [];

  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const resp = await fetch(imageUrls[i]!, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      const thumb = await sharp(buffer)
        .resize(256, 256, { fit: 'inside' })
        .jpeg({ quality: 60 })
        .toBuffer();
      imageParts.push({
        inlineData: { mimeType: 'image/jpeg', data: thumb.toString('base64') },
      });
    } catch (err) {
      console.warn(JSON.stringify({
        event: 'instruction_parse_thumbnail_failed',
        photoIndex: i,
        error: err instanceof Error ? err.message : String(err)
      }));
      // Skip this photo — don't send empty data to Gemini
      imageParts.push(null);
    }
  }

  const prompt = `You are an instruction parser for a product photography service.

The user sent ${imageUrls.length} product photos and one instruction message.
Your job: figure out which instruction applies to which photo.

Photos are labeled Photo 0, Photo 1, Photo 2, etc. (in the order shown above).

User's instruction (may be Hindi, English, or Hinglish):
"${rawInstructions.slice(0, 500)}"

Rules:
1. If the user mentions a product by name or type (e.g. "bag", "watch", "remote", "glasses", "juta", "ghadi", "bottle"), match it to the photo containing that product.
2. If an instruction has NO product reference (e.g. "dark moody lighting", "sab premium banao", "make everything look good"), put it in globalInstruction.
3. If the instruction says "baaki sab" or "everything else" or "rest of them", that is a globalInstruction.
4. A photo can have at most one specific instruction. If none found for a photo, set it to null.
5. Translate Hindi/Hinglish instructions to English in your output.
6. Keep instructions concise -- just the actionable part.
7. If you cannot confidently match an instruction to a photo, put it in globalInstruction.

Respond with valid JSON:
{
  "assignments": {
    "0": "instruction for photo 0 or null",
    "1": "instruction for photo 1 or null"
  },
  "globalInstruction": "instruction that applies to ALL photos, or null",
  "confidence": 0.0 to 1.0
}`;

  // Build parts: all images first, then the prompt text
  const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
  for (let i = 0; i < imageParts.length; i++) {
    if (imageParts[i]) {
      parts.push({ text: `Photo ${i}:` });
      parts.push(imageParts[i]!);
    } else {
      parts.push({ text: `Photo ${i}: [image unavailable]` });
    }
  }
  parts.push({ text: prompt });

  const response = await Promise.race([
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts }],
      config: { temperature: 0.1 },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('instruction parsing timed out after 25s')), 25_000)
    ),
  ]);

  const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error(JSON.stringify({
      event: 'instruction_parse_json_failed',
      rawText: rawText.slice(0, 500),
    }));
    throw new Error('Gemini returned non-JSON response for instruction parsing');
  }
  const result = InstructionParseResultSchema.parse(parsed);

  console.info(JSON.stringify({
    event: 'instruction_parse_complete',
    photoCount: imageUrls.length,
    confidence: result.confidence,
    assignments: result.assignments,
    globalInstruction: result.globalInstruction,
  }));

  return result;
}

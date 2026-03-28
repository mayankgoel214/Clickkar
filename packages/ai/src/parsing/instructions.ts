import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { INSTRUCTION_PARSER_PROMPT } from '../prompts/instruction-parser.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const EditCommandSchema = z.object({
  primaryAction: z.enum([
    'change_background',
    'adjust_brightness',
    'change_style',
    'resize_product',
    'something_else',
  ]),
  backgroundStyle: z
    .enum([
      'clean_white',
      'warm_lifestyle',
      'festival',
      'marble_premium',
      'outdoor_bokeh',
      'flat_lay',
      'gradient_minimal',
    ])
    .nullable(),
  backgroundDescription: z.string().nullable(),
  brightnessDelta: z.number().min(-3).max(3),
  notes: z.string(),
});

export type EditCommand = z.infer<typeof EditCommandSchema>;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Parse a user's edit instruction text (Hindi/English/Hinglish) into a
 * structured EditCommand using Gemini 2.5 Flash Lite.
 *
 * The input is typically the transcribed text from a WhatsApp voice note.
 */
export async function parseEditInstructions(
  text: string
): Promise<EditCommand> {
  const startMs = Date.now();

  if (!text || text.trim().length === 0) {
    return {
      primaryAction: 'something_else',
      backgroundStyle: null,
      backgroundDescription: null,
      brightnessDelta: 0,
      notes: 'Empty input provided',
    };
  }

  const genai = new GoogleGenAI({
    apiKey: process.env['GOOGLE_GENAI_API_KEY']!,
  });

  let editCommand: EditCommand;

  try {
    const response = await genai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${INSTRUCTION_PARSER_PROMPT}\n\n"${text.trim()}"`,
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
        `Gemini returned non-JSON for instruction parsing: ${rawText.slice(0, 200)}`
      );
    }

    const result = EditCommandSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Edit command schema validation failed: ${result.error.message}`
      );
    }

    editCommand = result.data;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'instruction_parse_error',
        inputTextPreview: text.slice(0, 80),
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startMs,
      })
    );

    // Graceful fallback — return a safe no-op command
    return {
      primaryAction: 'something_else',
      backgroundStyle: null,
      backgroundDescription: null,
      brightnessDelta: 0,
      notes: `Parse failed — original text: "${text.slice(0, 100)}"`,
    };
  }

  console.info(
    JSON.stringify({
      event: 'instruction_parse_complete',
      primaryAction: editCommand.primaryAction,
      backgroundStyle: editCommand.backgroundStyle,
      brightnessDelta: editCommand.brightnessDelta,
      durationMs: Date.now() - startMs,
    })
  );

  return editCommand;
}

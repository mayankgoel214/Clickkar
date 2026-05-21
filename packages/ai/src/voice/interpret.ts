import { getProviderKey } from '@autmn/keypool';

export interface VoiceInterpretResult {
  cleaned: string;
  intent: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Cleans a raw voice-note transcription and extracts user intent.
 *
 * Returns null when the transcription is too unclear to interpret (CONFIDENCE low
 * or UNCLEAR returned by the model). The caller should ask the user to repeat.
 *
 * Uses Gemini Flash (text-only). Times out after 8s and falls back to returning
 * the raw transcription as-is with medium confidence.
 */
export async function interpretVoiceNote(params: {
  rawTranscription: string;
  language: string;
  currentStep: string;
}): Promise<VoiceInterpretResult | null> {
  const { rawTranscription, language, currentStep } = params;

  if (!rawTranscription.trim()) return null;

  const fallback: VoiceInterpretResult = {
    cleaned: rawTranscription,
    intent: rawTranscription,
    confidence: 'medium',
  };

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

    const prompt = `A user sent a voice note that was transcribed to text. Clean and interpret the transcription.

Raw transcription: ${rawTranscription}
Detected session language: ${language}
Current flow step: ${currentStep}

Instructions:
- Fix obvious speech-to-text errors based on context. For example: "ignore the cup that is their" → "ignore the cup that is there"
- If the session language is Hindi and the transcription contains Hindi words, interpret them correctly. Do not transliterate incorrectly.
- Extract the user's actual intent given the current flow step. For example, if the step is "instructions" and the user says "peeche wala cup mat daalna", interpret this as: "Do not include the cup in the background."
- If the transcription is too unclear to interpret with confidence, do not guess. Return: UNCLEAR

Output format:
CLEANED: [cleaned transcription]
INTENT: [one sentence describing what the user wants]
CONFIDENCE: [high / medium / low]

If CONFIDENCE is low, the bot must ask the user to repeat or type their instruction.`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('interpretVoiceNote timeout')), 8_000)
    );

    const result = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-2.0-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 200, temperature: 0.1 },
      }),
      timeoutPromise,
    ]);

    const text = result.text?.trim() ?? '';

    if (text === 'UNCLEAR' || text.startsWith('UNCLEAR')) return null;

    const cleanedMatch = text.match(/^CLEANED:\s*(.+)$/m);
    const intentMatch = text.match(/^INTENT:\s*(.+)$/m);
    const confidenceMatch = text.match(/^CONFIDENCE:\s*(high|medium|low)$/im);

    if (!cleanedMatch || !intentMatch) return fallback;

    const confidence = (confidenceMatch?.[1]?.toLowerCase() ?? 'medium') as 'high' | 'medium' | 'low';

    if (confidence === 'low') return null;

    return {
      cleaned: cleanedMatch[1]!.trim(),
      intent: intentMatch[1]!.trim(),
      confidence,
    };
  } catch {
    return fallback;
  }
}

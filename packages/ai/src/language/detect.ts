import { getProviderKey } from '@autmn/keypool';

/**
 * Detects the language of a user's first message.
 *
 * Returns:
 *   'hinglish' — Hindi (Devanagari or Roman-script) or Hinglish mix
 *   'en'       — English or undetermined
 *
 * Uses Gemini Flash (text-only). Times out after 5s and falls back to 'en'.
 */
export async function detectLanguage(message: string): Promise<'en' | 'hi'> {
  if (!message.trim()) return 'en';

  // Fast heuristic: Devanagari code points → definitely Hindi
  if (/[ऀ-ॿ]/.test(message)) return 'hi';

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

    const prompt = `Detect the language of the following message.

Message: ${message}

Rules:
- If the message is in Hindi (Devanagari script or clearly Hindi words in Roman script): return "hindi"
- If the message is in English or Hinglish (mix of Hindi and English words): return "english"
- If you cannot determine: return "english"

Return only one word: "hindi" or "english". Nothing else.`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('detectLanguage timeout')), 5_000)
    );

    const result = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-2.0-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 5, temperature: 0 },
      }),
      timeoutPromise,
    ]);

    const raw = result.text?.trim().toLowerCase() ?? 'english';
    return raw === 'hindi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

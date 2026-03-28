/**
 * Sarvam AI Saaras v3 fallback transcription.
 * Optimised for Indian languages — better Hindi accuracy than Whisper in many cases.
 * Accepts OGG/Opus directly (WhatsApp native format).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SarvamTranscriptionResult {
  text: string;
  language: string;
}

// ---------------------------------------------------------------------------
// API constants
// ---------------------------------------------------------------------------

const SARVAM_API_URL = 'https://api.sarvam.ai/speech-to-text';
const SARVAM_MODEL = 'saaras:v3';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Transcribe an audio buffer using Sarvam AI Saaras v3.
 *
 * Best for Indian language voice notes — handles code-switching between
 * Hindi and English (Hinglish) naturally.
 *
 * @throws Error if the API request fails or returns an error response.
 */
export async function transcribeWithSarvam(
  audioBuffer: Buffer
): Promise<SarvamTranscriptionResult> {
  const startMs = Date.now();

  const apiKey = process.env['SARVAM_API_KEY'];
  if (!apiKey) {
    throw new Error('SARVAM_API_KEY environment variable not set');
  }

  // Sarvam API expects multipart/form-data
  const formData = new FormData();

  // WhatsApp voice notes are OGG/Opus — Sarvam accepts this directly
  const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
  formData.append('file', audioBlob, 'voice_note.ogg');
  formData.append('model', SARVAM_MODEL);
  // language_code 'unknown' triggers auto-detection
  formData.append('language_code', 'unknown');
  // with_timestamps false for simpler response
  formData.append('with_timestamps', 'false');
  formData.append('with_diarization', 'false');

  const response = await fetch(SARVAM_API_URL, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw new Error(
      `Sarvam API error ${response.status}: ${errorBody}`
    );
  }

  interface SarvamResponse {
    transcript?: string;
    language_code?: string;
    // Saaras v3 may return transcripts array for diarized output
    transcripts?: Array<{ transcript: string }>;
  }

  const data = (await response.json()) as SarvamResponse;

  // Handle both single transcript and array formats
  const text =
    data.transcript?.trim() ??
    data.transcripts?.map((t) => t.transcript).join(' ').trim() ??
    '';

  // Sarvam returns BCP-47 language codes (e.g. 'hi-IN', 'en-IN')
  const language = data.language_code ?? 'unknown';

  console.info(
    JSON.stringify({
      event: 'sarvam_transcription_complete',
      language,
      textLength: text.length,
      model: SARVAM_MODEL,
      durationMs: Date.now() - startMs,
    })
  );

  return { text, language };
}

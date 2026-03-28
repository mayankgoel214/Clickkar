import { transcribeWithGroq } from './groq-whisper.js';
import { transcribeWithSarvam } from './sarvam.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  provider: 'groq' | 'sarvam' | 'none';
  success: boolean;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Transcribe a voice note audio buffer with automatic fallback.
 *
 * Provider priority:
 * 1. Groq Whisper Large V3 Turbo — fast, low cost, good Hindi support
 * 2. Sarvam AI Saaras v3 — better for Indian language accuracy, OGG native
 * 3. Failure — returns empty text with success: false
 *
 * Both providers handle WhatsApp OGG/Opus format.
 */
export async function transcribeVoiceNote(
  audioBuffer: Buffer,
  mimeType?: string
): Promise<TranscriptionResult> {
  const startMs = Date.now();

  // ---- Attempt 1: Groq Whisper ----
  try {
    const groqResult = await transcribeWithGroq(audioBuffer, mimeType);

    if (groqResult.text.length > 0) {
      console.info(
        JSON.stringify({
          event: 'transcription_success',
          provider: 'groq',
          language: groqResult.language,
          textLength: groqResult.text.length,
          durationMs: Date.now() - startMs,
        })
      );

      return {
        text: groqResult.text,
        language: groqResult.language,
        confidence: groqResult.confidence,
        provider: 'groq',
        success: true,
      };
    }

    // Groq returned empty text — treat as failure and try Sarvam
    console.warn(
      JSON.stringify({
        event: 'transcription_groq_empty',
        note: 'Groq returned empty transcript, trying Sarvam fallback',
        durationMs: Date.now() - startMs,
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'transcription_groq_error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startMs,
      })
    );
  }

  // ---- Attempt 2: Sarvam AI ----
  try {
    const sarvamResult = await transcribeWithSarvam(audioBuffer);

    if (sarvamResult.text.length > 0) {
      console.info(
        JSON.stringify({
          event: 'transcription_success',
          provider: 'sarvam',
          language: sarvamResult.language,
          textLength: sarvamResult.text.length,
          durationMs: Date.now() - startMs,
        })
      );

      return {
        text: sarvamResult.text,
        language: sarvamResult.language,
        confidence: 0.75, // Sarvam doesn't provide per-segment confidence
        provider: 'sarvam',
        success: true,
      };
    }

    console.warn(
      JSON.stringify({
        event: 'transcription_sarvam_empty',
        note: 'Sarvam returned empty transcript',
        durationMs: Date.now() - startMs,
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'transcription_sarvam_error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startMs,
      })
    );
  }

  // ---- Both failed ----
  console.error(
    JSON.stringify({
      event: 'transcription_all_providers_failed',
      durationMs: Date.now() - startMs,
    })
  );

  return {
    text: '',
    language: 'unknown',
    confidence: 0,
    provider: 'none',
    success: false,
  };
}

export { transcribeWithGroq } from './groq-whisper.js';
export { transcribeWithSarvam } from './sarvam.js';

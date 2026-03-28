import Groq from 'groq-sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroqTranscriptionResult {
  text: string;
  language: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WHISPER_MODEL = 'whisper-large-v3-turbo';

// Groq accepts these audio MIME types
const SUPPORTED_MIME_TYPES = [
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'audio/flac',
  'audio/x-m4a',
] as const;

type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

function isSupportedMimeType(mime: string): mime is SupportedMimeType {
  return SUPPORTED_MIME_TYPES.includes(mime as SupportedMimeType);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Transcribe an audio buffer using Groq Whisper Large V3 Turbo.
 *
 * Optimised for Hindi, English, and Hinglish voice notes from WhatsApp.
 * WhatsApp sends voice notes as OGG/Opus which Groq handles natively.
 */
export async function transcribeWithGroq(
  audioBuffer: Buffer,
  mimeType?: string
): Promise<GroqTranscriptionResult> {
  const startMs = Date.now();

  const client = new Groq({
    apiKey: process.env['GROQ_API_KEY']!,
  });

  // Default to ogg if not specified (WhatsApp default)
  const resolvedMime =
    mimeType && isSupportedMimeType(mimeType) ? mimeType : 'audio/ogg';

  // Determine file extension from MIME type for the File object
  const extMap: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'mp4',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
    'audio/x-m4a': 'm4a',
  };
  const ext = extMap[resolvedMime] ?? 'ogg';
  const filename = `voice_note.${ext}`;

  // Groq SDK expects a File-like object
  const blob = new Blob([audioBuffer], { type: resolvedMime });
  // Node.js 20+ has global File, but TS needs a cast
  const file = new (globalThis as any).File([blob], filename, { type: resolvedMime });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    response_format: 'verbose_json', // gives us language detection
    language: undefined, // let Whisper auto-detect (supports Hindi)
  });

  // verbose_json returns { text, language, segments, ... }
  // The SDK types this as Transcription but verbose_json adds language field
  const result = transcription as typeof transcription & {
    language?: string;
    segments?: Array<{ avg_logprob?: number }>;
  };

  const text = result.text?.trim() ?? '';
  const language = result.language ?? 'unknown';

  // Estimate confidence from segment log probabilities if available
  const segments = result.segments ?? [];
  let confidence = 0.85; // default reasonable confidence
  if (segments.length > 0) {
    const avgLogprob =
      segments.reduce((sum, seg) => sum + (seg.avg_logprob ?? -0.5), 0) /
      segments.length;
    // Convert log probability to a 0-1 confidence estimate
    // avg_logprob typically ranges from -1.0 (poor) to 0.0 (perfect)
    confidence = Math.max(0, Math.min(1, 1 + avgLogprob));
  }

  console.info(
    JSON.stringify({
      event: 'groq_transcription_complete',
      language,
      textLength: text.length,
      confidence,
      model: WHISPER_MODEL,
      durationMs: Date.now() - startMs,
    })
  );

  return { text, language, confidence };
}

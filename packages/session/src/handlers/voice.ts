/**
 * AWAITING_VOICE handler.
 *
 * - Voice note → download, upload to Storage, transcribe (async).
 * - Text → store as instructions directly.
 * - Skip button → no instructions.
 * - Transitions to CONFIRMING in all cases.
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import type { Session, User } from '@whatsads/db';
import { uploadFile, Buckets } from '@whatsads/storage';
import { transitionTo } from '../db-helpers.js';
import { msgGenericError } from '../messages.js';
import { ButtonIds } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';
import { handleConfirming } from './confirmation.js';
import { prisma } from '@whatsads/db';

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAwaitingVoice(
  session: Session,
  user: User,
  message: MessageContext,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;

  // ---- SKIP ----
  if (
    message.messageType === 'interactive' &&
    message.buttonReplyId === ButtonIds.SKIP_VOICE
  ) {
    await transitionTo(phoneNumber, 'CONFIRMING', {
      voiceInstructions: null,
    });
    const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
    if (freshSession) {
      await handleConfirming(freshSession, user, { ...message, messageType: 'interactive', buttonReplyId: '__auto_confirm_summary' }, waClient);
    }
    return;
  }

  // ---- VOICE NOTE ----
  if (message.messageType === 'audio' && message.isVoiceNote && message.mediaId) {
    let transcript: string | null = null;

    try {
      const audioUrl = await downloadAndStoreAudio(message.mediaId, phoneNumber);

      // Transcription is best-effort — fire-and-forget
      transcript = await transcribeAudio(audioUrl).catch((err) => {
        logger.warn('Voice transcription failed', {
          phoneNumber,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      });

      logger.info('Voice note processed', { phoneNumber, transcript });
    } catch (err) {
      logger.error('Voice note download/upload failed', {
        phoneNumber,
        mediaId: message.mediaId,
        error: err instanceof Error ? err.message : String(err),
      });
      await waClient.sendText(phoneNumber, msgGenericError(lang));
      return;
    }

    await transitionTo(phoneNumber, 'CONFIRMING', {
      voiceInstructions: transcript ?? lang === 'hi' ? '(voice note)' : '(voice note)',
    });

    if (transcript) {
      await waClient.sendText(
        phoneNumber,
        lang === 'hi'
          ? `Suna! "${transcript}"\nYeh dhyan mein rakha jaayega.`
          : `Got it! "${transcript}"\nWe will keep this in mind.`,
      );
    } else {
      await waClient.sendText(
        phoneNumber,
        lang === 'hi'
          ? 'Voice note mil gayi! Dhyan mein rakhenge.'
          : 'Voice note received! Will keep it in mind.',
      );
    }

    const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
    if (freshSession) {
      await handleConfirming(freshSession, user, { ...message, messageType: 'interactive', buttonReplyId: '__auto_confirm_summary' }, waClient);
    }
    return;
  }

  // ---- TEXT INSTRUCTIONS ----
  if (message.messageType === 'text' && message.text) {
    const instructions = message.text.trim();
    await transitionTo(phoneNumber, 'CONFIRMING', {
      voiceInstructions: instructions,
    });
    await waClient.sendText(
      phoneNumber,
      lang === 'hi'
        ? `Theek hai! "${instructions}" — yeh dhyan mein rakha jaayega.`
        : `Got it! "${instructions}" — noted.`,
    );
    const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
    if (freshSession) {
      await handleConfirming(freshSession, user, { ...message, messageType: 'interactive', buttonReplyId: '__auto_confirm_summary' }, waClient);
    }
    return;
  }

  // ---- Unexpected message type — prompt again ----
  await waClient.sendText(
    phoneNumber,
    lang === 'hi'
      ? 'Voice note bhejein, kuch likhein, ya Skip karein.'
      : 'Send a voice note, type something, or tap Skip.',
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function downloadAndStoreAudio(
  mediaId: string,
  phoneNumber: string,
): Promise<string> {
  const accessToken = process.env['WHATSAPP_ACCESS_TOKEN'];
  const apiVersion = process.env['WHATSAPP_API_VERSION'] ?? 'v21.0';

  if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN not set');

  const infoRes = await fetch(
    `https://graph.facebook.com/${apiVersion}/${mediaId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!infoRes.ok) {
    throw new Error(`Media info fetch failed: ${infoRes.status}`);
  }
  const info = (await infoRes.json()) as { url: string; mime_type: string };

  const dlRes = await fetch(info.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!dlRes.ok) throw new Error(`Audio download failed: ${dlRes.status}`);

  const buffer = Buffer.from(await dlRes.arrayBuffer());
  const ext = info.mime_type.includes('ogg') ? '.ogg' : '.m4a';
  const path = `${phoneNumber}/${Date.now()}${ext}`;

  return uploadFile(Buckets.VOICE_NOTES, path, buffer, info.mime_type);
}

/**
 * Transcribe an audio file URL using Groq Whisper.
 * Returns the transcript string, or throws on failure.
 */
async function transcribeAudio(audioUrl: string): Promise<string> {
  const groqKey = process.env['GROQ_API_KEY'];
  if (!groqKey) {
    logger.warn('GROQ_API_KEY not set — skipping transcription');
    return '(transcription unavailable)';
  }

  // Download the audio bytes from our Storage (public URL)
  const dlRes = await fetch(audioUrl);
  if (!dlRes.ok) throw new Error(`Audio fetch for transcription failed: ${dlRes.status}`);

  const audioBuffer = Buffer.from(await dlRes.arrayBuffer());

  // Build multipart form data for Groq Whisper API
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
  formData.append('file', blob, 'voice.ogg');
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'hi'); // Hint — Groq handles Hinglish well

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Groq transcription failed: ${res.status}`);
  }

  const result = (await res.json()) as { text: string };
  return result.text.trim();
}

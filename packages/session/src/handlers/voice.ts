/**
 * Voice note utility — V2 streamlined flow.
 *
 * No longer a standalone state handler. The AWAITING_VOICE state is removed.
 * Voice transcription is now handled inline within instructions.ts.
 *
 * This module exports `transcribeVoiceNote` as a reusable utility for any
 * handler that needs to download WhatsApp audio and transcribe it.
 */

import { uploadFile, Buckets } from '@whatsads/storage';
import { transcribeVoiceNote as transcribeWithAI } from '@whatsads/ai';
import type { WhatsAppClient } from '@whatsads/whatsapp';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Utility: download WhatsApp audio and transcribe it
// ---------------------------------------------------------------------------

/**
 * Download a voice note by WhatsApp mediaId, upload to Storage,
 * and transcribe using the AI package (Groq → Sarvam fallback).
 *
 * Returns the transcript string on success, or null if both providers fail.
 */
export async function transcribeVoiceNoteFromMediaId(
  mediaId: string,
  phoneNumber: string,
  _wa?: WhatsAppClient,
): Promise<string | null> {
  const accessToken = process.env['WHATSAPP_ACCESS_TOKEN'];
  const apiVersion = process.env['WHATSAPP_API_VERSION'] ?? 'v21.0';

  if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN not set');

  // Step 1: Get download URL
  const infoRes = await fetch(
    `https://graph.facebook.com/${apiVersion}/${mediaId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!infoRes.ok) {
    throw new Error(`Media info fetch failed for ${mediaId}: ${infoRes.status}`);
  }
  const info = (await infoRes.json()) as { url: string; mime_type: string };

  // Step 2: Download audio bytes
  const dlRes = await fetch(info.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!dlRes.ok) throw new Error(`Audio download failed for ${mediaId}: ${dlRes.status}`);

  const buffer = Buffer.from(await dlRes.arrayBuffer());
  const ext = info.mime_type.includes('ogg') ? '.ogg' : '.m4a';
  const storagePath = `${phoneNumber}/${Date.now()}${ext}`;

  // Step 3: Upload to Storage
  await uploadFile(Buckets.VOICE_NOTES, storagePath, buffer, info.mime_type);

  // Step 4: Transcribe
  const result = await transcribeWithAI(buffer, info.mime_type).catch((err) => {
    logger.warn('Transcription failed', {
      phoneNumber,
      mediaId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  });

  if (!result || !result.success || !result.text) {
    logger.warn('Transcription returned empty result', { phoneNumber, mediaId });
    return null;
  }

  logger.info('Voice note transcribed', {
    phoneNumber,
    transcript: result.text,
    provider: result.provider,
  });

  return result.text;
}

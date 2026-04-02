/**
 * AWAITING_PHOTO handler — V2 streamlined flow.
 *
 * Photos arrive AFTER setup is complete (style + optional instructions already stored).
 *
 * - Download image from WhatsApp media API immediately (5-min expiry).
 * - Upload to Supabase Storage, accumulate URLs on session.
 * - If caption present, store as voiceInstructions.
 * - First photo: acknowledge, start 45s BullMQ auto-advance timer.
 * - At MAX_IMAGES_PER_ORDER (5): immediately create order + payment.
 * - Text "done"/"bas" or timer expiry: create order + payment.
 * - Free trial if user.orderCount === 0.
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { prisma } from '@whatsads/db';
import type { Session, User } from '@whatsads/db';
import { uploadFile, Buckets } from '@whatsads/storage';
import { getSessionTimeoutQueue } from '@whatsads/queue';
import { msgPhotoReceived, msgGenericError, msgUnknownMessage } from '../messages.js';
import { MAX_IMAGES_PER_ORDER, PHOTO_BATCH_TIMEOUT_SECONDS } from '../types.js';
import { transitionTo } from '../db-helpers.js';
import { logger } from '../logger.js';
import type { MessageContext } from '../types.js';
import {
  createOrderAndSendPayment,
  downloadWhatsAppMedia,
  mimeToExt,
} from './instructions.js';

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAwaitingPhoto(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;

  // ---- BUTTON REPLIES (same/new style from returning user with early photo) ----
  if (message.messageType === 'interactive' && message.buttonReplyId) {
    const { ButtonIds } = await import('../types.js');
    if (message.buttonReplyId === ButtonIds.SAME_STYLE && user.lastStyleUsed) {
      await prisma.session.update({
        where: { phoneNumber },
        data: { styleSelection: user.lastStyleUsed },
      });
      // If we have an early photo, advance to payment
      if (session.earlyPhotoMediaId || session.imageStorageUrls.length > 0) {
        const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
        if (freshSession) {
          await advanceToPayment(freshSession, user, wa, lang);
        }
        return;
      }
      await wa.sendText(phoneNumber, lang === 'hi' ? 'Photo bhejiye!' : 'Send your photo!');
      return;
    }
    if (message.buttonReplyId === ButtonIds.NEW_STYLE) {
      await transitionTo(phoneNumber, 'SETUP_STYLE');
      const { sendStyleList } = await import('./onboarding.js');
      await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined);
      return;
    }
  }

  // ---- IMAGE MESSAGE ----
  if (message.messageType === 'image' && message.mediaId) {
    const currentCount = session.imageStorageUrls.length;

    if (currentCount >= MAX_IMAGES_PER_ORDER) {
      // Already at max — ignore additional photos
      await wa.sendText(
        phoneNumber,
        lang === 'hi'
          ? `Maximum ${MAX_IMAGES_PER_ORDER} photos ho gayi. Processing shuru kar raha hun!`
          : `Maximum ${MAX_IMAGES_PER_ORDER} photos reached. Starting processing!`,
      );
      return;
    }

    // Download + upload immediately
    let storageUrl: string;
    try {
      const { buffer, mimeType } = await downloadWhatsAppMedia(message.mediaId);
      const ext = mimeToExt(mimeType);
      const path = `${phoneNumber}/${Date.now()}_${currentCount}${ext}`;
      storageUrl = await uploadFile(Buckets.RAW_IMAGES, path, buffer, mimeType);
    } catch (err) {
      logger.error('Photo download/upload failed', {
        phoneNumber,
        mediaId: message.mediaId,
        error: err instanceof Error ? err.message : String(err),
      });
      await wa.sendText(phoneNumber, msgGenericError(lang));
      return;
    }

    // Append to session
    const newUrls = [...session.imageStorageUrls, storageUrl];
    const newMediaIds = [...session.imageMediaIds, message.mediaId];

    // If image has a caption, use it as instructions (overrides any prior instructions)
    const instructions = message.caption?.trim() || session.voiceInstructions || null;

    await prisma.session.update({
      where: { phoneNumber },
      data: {
        imageStorageUrls: newUrls,
        imageMediaIds: newMediaIds,
        ...(message.caption?.trim() ? { voiceInstructions: message.caption.trim() } : {}),
      },
    });

    const newCount = newUrls.length;

    // Acknowledge
    await wa.sendText(phoneNumber, msgPhotoReceived(lang, newCount));

    // At max: advance immediately
    if (newCount >= MAX_IMAGES_PER_ORDER) {
      const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
      if (freshSession) {
        await advanceToPayment(freshSession, user, wa, lang);
      }
      return;
    }

    // Start/reset the 45-second auto-advance timer
    await schedulePhotoTimeout(phoneNumber, newCount);
    return;
  }

  // ---- VOICE NOTE: could be instructions if we have photos and already asked ----
  if (message.messageType === 'audio' && message.mediaId && session.imageStorageUrls.length > 0) {
    // Check if we're in instructions phase (earlyPhotoMediaId used as flag: 'awaiting_instructions')
    if (session.earlyPhotoMediaId === 'awaiting_instructions') {
      try {
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;
        const { downloadMedia } = await import('@whatsads/whatsapp');
        const { buffer, mimeType } = await downloadMedia(message.mediaId, accessToken);
        const { uploadFile: upload, Buckets: B } = await import('@whatsads/storage');
        await upload(B.VOICE_NOTES, `${phoneNumber}/${Date.now()}.ogg`, buffer, mimeType);
        const { transcribeVoiceNote } = await import('@whatsads/ai');
        const transcript = await transcribeVoiceNote(buffer, mimeType);
        if (transcript.text) {
          await prisma.session.update({ where: { phoneNumber }, data: { voiceInstructions: transcript.text, earlyPhotoMediaId: null } });
          await wa.sendText(phoneNumber, lang === 'hi' ? `Samajh gaya: "${transcript.text}"\nShuru karte hain!` : `Got it: "${transcript.text}"\nLet's go!`);
        } else {
          await prisma.session.update({ where: { phoneNumber }, data: { earlyPhotoMediaId: null } });
        }
        const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
        if (freshSession) await advanceToPayment(freshSession, user, wa, lang);
        return;
      } catch (err) {
        logger.error('Voice transcription failed', { error: String(err) });
        await prisma.session.update({ where: { phoneNumber }, data: { earlyPhotoMediaId: null } });
        const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
        if (freshSession) await advanceToPayment(freshSession, user, wa, lang);
        return;
      }
    }
  }

  // ---- TEXT while we have photos ----
  if (message.messageType === 'text' && message.text && session.imageStorageUrls.length > 0) {
    const text = message.text.trim().toLowerCase();
    const isDoneIntent = text === 'done' || text === 'bas' || text === 'ok' || text === 'okay' || text === 'haan' || text === 'skip';

    // If we're in instructions phase, text = instructions (unless it's "done"/"skip")
    if (session.earlyPhotoMediaId === 'awaiting_instructions') {
      if (isDoneIntent) {
        // Skip instructions
        await prisma.session.update({ where: { phoneNumber }, data: { earlyPhotoMediaId: null } });
        const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
        if (freshSession) await advanceToPayment(freshSession, user, wa, lang);
        return;
      }
      // Store as instructions and advance
      await prisma.session.update({ where: { phoneNumber }, data: { voiceInstructions: message.text.trim(), earlyPhotoMediaId: null } });
      await wa.sendText(phoneNumber, lang === 'hi' ? 'Samajh gaya! Shuru karte hain.' : 'Got it! Starting now.');
      const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
      if (freshSession) await advanceToPayment(freshSession, user, wa, lang);
      return;
    }

    // Still in photo collection phase — "done" moves to instructions prompt
    if (isDoneIntent) {
      await askForInstructions(session, wa, lang);
      return;
    }

    // Any other text while collecting photos — might be instructions sent early
    await wa.sendText(
      phoneNumber,
      lang === 'hi' ? 'Pehle photo bhejiye, phir instructions dena.' : 'Send your photo first, then instructions.',
    );
    return;
  }

  // ---- No photos yet and non-image message ----
  await wa.sendText(phoneNumber, msgUnknownMessage(lang));
}

// ---------------------------------------------------------------------------
// Called by the SessionTimeout worker when photo_timeout fires
// ---------------------------------------------------------------------------

export async function onPhotoBatchTimeout(
  phoneNumber: string,
  expectedImageCount: number,
  wa: WhatsAppClient,
): Promise<void> {
  const session = await prisma.session.findUnique({ where: { phoneNumber } });
  if (!session) return;

  // Guard: only advance if still in AWAITING_PHOTO and count hasn't grown
  if (
    session.state !== 'AWAITING_PHOTO' ||
    session.imageStorageUrls.length < expectedImageCount
  ) {
    return;
  }

  const user = await prisma.user.findUnique({ where: { phoneNumber } });
  if (!user) return;

  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  await askForInstructions(session, wa, lang);
}

// ---------------------------------------------------------------------------
// Ask for instructions after photos are collected
// ---------------------------------------------------------------------------

async function askForInstructions(
  session: Session,
  wa: WhatsAppClient,
  lang: 'hi' | 'en',
): Promise<void> {
  // Set flag so next message is treated as instructions
  await prisma.session.update({
    where: { phoneNumber: session.phoneNumber },
    data: { earlyPhotoMediaId: 'awaiting_instructions' },
  });

  await wa.sendText(
    session.phoneNumber,
    lang === 'hi'
      ? 'Kuch special instructions? Text ya voice note bhejein.\nYa "done" likhein skip karne ke liye.'
      : 'Any special instructions? Send text or voice note.\nOr type "done" to skip.',
  );
}

// ---------------------------------------------------------------------------
// Internal: advance to order creation + payment
// ---------------------------------------------------------------------------

async function advanceToPayment(
  session: Session,
  user: User,
  wa: WhatsAppClient,
  lang: 'hi' | 'en',
): Promise<void> {
  if (session.imageStorageUrls.length === 0) return;

  const styleId = session.styleSelection ?? 'style_clean_white';

  await createOrderAndSendPayment({
    session,
    user,
    lang,
    wa,
    imageStorageUrls: session.imageStorageUrls,
    imageMediaIds: session.imageMediaIds,
    imageCount: session.imageStorageUrls.length,
    styleId,
    voiceInstructions: session.voiceInstructions,
  });
}

// ---------------------------------------------------------------------------
// BullMQ: schedule auto-advance after PHOTO_BATCH_TIMEOUT_SECONDS
// ---------------------------------------------------------------------------

async function schedulePhotoTimeout(
  phoneNumber: string,
  imageCount: number,
): Promise<void> {
  const queue = getSessionTimeoutQueue();
  const jobId = `photo_timeout_${phoneNumber}`;

  try {
    const existing = await queue.getJob(jobId);
    if (existing) await existing.remove();

    await queue.add(
      'advance_photos',
      {
        phoneNumber,
        expectedState: 'AWAITING_PHOTO',
        expectedImageCount: imageCount,
        action: 'advance_photos',
      },
      {
        jobId,
        delay: PHOTO_BATCH_TIMEOUT_SECONDS * 1000,
        attempts: 1,
      },
    );
  } catch (err) {
    // Non-fatal
    logger.warn('Failed to schedule photo batch timeout', {
      phoneNumber,
      imageCount,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

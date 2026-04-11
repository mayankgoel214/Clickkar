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
import { msgPhotoReceived, msgPhotoReadyForProcessing, msgGenericError, msgUnknownMessage } from '../messages.js';
import { MAX_IMAGES_PER_ORDER, PHOTO_BATCH_TIMEOUT_SECONDS, BUTTONS_SHOWN_TIMEOUT_SECONDS } from '../types.js';
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

    // Handle "Process now" — advance immediately
    if (message.buttonReplyId === ButtonIds.PROCESS_NOW) {
      if (session.imageStorageUrls.length === 0) return;
      const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
      if (freshSession) await advanceToPayment(freshSession, user, wa, lang);
      return;
    }

    // Handle "Add instructions" — ask for text or voice, wait for response
    if (message.buttonReplyId === ButtonIds.ADD_INSTRUCTIONS) {
      await prisma.session.update({
        where: { phoneNumber },
        data: { earlyPhotoMediaId: 'awaiting_instructions' },
      });
      await wa.sendText(
        phoneNumber,
        lang === 'hi'
          ? 'Kuch special instructions? Text ya voice note bhejein.'
          : 'Any special instructions? Send text or a voice note.',
      );
      return;
    }

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
      // Fast path: in-memory session already shows we're at max — skip download.
      // The transaction below re-checks with a fresh DB read as the authoritative guard.
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

    // If image has a caption, use it as instructions (overrides any prior instructions)
    const rawCaption = message.caption?.trim();

    // Capture both values as definite strings before entering the async transaction
    // callback — TypeScript cannot narrow `let` variables or optional fields across
    // closure boundaries.
    const uploadedUrl: string = storageUrl;
    const mediaId: string = message.mediaId as string;

    // Atomically append to imageStorageUrls and imageMediaIds using a transaction
    // with a fresh read. Without this, concurrent photo bursts each read the same
    // stale array and only the last write survives.
    const updated = await prisma.$transaction(async (tx) => {
      const fresh = await tx.session.findUnique({
        where: { phoneNumber },
        select: { imageStorageUrls: true, imageMediaIds: true },
      });

      const currentUrls = (fresh?.imageStorageUrls as string[]) ?? [];
      const currentIds = (fresh?.imageMediaIds as string[]) ?? [];

      // Re-check limit inside the transaction with the freshest count.
      if (currentUrls.length >= MAX_IMAGES_PER_ORDER) {
        return null; // Already at max — caller handles this
      }

      return tx.session.update({
        where: { phoneNumber },
        data: {
          imageStorageUrls: [...currentUrls, uploadedUrl],
          imageMediaIds: [...currentIds, mediaId],
          ...(rawCaption ? { voiceInstructions: rawCaption.slice(0, 500) } : {}),
        },
      });
    });

    if (!updated) {
      // Another concurrent write already pushed us to the max — inform the user.
      await wa.sendText(
        phoneNumber,
        lang === 'hi'
          ? `Maximum ${MAX_IMAGES_PER_ORDER} photos ho gayi. Processing shuru kar raha hun!`
          : `Maximum ${MAX_IMAGES_PER_ORDER} photos reached. Starting processing!`,
      );
      return;
    }

    const newCount = (updated.imageStorageUrls as string[]).length;

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
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? process.env['WHATSAPP_ACCESS_TOKEN'] ?? '';
        if (!accessToken) {
          console.error(JSON.stringify({ event: 'missing_whatsapp_access_token' }));
          throw new Error('WHATSAPP_ACCESS_TOKEN is not configured');
        }
        const { downloadMedia } = await import('@whatsads/whatsapp');
        const { buffer, mimeType } = await downloadMedia(message.mediaId, accessToken);
        const { uploadFile: upload, Buckets: B } = await import('@whatsads/storage');
        await upload(B.VOICE_NOTES, `${phoneNumber}/${Date.now()}.ogg`, buffer, mimeType);
        const { transcribeVoiceNote } = await import('@whatsads/ai');
        const transcript = await transcribeVoiceNote(buffer, mimeType);
        if (transcript.text) {
          await prisma.session.update({ where: { phoneNumber }, data: { voiceInstructions: transcript.text.slice(0, 500), earlyPhotoMediaId: null } });
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
      // Store as instructions and advance (cap at 500 chars)
      const instructionText = message.text.trim().slice(0, 500);

      // Detect if user wants a style different from what they selected
      const wantsModel = /\b(model|person|someone|wearing|holding|using|hand|girl|boy|man|woman|ladki|ladka|insaan)\b/i.test(instructionText);
      const currentStyle = session.styleSelection ?? '';

      if (wantsModel && currentStyle !== 'style_with_model') {
        // Auto-switch to with_model style since user clearly wants a person
        await prisma.session.update({
          where: { phoneNumber },
          data: { voiceInstructions: instructionText, earlyPhotoMediaId: null, styleSelection: 'style_with_model' },
        });
        logger.info('Auto-switched to style_with_model based on instructions', { phoneNumber, instructionText });
      } else {
        await prisma.session.update({
          where: { phoneNumber },
          data: { voiceInstructions: instructionText, earlyPhotoMediaId: null },
        });
      }

      const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
      if (freshSession) await advanceToPayment(freshSession, user, wa, lang);
      return;
    }

    // Buttons were shown and user typed instead of tapping — advance
    if (session.earlyPhotoMediaId === 'awaiting_action') {
      const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
      if (freshSession) await advanceToPayment(freshSession, user, wa, lang);
      return;
    }

    // Still in photo collection phase — first "done" shows process/instructions buttons
    if (isDoneIntent) {
      await prisma.session.update({
        where: { phoneNumber },
        data: { earlyPhotoMediaId: 'awaiting_action' },
      });

      await wa.sendButtons(
        phoneNumber,
        msgPhotoReadyForProcessing(lang, session.imageStorageUrls.length),
        [
          { id: 'process_now', title: 'Process now ✅' },
          { id: 'add_instructions', title: 'Add instructions ✏️' },
        ],
      );

      // Schedule auto-advance after 30s if user doesn't tap a button
      await scheduleButtonsTimeout(phoneNumber, session.imageStorageUrls.length);
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
  // Don't confuse users with error messages right after entering this state
  // (can be triggered by delayed/racing messages from previous state)
  const stateAge = Date.now() - new Date(session.stateEnteredAt ?? session.updatedAt).getTime();
  if (stateAge < 10_000) {
    logger.info(JSON.stringify({
      event: 'suppressed_unknown_message',
      phoneNumber: session.phoneNumber,
      messageType: message.messageType,
      stateAgeMs: stateAge,
    }));
    return;
  }
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
  if (!session) {
    logger.warn('onPhotoBatchTimeout: session not found', { phoneNumber, expectedImageCount });
    return;
  }

  // Guard: only act if still in AWAITING_PHOTO and count hasn't grown
  if (session.state !== 'AWAITING_PHOTO') {
    logger.info('onPhotoBatchTimeout: session no longer in AWAITING_PHOTO — skipping', {
      phoneNumber,
      currentState: session.state,
      expectedImageCount,
    });
    return;
  }

  if (session.imageStorageUrls.length !== expectedImageCount) {
    logger.info('onPhotoBatchTimeout: image count mismatch — stale timeout, skipping', {
      phoneNumber,
      currentCount: session.imageStorageUrls.length,
      expectedImageCount,
    });
    return;
  }

  const user = await prisma.user.findUnique({ where: { phoneNumber } });
  if (!user) return;

  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';

  // Guard: order already in progress — do nothing
  if (session.earlyPhotoMediaId === 'order_creating') {
    return;
  }

  // Second timeout fires: buttons were shown but user didn't tap — auto-advance
  if (
    session.earlyPhotoMediaId === 'awaiting_action' ||
    session.earlyPhotoMediaId === 'awaiting_instructions'
  ) {
    await advanceToPayment(session, user, wa, lang);
    return;
  }

  // First timeout fires: show Process / Add-instructions buttons, schedule second timeout
  await prisma.session.update({
    where: { phoneNumber },
    data: { earlyPhotoMediaId: 'awaiting_action' },
  });

  await wa.sendButtons(
    phoneNumber,
    msgPhotoReadyForProcessing(lang, session.imageStorageUrls.length),
    [
      { id: 'process_now', title: 'Process now ✅' },
      { id: 'add_instructions', title: 'Add instructions' },
    ],
  );

  // Schedule second (30s) timeout using the same image count as the guard value
  await scheduleButtonsTimeout(phoneNumber, expectedImageCount);
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

  // Guard: if session already left AWAITING_PHOTO, don't create duplicate orders
  const fresh = await prisma.session.findUnique({ where: { phoneNumber: session.phoneNumber } });
  if (!fresh || fresh.state !== 'AWAITING_PHOTO') return;

  // Set earlyPhotoMediaId to 'order_creating' to block the 45s photo timeout
  // from calling askForInstructions() while order creation is in progress.
  // The timeout guard in onPhotoBatchTimeout checks for 'awaiting_instructions'
  // but we also need to block it during order creation.
  await prisma.session.update({
    where: { phoneNumber: session.phoneNumber },
    data: { earlyPhotoMediaId: 'order_creating' },
  });

  const styleId = fresh.styleSelection ?? 'style_clean_white';

  await createOrderAndSendPayment({
    session: fresh,
    user,
    lang,
    wa,
    imageStorageUrls: fresh.imageStorageUrls,
    imageMediaIds: fresh.imageMediaIds,
    imageCount: fresh.imageStorageUrls.length,
    styleId,
    voiceInstructions: fresh.voiceInstructions,
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
  const jobId = `photo_timeout_${phoneNumber}_${Date.now()}`;

  try {
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

/**
 * Schedule the second (post-buttons) auto-advance timeout.
 * Reuses the same worker event — the guard in onPhotoBatchTimeout will
 * detect earlyPhotoMediaId === 'awaiting_action' and advance immediately.
 */
async function scheduleButtonsTimeout(
  phoneNumber: string,
  imageCount: number,
): Promise<void> {
  const queue = getSessionTimeoutQueue();
  const jobId = `photo_buttons_timeout_${phoneNumber}_${Date.now()}`;

  try {
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
        delay: BUTTONS_SHOWN_TIMEOUT_SECONDS * 1000,
        attempts: 1,
      },
    );
  } catch (err) {
    // Non-fatal — the user can still tap the buttons
    logger.warn('Failed to schedule post-buttons timeout', {
      phoneNumber,
      imageCount,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

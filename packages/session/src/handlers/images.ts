/**
 * AWAITING_PHOTO handler — V3 multi-photo UX.
 *
 * Photos arrive AFTER setup is complete (style + optional instructions already stored).
 *
 * Rolling debounce flow (replaces old 45s timer + 30s auto-advance):
 * 1. Photo arrives -> download -> store -> schedule 8s debounce (cancel previous)
 * 2. 8s debounce fires -> send count message + buttons -> schedule 2-min nudge
 * 3. User MUST tap a button or type "done" — NO auto-advance ever
 * 4. 2-min nudge fires -> ONE gentle reminder, then silence
 *
 * At MAX_IMAGES_PER_ORDER (5): immediately create order + payment.
 * Free trial if user.orderCount === 0.
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { prisma } from '@whatsads/db';
import type { Session, User } from '@whatsads/db';
import { uploadFile, Buckets } from '@whatsads/storage';

import { msgPhotoReadyForProcessing, msgGenericError, msgUnknownMessage } from '../messages.js';
import { MAX_IMAGES_PER_ORDER, PHOTO_BATCH_TIMEOUT_SECONDS, PHOTO_NUDGE_TIMEOUT_SECONDS } from '../types.js';
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

  console.info(JSON.stringify({
    event: 'awaiting_photo_handler_start',
    phoneNumber,
    messageType: message.messageType,
    hasMediaId: !!message.mediaId,
    earlyPhotoMediaId: session.earlyPhotoMediaId,
  }));

  // Self-healing: if earlyPhotoMediaId is stuck in an invalid state for AWAITING_PHOTO, reset it
  if (session.earlyPhotoMediaId === 'order_creating') {
    console.warn(JSON.stringify({
      event: 'self_heal_stale_order_creating',
      phoneNumber,
      state: session.state
    }));
    await prisma.session.update({
      where: { phoneNumber },
      data: { earlyPhotoMediaId: null },
    });
    session.earlyPhotoMediaId = null; // update in-memory too
  }

  // ---- BUTTON REPLIES (same/new style from returning user with early photo) ----
  if (message.messageType === 'interactive' && message.buttonReplyId) {
    const { ButtonIds } = await import('../types.js');

    // Handle "Process now" — styles are already picked before photos in styles-first flow
    if (message.buttonReplyId === ButtonIds.PROCESS_NOW) {
      if (session.imageStorageUrls.length === 0) return;
      const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
      if (!freshSession) return;
      await advanceToPayment(freshSession, user, wa, lang);
      return;
    }

    // Handle "Add instructions" — styles already picked, ask for instructions then create order
    if (message.buttonReplyId === ButtonIds.ADD_INSTRUCTIONS) {
      if (session.imageStorageUrls.length === 0) return;
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
      await transitionTo(phoneNumber, 'SETUP_STYLE', {
        currentOrderId: null,
        styleSelection: null,
        styleSelections: [],
        stylePickStep: 0,
        imageMediaIds: [],
        imageStorageUrls: [],
        earlyPhotoMediaId: null,
      });
      const { sendStyleList } = await import('./onboarding.js');
      await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined, []);
      return;
    }
  }

  // ---- IMAGE MESSAGE ----
  if (message.messageType === 'image' && message.mediaId) {
    const currentCount = session.imageStorageUrls.length;

    if (currentCount >= MAX_IMAGES_PER_ORDER) {
      // Only send the "max reached" message once — use earlyPhotoMediaId as a dedup guard.
      // If it's still null, we're the first handler to notice max — set it atomically and notify.
      // If it's already set, another handler already notified — silently return.
      if (!session.earlyPhotoMediaId) {
        try {
          const updated = await prisma.session.updateMany({
            where: { phoneNumber, earlyPhotoMediaId: null },
            data: { earlyPhotoMediaId: 'awaiting_action' },
          });
          if (updated.count > 0) {
            await wa.sendText(
              phoneNumber,
              lang === 'hi'
                ? `Maximum ${MAX_IMAGES_PER_ORDER} photos ho gayi hain. Kripya "done" bolein ya button dabayein.`
                : `Maximum ${MAX_IMAGES_PER_ORDER} photos reached. Please say "done" or tap a button to proceed.`,
            );
          }
        } catch {
          // Another handler beat us — that's fine
        }
      }
      return;
    }

    // Download + upload immediately (with one retry on download failure)
    let storageUrl: string;
    try {
      let mediaResult: { buffer: Buffer; mimeType: string };

      console.info(JSON.stringify({
        event: 'photo_download_start',
        phoneNumber,
        mediaId: message.mediaId,
        currentCount,
      }));

      // Stagger concurrent downloads to avoid CDN rate limits
      const jitter = Math.floor(Math.random() * 1000);
      await new Promise(r => setTimeout(r, jitter));

      try {
        mediaResult = await downloadWhatsAppMedia(message.mediaId);
      } catch (firstErr) {
        // Retry once after 2 seconds — media URLs are valid for 5 minutes
        console.warn(JSON.stringify({ event: 'photo_download_retry', mediaId: message.mediaId }));
        await new Promise(r => setTimeout(r, 2000));
        try {
          mediaResult = await downloadWhatsAppMedia(message.mediaId);
        } catch (retryErr) {
          console.error(JSON.stringify({
            event: 'photo_download_failed_permanently',
            mediaId: message.mediaId,
            error: retryErr instanceof Error ? retryErr.message : String(retryErr),
          }));
          await wa.sendText(phoneNumber, lang === 'hi'
            ? 'Photo download nahi ho payi. Kripya dobara bhejiye.'
            : 'Couldn\'t download that photo. Please resend it.');
          return;
        }
      }

      const { buffer, mimeType } = mediaResult;
      const ext = mimeToExt(mimeType);
      const uniqueId = crypto.randomUUID().slice(0, 8);
      const path = `${phoneNumber}/${Date.now()}_${uniqueId}${ext}`;
      storageUrl = await uploadFile(Buckets.RAW_IMAGES, path, buffer, mimeType);
    } catch (err) {
      logger.error('Photo upload failed', {
        phoneNumber,
        mediaId: message.mediaId,
        error: err instanceof Error ? err.message : String(err),
      });
      await wa.sendText(phoneNumber, msgGenericError(lang));
      return;
    }

    // If image has a caption, use it as instructions (overrides any prior instructions)
    const rawCaption = message.caption?.trim();

    const uploadedUrl: string = storageUrl;
    const mediaId: string = message.mediaId as string;

    // Atomic push — Postgres array_append() under the hood; no read-modify-write race.
    const updated = await prisma.session.update({
      where: { phoneNumber: session.phoneNumber },
      data: {
        imageStorageUrls: { push: uploadedUrl },
        imageMediaIds: { push: mediaId },
        ...(rawCaption ? { voiceInstructions: rawCaption.slice(0, 500) } : {}),
      },
    });

    const actualUrls = updated.imageStorageUrls as string[];
    const newCount = actualUrls.length;

    // Guard: concurrent pushes can briefly exceed the limit — trim and bail out.
    if (newCount > MAX_IMAGES_PER_ORDER) {
      const trimmedUrls = actualUrls.slice(0, MAX_IMAGES_PER_ORDER);
      const trimmedIds = (updated.imageMediaIds as string[]).slice(0, MAX_IMAGES_PER_ORDER);
      await prisma.session.update({
        where: { phoneNumber: session.phoneNumber },
        data: { imageStorageUrls: trimmedUrls, imageMediaIds: trimmedIds },
      });
      console.info(JSON.stringify({ event: 'photo_trimmed_excess', phoneNumber: session.phoneNumber, count: newCount }));
      return;
    }

    // At max: show buttons (same as debounce) so user can add instructions
    if (newCount >= MAX_IMAGES_PER_ORDER) {
      // Use atomic guard to ensure only one handler shows buttons
      const claimed = await prisma.session.updateMany({
        where: { phoneNumber, earlyPhotoMediaId: null },
        data: { earlyPhotoMediaId: 'awaiting_action' },
      });
      if (claimed.count > 0) {
        await showPhotoButtons(phoneNumber, Math.min(newCount, MAX_IMAGES_PER_ORDER), lang, wa);
      }
      return;
    }

    // Schedule rolling 8s debounce — resets on every new photo
    await schedulePhotoBatchDebounce(phoneNumber, newCount);
    return;
  }

  // ---- VOICE NOTE: could be instructions if we have photos and already asked ----
  if (message.messageType === 'audio' && message.mediaId && session.imageStorageUrls.length > 0) {
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
          await prisma.session.update({ where: { phoneNumber }, data: { voiceInstructions: transcript.text.slice(0, 500) } });
          await wa.sendText(phoneNumber, lang === 'hi' ? `Samajh gaya: "${transcript.text}"\nShuru karte hain!` : `Got it: "${transcript.text}"\nLet's go!`);
        }
        const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
        if (freshSession) await advanceToPayment(freshSession, user, wa, lang);
        return;
      } catch (err) {
        logger.error('Voice transcription failed', { error: String(err) });
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
        await prisma.session.update({
          where: { phoneNumber },
          data: { voiceInstructions: instructionText, styleSelection: 'style_with_model' },
        });
        logger.info('Auto-switched to style_with_model based on instructions', { phoneNumber, instructionText });
      } else {
        await prisma.session.update({
          where: { phoneNumber },
          data: { voiceInstructions: instructionText },
        });
      }

      const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
      if (freshSession) await advanceToPayment(freshSession, user, wa, lang);
      return;
    }

    // Buttons were shown and user typed "done" or similar — advance to payment
    if (session.earlyPhotoMediaId === 'awaiting_action') {
      if (isDoneIntent) {
        const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
        if (freshSession) await advanceToPayment(freshSession, user, wa, lang);
        return;
      }
      // Any other text while awaiting_action — treat as instructions and advance
      const instructionText = message.text.trim().slice(0, 500);
      await prisma.session.update({
        where: { phoneNumber },
        data: { voiceInstructions: instructionText },
      });
      const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
      if (freshSession) await advanceToPayment(freshSession, user, wa, lang);
      return;
    }

    // Still in photo collection phase — "done" shows confirmation buttons (no auto-advance)
    if (isDoneIntent) {
      const imageCount = session.imageStorageUrls.length;
      await showPhotoButtons(phoneNumber, imageCount, lang, wa);
      return;
    }

    // Any other text while collecting photos — might be instructions sent early
    await wa.sendText(
      phoneNumber,
      lang === 'hi' ? 'Pehle photo bhejiye, phir instructions dena.' : 'Send your photo first, then instructions.',
    );
    return;
  }

  // ---- Text with no photos yet — guide the user ----
  if (message.messageType === 'text' && session.imageStorageUrls.length === 0) {
    await wa.sendText(phoneNumber, lang === 'hi'
      ? 'Pehle ek photo bhejein! \u{1F4F8} Phir "done" bolein.'
      : 'Send a photo first! \u{1F4F8} Then say "done".');
    return;
  }

  // ---- No photos yet and non-image message ----
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
// Called by the SessionTimeout worker when photo debounce fires
// ---------------------------------------------------------------------------

export async function onPhotoBatchTimeout(
  phoneNumber: string,
  expectedImageCount: number,
  wa: WhatsAppClient,
  action?: string,
): Promise<void> {
  const session = await prisma.session.findUnique({ where: { phoneNumber } });
  if (!session) {
    logger.warn('onPhotoBatchTimeout: session not found', { phoneNumber, expectedImageCount });
    return;
  }

  // Guard: only act if still in AWAITING_PHOTO
  if (session.state !== 'AWAITING_PHOTO') {
    logger.info('onPhotoBatchTimeout: session no longer in AWAITING_PHOTO — skipping', {
      phoneNumber,
      currentState: session.state,
      expectedImageCount,
    });
    return;
  }

  const user = await prisma.user.findUnique({ where: { phoneNumber } });
  if (!user) return;

  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const imageCount = (session.imageStorageUrls as string[]).length;

  // Self-healing for stale order_creating
  if (session.earlyPhotoMediaId === 'order_creating' && session.state === 'AWAITING_PHOTO') {
    console.warn(JSON.stringify({ event: 'self_heal_debounce_stale', phoneNumber }));
    await prisma.session.update({
      where: { phoneNumber },
      data: { earlyPhotoMediaId: null },
    });
    session.earlyPhotoMediaId = null;
    // Don't return — continue to show buttons
  }

  // ---------- NUDGE (2-min gentle reminder) ----------
  if (action === 'nudge_photo_ready') {
    if (imageCount === 0) return;

    // Stale-debounce guard: a newer nudge with a higher count will handle this
    if (expectedImageCount !== undefined && imageCount !== expectedImageCount) {
      logger.info(JSON.stringify({ event: 'nudge_stale', phoneNumber, expected: expectedImageCount, current: imageCount }));
      return;
    }

    // Don't nudge if already past the button stage
    if (session.earlyPhotoMediaId === 'awaiting_action' || session.earlyPhotoMediaId === 'order_creating') {
      return;
    }

    const nudgeMsg = lang === 'hi'
      ? `${imageCount} photos ready hain — "done" bolein ya aur photos bhejein.`
      : `${imageCount} photos ready — say "done" or send more photos.`;

    await wa.sendText(phoneNumber, nudgeMsg);
    // NO auto-advance. Just a reminder. User must act.
    return;
  }

  // ---------- SHOW BUTTONS (8s debounce or legacy advance_photos) ----------
  // Handles both 'show_photo_buttons' and legacy 'advance_photos'
  if (imageCount === 0) return;

  // Check if buttons were already shown (by a previous debounce job with same count).
  // This guard MUST run before the count check — two jobs with the same expectedImageCount
  // would both pass the count guard, causing duplicate button sends.
  if (session.earlyPhotoMediaId === 'awaiting_action' ||
      session.earlyPhotoMediaId === 'awaiting_instructions' ||
      session.earlyPhotoMediaId === 'order_creating') {
    console.info(JSON.stringify({ event: 'debounce_already_handled', phoneNumber }));
    return;
  }

  // Stale-debounce guard: only the job whose expectedImageCount matches the current
  // count should fire. Earlier debounce jobs (with lower counts) self-discard here.
  if (expectedImageCount !== undefined && imageCount !== expectedImageCount) {
    logger.info(JSON.stringify({ event: 'debounce_stale', phoneNumber, expected: expectedImageCount, current: imageCount }));
    return;
  }

  await showPhotoButtons(phoneNumber, imageCount, lang, wa);
}

// ---------------------------------------------------------------------------
// Show count + buttons helper (shared by debounce, "done", and nudge)
// ---------------------------------------------------------------------------

async function showPhotoButtons(
  phoneNumber: string,
  imageCount: number,
  lang: 'hi' | 'en',
  wa: WhatsAppClient,
): Promise<void> {
  const countMsg = lang === 'hi'
    ? `${imageCount} photo${imageCount > 1 ? 's' : ''} mil gayi \u2705`
    : `${imageCount} photo${imageCount > 1 ? 's' : ''} received \u2705`;

  try {
    await wa.sendButtons(phoneNumber, countMsg, [
      { id: 'process_now', title: lang === 'hi' ? 'Shuru karein' : 'Start' },
      { id: 'add_instructions', title: lang === 'hi' ? 'Instructions' : 'Add instructions' },
    ]);
  } catch {
    await wa.sendText(phoneNumber, `${countMsg}\n\n${lang === 'hi' ? '"done" bolein ya instructions bhejein.' : 'Say "done" or send instructions.'}`);
  }

  // Update earlyPhotoMediaId to track that buttons were shown
  await prisma.session.update({
    where: { phoneNumber },
    data: { earlyPhotoMediaId: 'awaiting_action' },
  });

  // Schedule 2-minute nudge (gentle reminder, NOT auto-advance)
  await schedulePhotoNudge(phoneNumber, imageCount);
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

  const phoneNumber = session.phoneNumber;

  // Atomic guard — only one caller can win this race.
  const claimed = await prisma.session.updateMany({
    where: {
      phoneNumber,
      state: 'AWAITING_PHOTO',
      earlyPhotoMediaId: { not: 'order_creating' },
    },
    data: {
      earlyPhotoMediaId: 'order_creating',
    },
  });

  if (claimed.count === 0) {
    console.info(JSON.stringify({ event: 'advance_to_payment_skipped', reason: 'already_claimed', phoneNumber }));
    return;
  }

  const fresh = await prisma.session.findUnique({ where: { phoneNumber } });
  if (!fresh || (fresh.imageStorageUrls as string[]).length === 0) {
    console.warn(JSON.stringify({ event: 'advance_to_payment_no_images', phoneNumber }));
    // Reset the flag so session can recover
    await prisma.session.update({ where: { phoneNumber }, data: { earlyPhotoMediaId: null } });
    return;
  }

  // V2: use all 3 selected styles; fall back to single styleSelection for legacy sessions
  const sessionStyleSelections = (fresh.styleSelections as string[]) ?? [];
  const styleSelections =
    sessionStyleSelections.length > 0
      ? sessionStyleSelections
      : [fresh.styleSelection ?? 'style_clean_white'];

  try {
    console.info(JSON.stringify({
      event: 'advance_to_payment_start',
      phoneNumber,
      imageCount: fresh.imageStorageUrls.length,
      styles: styleSelections,
      hasInstructions: !!fresh.voiceInstructions,
    }));

    await createOrderAndSendPayment({
      session: fresh,
      user,
      lang,
      wa,
      imageStorageUrls: fresh.imageStorageUrls,
      imageMediaIds: fresh.imageMediaIds,
      imageCount: fresh.imageStorageUrls.length,
      styleSelections,
      voiceInstructions: fresh.voiceInstructions,
    });

    console.info(JSON.stringify({ event: 'advance_to_payment_complete', phoneNumber }));
  } catch (err) {
    console.error(JSON.stringify({
      event: 'advance_to_payment_error',
      phoneNumber,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    }));

    // Reset earlyPhotoMediaId so the session can recover
    // (user can type "done" or tap buttons to retry)
    await prisma.session.update({
      where: { phoneNumber },
      data: { earlyPhotoMediaId: 'awaiting_action' },
    }).catch(() => {}); // don't throw on cleanup failure

    // Try to notify the user
    try {
      await wa.sendText(
        phoneNumber,
        lang === 'hi'
          ? 'Kuch problem aayi. Kripya "done" bolein ya dobara try karein.'
          : 'Something went wrong. Please say "done" to try again.',
      );
    } catch {
      // Can't even send error message — session will self-heal via debounce
    }
  }
}

// ---------------------------------------------------------------------------
// BullMQ: schedule rolling 8s debounce — unique job ID per arrival
// ---------------------------------------------------------------------------
// We intentionally do NOT try to remove/cancel prior debounce jobs.
// The remove-then-add pattern has a race window: a job can move to `active`
// between getJob() and remove(), causing the subsequent add() to fail on a
// duplicate ID error.
//
// Instead we use a unique ID per photo arrival. Multiple debounce jobs may
// exist in the queue simultaneously, but only the LAST one (whose
// expectedImageCount equals the current session count) will actually execute.
// All earlier ones self-discard via the count guard in onPhotoBatchTimeout.
// ---------------------------------------------------------------------------

async function schedulePhotoBatchDebounce(
  phoneNumber: string,
  imageCount: number,
): Promise<void> {
  try {
    const { getSessionTimeoutQueue } = await import('@whatsads/queue');
    const sessionTimeoutQueue = getSessionTimeoutQueue();

    const jobId = `photo_debounce_${phoneNumber}_${Date.now()}`;

    await sessionTimeoutQueue.add(
      'session_timeout',
      {
        phoneNumber,
        expectedState: 'AWAITING_PHOTO',
        action: 'show_photo_buttons',
        expectedImageCount: imageCount,
      },
      {
        delay: PHOTO_BATCH_TIMEOUT_SECONDS * 1000,
        jobId,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  } catch (err) {
    // Non-fatal — the session will still work; user can type "done"
    logger.warn('Failed to schedule photo batch debounce', {
      phoneNumber,
      imageCount,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// BullMQ: schedule 2-minute gentle nudge (NOT auto-advance)
// ---------------------------------------------------------------------------
// Same unique-ID strategy as schedulePhotoBatchDebounce — no cancel attempt.
// Stale nudge jobs self-discard via the count + state guard in onPhotoBatchTimeout.
// ---------------------------------------------------------------------------

async function schedulePhotoNudge(
  phoneNumber: string,
  imageCount: number,
): Promise<void> {
  try {
    const { getSessionTimeoutQueue } = await import('@whatsads/queue');
    const sessionTimeoutQueue = getSessionTimeoutQueue();

    await sessionTimeoutQueue.add(
      'session_timeout',
      {
        phoneNumber,
        expectedState: 'AWAITING_PHOTO',
        action: 'nudge_photo_ready',
        expectedImageCount: imageCount,
      },
      {
        delay: PHOTO_NUDGE_TIMEOUT_SECONDS * 1000,
        jobId: `photo_nudge_${phoneNumber}_${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  } catch (err) {
    logger.warn('Failed to schedule photo nudge', {
      phoneNumber,
      imageCount,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

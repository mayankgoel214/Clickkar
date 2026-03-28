/**
 * DELIVERED state handler.
 *
 * Called when image processing completes. Sends results to user and
 * handles feedback (love it / make a change / start over).
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { prisma } from '@whatsads/db';
import type { Session, User } from '@whatsads/db';
import { transitionTo } from '../db-helpers.js';
import {
  msgImageDelivered,
  msgAskFeedback,
  msgThankYou,
  msgAskWhatToChange,
  msgStartOver,
} from '../messages.js';
import { ButtonIds } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Send processed images to user (called by worker after processing)
// ---------------------------------------------------------------------------

export async function sendProcessedImages(
  phoneNumber: string,
  outputImageUrls: string[],
  language: 'hi' | 'en',
  userName: string | undefined,
  wa: WhatsAppClient,
): Promise<void> {
  logger.info('Delivering processed images', { phoneNumber, count: outputImageUrls.length });

  for (let i = 0; i < outputImageUrls.length; i++) {
    const url = outputImageUrls[i]!;
    const caption =
      outputImageUrls.length === 1
        ? msgImageDelivered(language, userName)
        : msgImageDelivered(language, userName, i + 1, outputImageUrls.length);

    await wa.sendImage(phoneNumber, url, caption);

    // 5-second gap between batch images for a "wow" moment
    if (i < outputImageUrls.length - 1) {
      await sleep(5000);
    }
  }

  // Small delay then ask for feedback
  await sleep(2000);
  await wa.sendButtons(phoneNumber, msgAskFeedback(language), [
    { id: ButtonIds.FEEDBACK_GREAT, title: language === 'hi' ? 'Bahut badiya!' : 'Love it!' },
    { id: ButtonIds.FEEDBACK_CHANGE, title: language === 'hi' ? 'Kuch badlao' : 'Make a change' },
    { id: ButtonIds.FEEDBACK_REDO, title: language === 'hi' ? 'Alag karo' : 'Start over' },
  ]);
}

// ---------------------------------------------------------------------------
// Handle feedback in DELIVERED state
// ---------------------------------------------------------------------------

export async function handleDelivered(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as 'hi' | 'en') || 'hi';

  // Handle button replies
  if (message.messageType === 'interactive' && message.buttonReplyId) {
    switch (message.buttonReplyId) {
      case ButtonIds.FEEDBACK_GREAT:
        await handleLoveIt(session, user, wa, lang);
        return;

      case ButtonIds.FEEDBACK_CHANGE:
        await handleMakeChange(session, user, wa, lang);
        return;

      case ButtonIds.FEEDBACK_REDO:
        await handleStartOver(session, user, wa, lang);
        return;
    }
  }

  // If user sends text or voice note in DELIVERED state, treat as edit request
  if (message.messageType === 'text' || message.messageType === 'audio') {
    await handleMakeChange(session, user, wa, lang);
    return;
  }

  // If user sends a new photo, start a new order
  if (message.messageType === 'image') {
    // Transition back to AWAITING_IMAGES — the image handler will pick it up
    await transitionTo(session.phoneNumber, 'AWAITING_IMAGES', {
      imageMediaIds: [],
      imageStorageUrls: [],
      currentOrderId: null,
      styleSelection: null,
      voiceInstructions: null,
    });
    return; // Let the main router re-dispatch this message
  }

  // Default: resend feedback buttons
  await wa.sendButtons(session.phoneNumber, msgAskFeedback(lang), [
    { id: ButtonIds.FEEDBACK_GREAT, title: lang === 'hi' ? 'Bahut badiya!' : 'Love it!' },
    { id: ButtonIds.FEEDBACK_CHANGE, title: lang === 'hi' ? 'Kuch badlao' : 'Make a change' },
    { id: ButtonIds.FEEDBACK_REDO, title: lang === 'hi' ? 'Alag karo' : 'Start over' },
  ]);
}

// ---------------------------------------------------------------------------
// Sub-handlers
// ---------------------------------------------------------------------------

async function handleLoveIt(
  session: Session,
  user: User,
  wa: WhatsAppClient,
  lang: 'hi' | 'en',
): Promise<void> {
  await wa.sendText(session.phoneNumber, msgThankYou(lang, user.name ?? undefined));

  // Update user stats
  const order = session.currentOrderId
    ? await prisma.order.findUnique({ where: { id: session.currentOrderId } })
    : null;

  if (order) {
    await prisma.user.update({
      where: { id: user.id },
      data: { totalImages: { increment: order.imageCount } },
    });
  }

  await transitionTo(session.phoneNumber, 'IDLE', {
    currentOrderId: null,
    styleSelection: null,
    voiceInstructions: null,
    imageMediaIds: [],
    imageStorageUrls: [],
  });
}

async function handleMakeChange(
  session: Session,
  _user: User,
  wa: WhatsAppClient,
  lang: 'hi' | 'en',
): Promise<void> {
  await wa.sendList(session.phoneNumber, msgAskWhatToChange(lang), lang === 'hi' ? 'Badlao chunein' : 'Pick a change', [
    {
      title: lang === 'hi' ? 'Options' : 'Options',
      rows: [
        { id: ButtonIds.EDIT_BACKGROUND, title: lang === 'hi' ? 'Background badlo' : 'Change background', description: lang === 'hi' ? 'Naya background lagayein' : 'Apply a new background' },
        { id: ButtonIds.EDIT_LIGHTING, title: lang === 'hi' ? 'Roshni adjust karein' : 'Adjust lighting', description: lang === 'hi' ? 'Bright ya dark karein' : 'Brighter or darker' },
        { id: ButtonIds.EDIT_STYLE, title: lang === 'hi' ? 'Style badlein' : 'Change style', description: lang === 'hi' ? 'Poori style badal dein' : 'Change the whole style' },
        { id: ButtonIds.EDIT_CROP, title: lang === 'hi' ? 'Product zoom' : 'Zoom product', description: lang === 'hi' ? 'Product bada dikhayein' : 'Make product bigger' },
        { id: ButtonIds.EDIT_OTHER, title: lang === 'hi' ? 'Kuch aur' : 'Something else', description: lang === 'hi' ? 'Text ya voice note bhejein' : 'Send text or voice note' },
      ],
    },
  ]);

  await transitionTo(session.phoneNumber, 'AWAITING_EDIT');
}

async function handleStartOver(
  session: Session,
  _user: User,
  wa: WhatsAppClient,
  lang: 'hi' | 'en',
): Promise<void> {
  await wa.sendButtons(session.phoneNumber, msgStartOver(lang), [
    { id: 'reuse_photo', title: lang === 'hi' ? 'Wahi photo' : 'Same photo' },
    { id: 'new_photo', title: lang === 'hi' ? 'Nayi photo' : 'New photo' },
  ]);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

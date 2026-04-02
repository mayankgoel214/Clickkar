/**
 * DELIVERED state handler — V2 streamlined flow.
 *
 * Called when image processing completes. Sends results to user and
 * handles feedback (love it / make a change / start over).
 *
 * On "Love it!":
 *   - Updates User.lastStyleUsed
 *   - Increments styleHistory JSON counter
 *   - Increments User.orderCount
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { prisma } from '@whatsads/db';
import type { Session, User } from '@whatsads/db';
import { transitionTo } from '../db-helpers.js';
import { handleAwaitingEdit } from './edit.js';
import {
  msgImageDelivered,
  msgAskFeedback,
  msgThankYou,
} from '../messages.js';
import { ButtonIds } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Send processed images to user (called by worker after processing completes)
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

  if (message.messageType === 'interactive') {
    // Handle feedback buttons
    if (message.buttonReplyId) {
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

    // Handle edit list replies (from "Make a change" menu)
    if (message.listReplyId && message.listReplyId.startsWith('edit_')) {
      await handleAwaitingEdit(session, user, message, wa);
      return;
    }
  }

  // Text or voice note in DELIVERED → treat as edit instruction
  if (message.messageType === 'text' || message.messageType === 'audio') {
    await handleAwaitingEdit(session, user, message, wa);
    return;
  }

  // New photo → start a new order
  if (message.messageType === 'image') {
    await transitionTo(session.phoneNumber, 'AWAITING_PHOTO', {
      imageMediaIds: [],
      imageStorageUrls: [],
      currentOrderId: null,
      styleSelection: null,
      voiceInstructions: null,
    });
    const { handleAwaitingPhoto } = await import('./images.js');
    const freshSession = await prisma.session.findUnique({ where: { phoneNumber: session.phoneNumber } });
    if (freshSession) {
      await handleAwaitingPhoto(freshSession, user, message, wa);
    }
    return;
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
  const isFirstOrder = user.orderCount === 0;
  await wa.sendText(session.phoneNumber, msgThankYou(lang, isFirstOrder));

  const order = session.currentOrderId
    ? await prisma.order.findUnique({ where: { id: session.currentOrderId } })
    : null;

  // Build updated style history JSON
  const currentHistory = (user.styleHistory as Record<string, number> | null) ?? {};
  const styleId = session.styleSelection ?? order?.style ?? null;
  const updatedHistory = styleId
    ? { ...currentHistory, [styleId]: (currentHistory[styleId] ?? 0) + 1 }
    : currentHistory;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      orderCount: { increment: 1 },
      totalImages: { increment: order?.imageCount ?? 0 },
      ...(styleId ? { lastStyleUsed: styleId } : {}),
      styleHistory: updatedHistory,
    },
  });

  await transitionTo(session.phoneNumber, 'IDLE', {
    currentOrderId: null,
    styleSelection: null,
    voiceInstructions: null,
    imageMediaIds: [],
    imageStorageUrls: [],
  });

  logger.info('Order completed — Love it feedback', {
    phoneNumber: session.phoneNumber,
    orderId: order?.id,
    styleId,
    newOrderCount: user.orderCount + 1,
  });
}

async function handleMakeChange(
  session: Session,
  user: User,
  wa: WhatsAppClient,
  lang: 'hi' | 'en',
): Promise<void> {
  await wa.sendList(
    session.phoneNumber,
    lang === 'hi' ? 'Kya badlana hai?' : 'What would you like to change?',
    lang === 'hi' ? 'Badlao chunein' : 'Pick a change',
    [
      {
        title: lang === 'hi' ? 'Options' : 'Options',
        rows: [
          { id: 'edit_background', title: lang === 'hi' ? 'Background badlo' : 'Change background', description: lang === 'hi' ? 'Naya background lagayein' : 'Apply a new background' },
          { id: 'edit_lighting', title: lang === 'hi' ? 'Roshni adjust karein' : 'Adjust lighting', description: lang === 'hi' ? 'Bright ya dark karein' : 'Brighter or darker' },
          { id: 'edit_style', title: lang === 'hi' ? 'Style badlein' : 'Change style', description: lang === 'hi' ? 'Poori style badal dein' : 'Change the whole style' },
          { id: 'edit_crop', title: lang === 'hi' ? 'Product zoom' : 'Zoom product', description: lang === 'hi' ? 'Product bada dikhayein' : 'Make product bigger' },
          { id: 'edit_other', title: lang === 'hi' ? 'Kuch aur' : 'Something else', description: lang === 'hi' ? 'Text ya voice note bhejein' : 'Send text or voice note' },
        ],
      },
    ],
  );

  // Stay in DELIVERED — the edit.ts handler will be called from DELIVERED
  // when user responds with their edit choice
}

async function handleStartOver(
  session: Session,
  _user: User,
  wa: WhatsAppClient,
  lang: 'hi' | 'en',
): Promise<void> {
  await wa.sendButtons(
    session.phoneNumber,
    lang === 'hi' ? 'Kaunsi photo use karein?' : 'Which photo would you like to use?',
    [
      { id: 'reuse_photo', title: lang === 'hi' ? 'Wahi photo' : 'Same photo' },
      { id: 'new_photo', title: lang === 'hi' ? 'Nayi photo' : 'New photo' },
    ],
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

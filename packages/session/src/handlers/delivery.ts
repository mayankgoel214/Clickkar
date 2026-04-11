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
  videoUrls?: string[],
): Promise<void> {
  logger.info('Delivering processed images', { phoneNumber, count: outputImageUrls.length, videoCount: videoUrls?.length ?? 0 });

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

  // Send video ads BEFORE feedback buttons
  if (videoUrls && videoUrls.length > 0) {
    await sleep(2000);
    for (const vUrl of videoUrls) {
      const videoCaption = language === 'hi'
        ? 'Bonus: Aapka product video ad!'
        : 'Bonus: Your product video ad!';
      await wa.sendVideo(phoneNumber, vUrl, videoCaption);
    }
  }

  await sleep(2000);
  await wa.sendButtons(phoneNumber, msgAskFeedback(language), [
    { id: ButtonIds.FEEDBACK_GREAT, title: language === 'hi' ? 'Bahut badiya!' : 'Love it!' },
    { id: ButtonIds.FEEDBACK_CHANGE, title: language === 'hi' ? 'Kuch badlao' : 'Make a change' },
    { id: 'try_new_style', title: language === 'hi' ? 'Naya style' : 'New style' },
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

        case 'try_new_style':
          // Keep same photo + currentOrderId — style.ts recognizes currentOrderId and reuses the photo
          await transitionTo(session.phoneNumber, 'SETUP_STYLE', {
            styleSelection: null,
            voiceInstructions: null,
          });
          {
            const { sendStyleList } = await import('./onboarding.js');
            await sendStyleList(session.phoneNumber, lang, wa, user.businessType ?? undefined);
          }
          return;

        case 'reuse_photo':
          // Keep existing photos + orderId — style.ts will auto-reprocess
          await transitionTo(session.phoneNumber, 'SETUP_STYLE', {
            styleSelection: null,
            voiceInstructions: null,
          });
          {
            const { sendStyleList } = await import('./onboarding.js');
            await sendStyleList(session.phoneNumber, lang, wa, user.businessType ?? undefined);
          }
          return;

        case 'new_photo':
          // Clear images and re-ask for style
          await transitionTo(session.phoneNumber, 'SETUP_STYLE', {
            imageMediaIds: [],
            imageStorageUrls: [],
            currentOrderId: null,
            styleSelection: null,
            voiceInstructions: null,
          });
          {
            const { sendStyleList } = await import('./onboarding.js');
            await sendStyleList(session.phoneNumber, lang, wa, user.businessType ?? undefined);
          }
          return;
      }
    }

    // Handle edit list replies (from "Make a change" menu)
    if (message.listReplyId && message.listReplyId.startsWith('edit_')) {
      await handleAwaitingEdit(session, user, message, wa);
      return;
    }
  }

  // Text or voice note in DELIVERED → check if it's a real edit instruction or just a greeting
  if (message.messageType === 'text' || message.messageType === 'audio') {
    if (message.messageType === 'text' && message.text) {
      const text = message.text.trim();
      logger.info('DELIVERED text received', { text, length: text.length, phoneNumber: session.phoneNumber });

      // Check for greeting/new-order intent first — transition to IDLE
      // so the returning-user flow handles it naturally on the next message
      const isGreeting = /^(hi|hello|hey|hii|hiii|namaste|naya|new|start|shuru|hlo|hlw)\s*$/i.test(text);
      if (isGreeting) {
        logger.info('Greeting in DELIVERED state, transitioning to IDLE', { text, phoneNumber: session.phoneNumber });
        try {
          await transitionTo(session.phoneNumber, 'IDLE');
          logger.info('Transitioned to IDLE, fetching fresh session', { phoneNumber: session.phoneNumber });
          const freshSession = await prisma.session.findUnique({ where: { phoneNumber: session.phoneNumber } });
          logger.info('Fresh session fetched', { found: !!freshSession, phoneNumber: session.phoneNumber, state: freshSession?.state, userName: user.name, lastStyleUsed: user.lastStyleUsed });
          if (freshSession) {
            const { handleIdle } = await import('./onboarding.js');
            logger.info('Calling handleIdle', { phoneNumber: session.phoneNumber });
            await handleIdle(freshSession, user, message, wa);
            logger.info('handleIdle completed successfully', { phoneNumber: session.phoneNumber });
          } else {
            logger.error('Fresh session not found after IDLE transition', { phoneNumber: session.phoneNumber });
          }
        } catch (err) {
          logger.error('Error in greeting→IDLE→handleIdle path', {
            phoneNumber: session.phoneNumber,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
          });
          throw err; // re-throw so machine.ts catch sends the error message
        }
        return;
      }

      // Short messages without edit keywords → resend feedback buttons
      const hasEditIntent = /background|color|colour|bright|dark|light|zoom|crop|style|change|badlo|roshni|bada|chhota|hatao|lagao|remove|add|make|put|move|resize/i.test(text);

      if (text.length <= 30 && !hasEditIntent) {
        logger.info('Non-edit short text in DELIVERED, resending buttons', { text });
        await wa.sendButtons(session.phoneNumber, msgAskFeedback(lang), [
          { id: ButtonIds.FEEDBACK_GREAT, title: lang === 'hi' ? 'Bahut badiya!' : 'Love it!' },
          { id: ButtonIds.FEEDBACK_CHANGE, title: lang === 'hi' ? 'Kuch badlao' : 'Make a change' },
          { id: 'try_new_style', title: lang === 'hi' ? 'Naya style' : 'New style' },
        ]);
        return;
      }
    }

    await handleAwaitingEdit(session, user, message, wa);
    return;
  }

  // New photo → start a new order, preserving the user's last style so they
  // don't silently default back to Clean White
  if (message.messageType === 'image') {
    await transitionTo(session.phoneNumber, 'AWAITING_PHOTO', {
      imageMediaIds: [],
      imageStorageUrls: [],
      currentOrderId: null,
      styleSelection: user.lastStyleUsed ?? session.styleSelection ?? null,
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
    { id: 'try_new_style', title: lang === 'hi' ? 'Naya style' : 'New style' },
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

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
  msgStyleImageDelivered,
  msgAskFeedback,
  msgThankYou,
  msgWhichAdToChange,
  styleDisplayName,
} from '../messages.js';
import { ButtonIds } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Style emoji map for 3-style output labels
// ---------------------------------------------------------------------------

const STYLE_EMOJI: Record<string, string> = {
  style_clean_white: '⬜',
  style_studio: '📸',
  style_gradient: '🎨',
  style_lifestyle: '🌿',
  style_outdoor: '🌳',
  style_festive: '🎉',
  style_with_model: '👤',
  style_clickkar_special: '✨',
};

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
  storyUrls?: string[],
  styleLabels?: string[],
): Promise<void> {
  logger.info('Delivering processed images', { phoneNumber, count: outputImageUrls.length, videoCount: videoUrls?.length ?? 0, hasStyleLabels: !!styleLabels });

  for (let i = 0; i < outputImageUrls.length; i++) {
    const url = outputImageUrls[i]!;

    let caption: string;
    if (styleLabels && styleLabels[i]) {
      const styleId = styleLabels[i]!;
      const emoji = STYLE_EMOJI[styleId] ?? '✨';
      const label = styleDisplayName(styleId, language);
      caption = msgStyleImageDelivered(language, label, emoji, i + 1, outputImageUrls.length);
    } else {
      caption =
        outputImageUrls.length === 1
          ? msgImageDelivered(language, userName)
          : msgImageDelivered(language, userName, i + 1, outputImageUrls.length);
    }

    await wa.sendImage(phoneNumber, url, caption);

    // Gap between batch images for a "wow" moment
    if (i < outputImageUrls.length - 1) {
      await sleep(1500);
    }
  }

  // Video ads disabled for now
  // if (videoUrls && videoUrls.length > 0) {
  //   await sleep(1000);
  //   for (const vUrl of videoUrls) {
  //     const videoCaption = language === 'hi'
  //       ? 'Bonus: Aapka product video ad!'
  //       : 'Bonus: Your product video ad!';
  //     await wa.sendVideo(phoneNumber, vUrl, videoCaption);
  //   }
  // }

  // Story format disabled for now
  // if (storyUrls && storyUrls.length > 0) {
  //   await sleep(1000);
  //   for (const sUrl of storyUrls) {
  //     const storyCaption = language === 'hi'
  //       ? 'Story format (9:16) — Instagram Stories & WhatsApp Status ke liye!'
  //       : 'Story format (9:16) — perfect for Instagram Stories & WhatsApp Status!';
  //     await wa.sendImage(phoneNumber, sUrl, storyCaption);
  //   }
  // }

  // Re-check that ALL jobs for this order are truly complete before showing
  // feedback buttons. This prevents showing buttons prematurely when another
  // job finishes and delivers its image AFTER the buttons were already sent.
  const session = await prisma.session.findUnique({ where: { phoneNumber } });
  const currentOrderId = session?.currentOrderId;
  if (currentOrderId) {
    const pendingJobs = await prisma.imageJob.count({
      where: {
        orderId: currentOrderId,
        status: { notIn: ['completed', 'failed'] },
      },
    });
    if (pendingJobs > 0) {
      logger.info('Skipping feedback buttons — jobs still pending', {
        phoneNumber,
        orderId: currentOrderId,
        pendingJobs,
      });
      return;
    }
  }

  await sleep(1000);
  try {
    await wa.sendButtons(phoneNumber, msgAskFeedback(language), [
      { id: ButtonIds.FEEDBACK_GREAT, title: language === 'hi' ? 'Love it! ❤️' : 'Love it! ❤️' },
      { id: ButtonIds.CHANGE_SOMETHING, title: language === 'hi' ? 'Change something' : 'Change something' },
    ]);
  } catch {
    await wa.sendText(
      phoneNumber,
      language === 'hi'
        ? `${msgAskFeedback(language)}\n\n1. Love it!\n2. Change something`
        : `${msgAskFeedback(language)}\n\n1. Love it!\n2. Change something`,
    );
  }
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
        case ButtonIds.CHANGE_SOMETHING:
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

        case ButtonIds.REDO_STYLE_0:
        case ButtonIds.REDO_STYLE_1:
        case ButtonIds.REDO_STYLE_2: {
          const styleIndexMap: Record<string, number> = {
            [ButtonIds.REDO_STYLE_0]: 0,
            [ButtonIds.REDO_STYLE_1]: 1,
            [ButtonIds.REDO_STYLE_2]: 2,
          };
          const selectedIndex = styleIndexMap[message.buttonReplyId!]!;
          // Store the selected style index as a string flag in earlyPhotoMediaId
          // so the edit handler knows which ImageJob to redo.
          await transitionTo(session.phoneNumber, 'DELIVERED', {
            earlyPhotoMediaId: `redo_style_index:${selectedIndex}`,
          });
          await handleAwaitingEdit(
            { ...session, earlyPhotoMediaId: `redo_style_index:${selectedIndex}` },
            user,
            { ...message, listReplyId: 'edit_style', buttonReplyId: undefined },
            wa,
          );
          return;
        }

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
          { id: ButtonIds.FEEDBACK_GREAT, title: 'Love it! ❤️' },
          { id: ButtonIds.CHANGE_SOMETHING, title: 'Change something' },
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
      earlyPhotoMediaId: null,
    });
    const { handleAwaitingPhoto } = await import('./images.js');
    const freshSession = await prisma.session.findUnique({ where: { phoneNumber: session.phoneNumber } });
    if (freshSession) {
      await handleAwaitingPhoto(freshSession, user, message, wa);
    }
    return;
  }

  // Default: resend feedback buttons
  try {
    await wa.sendButtons(session.phoneNumber, msgAskFeedback(lang), [
      { id: ButtonIds.FEEDBACK_GREAT, title: 'Love it! ❤️' },
      { id: ButtonIds.CHANGE_SOMETHING, title: 'Change something' },
    ]);
  } catch {
    await wa.sendText(session.phoneNumber, msgAskFeedback(lang));
  }
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
    earlyPhotoMediaId: null,
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
  _user: User,
  wa: WhatsAppClient,
  lang: 'hi' | 'en',
): Promise<void> {
  // For 3-style orders: ask which style output to change using buttons (max 3).
  // For single-style orders: show the standard edit list.
  if (session.currentOrderId) {
    const order = await prisma.order.findUnique({
      where: { id: session.currentOrderId },
      select: { stylesOrdered: true },
    });

    if (order && order.stylesOrdered.length >= 2) {
      // Build one button per style (max 3 to fit WhatsApp button limit)
      const styleButtonIds = [ButtonIds.REDO_STYLE_0, ButtonIds.REDO_STYLE_1, ButtonIds.REDO_STYLE_2] as const;
      const buttons = order.stylesOrdered.slice(0, 3).map((styleId, idx) => ({
        id: styleButtonIds[idx]!,
        title: styleDisplayName(styleId, lang).replace(/^.*?(\w[\w\s&/]+)$/, '$1').slice(0, 20),
      }));

      try {
        await wa.sendButtons(session.phoneNumber, msgWhichAdToChange(lang), buttons);
      } catch {
        // Fallback: plain text list
        const list = order.stylesOrdered
          .slice(0, 3)
          .map((id, i) => `${i + 1}. ${styleDisplayName(id, lang)}`)
          .join('\n');
        await wa.sendText(session.phoneNumber, `${msgWhichAdToChange(lang)}\n\n${list}`);
      }
      // Stay in DELIVERED — REDO_STYLE_* buttons are handled above
      return;
    }
  }

  // Single-style order: existing edit list
  try {
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
  } catch {
    await wa.sendText(
      session.phoneNumber,
      lang === 'hi'
        ? 'Kya badlana hai? Reply karein:\n1. Background\n2. Roshni\n3. Style\n4. Zoom\n5. Kuch aur'
        : 'What to change? Reply:\n1. Background\n2. Lighting\n3. Style\n4. Zoom product\n5. Something else',
    );
  }

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

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

import type { WhatsAppClient } from '@autmn/whatsapp';
import { prisma } from '@autmn/db';
import type { Session, User } from '@autmn/db';
import { transitionTo } from '../db-helpers.js';
import { handleAwaitingEdit } from './edit.js';
import {
  msgImageDelivered,
  msgStyleImageDelivered,
  msgAskFeedback,
  msgThankYou,
  msgWhichAdToChange,
  styleDisplayName,
  msgSendProductPhotos,
} from '../messages.js';
import { ButtonIds, FREE_REDOS_PER_STYLE, OUTPUT_STYLES_PER_ORDER, isHindi } from '../types.js';
import type { Language } from '../types.js';
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
  style_autmn_special: '✨',
  style_video_shoot: '🎬',
};

// ---------------------------------------------------------------------------
// Send processed images to user (called by worker after processing completes)
// ---------------------------------------------------------------------------

export async function sendProcessedImages(
  phoneNumber: string,
  outputImageUrls: string[],
  language: Language,
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

  // Fetch total ad count from the order for the menu message
  let totalAdCount = outputImageUrls.length;
  if (currentOrderId) {
    const orderForCount = await prisma.order.findUnique({
      where: { id: currentOrderId },
      select: { stylesOrdered: true, outputStyleCount: true },
    }).catch(() => null);
    const count = orderForCount?.outputStyleCount
      ?? (orderForCount?.stylesOrdered as string[] | null)?.length
      ?? outputImageUrls.length;
    if (count > 0) totalAdCount = count;
  }

  await sleep(1000);
  await wa.sendText(phoneNumber, buildPostDeliveryMenu(totalAdCount, language));
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
  const lang = (user.language as Language) || 'hinglish';
  const pendingStyle = (session as any).pendingEditStyle as string | null;

  // ── Sub-state: waiting for user to pick which ad to change ────────────────
  if (pendingStyle === '__select__') {
    await handleAdSelection(session, user, message, wa, lang);
    return;
  }

  // ── Sub-state: waiting for instruction for a specific ad ──────────────────
  if (pendingStyle && pendingStyle.startsWith('style_')) {
    await handleEditInstruction(session, user, message, wa, lang, pendingStyle);
    return;
  }

  // ── Text-reply parsing for the numbered post-delivery menu ────────────────
  if (message.messageType === 'text' && message.text) {
    const t = message.text.trim();

    if (isMenuOption1(t)) { await handleChangeRequest(session, user, wa, lang); return; }
    if (isMenuOption2(t)) { await handleOrderAnother(session, wa, lang); return; }
    if (isMenuOption3(t)) { await handleSaveAndFinish(session, user, wa, lang); return; }
  }

  // ── Interactive button handling ───────────────────────────────────────────
  if (message.messageType === 'interactive') {
    if (message.buttonReplyId) {
      switch (message.buttonReplyId) {
        case ButtonIds.FEEDBACK_GREAT:
          await handleSaveAndFinish(session, user, wa, lang);
          return;

        case ButtonIds.FEEDBACK_CHANGE:
        case ButtonIds.CHANGE_SOMETHING:
          await handleChangeRequest(session, user, wa, lang);
          return;

        case ButtonIds.FEEDBACK_REDO:
          await handleStartOver(session, user, wa, lang);
          return;

        case 'try_new_style':
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
          const styleIndex = message.buttonReplyId === ButtonIds.REDO_STYLE_0 ? 0
            : message.buttonReplyId === ButtonIds.REDO_STYLE_1 ? 1
            : 2;

          const order = session.currentOrderId
            ? await prisma.order.findUnique({ where: { id: session.currentOrderId } })
            : null;

          if (!order || !(order.stylesOrdered as string[]).length || (order.stylesOrdered as string[]).length <= styleIndex) {
            await wa.sendText(session.phoneNumber, isHindi(lang) ? 'Kuch problem aayi.' : 'Something went wrong.');
            return;
          }

          const targetStyle = (order.stylesOrdered as string[])[styleIndex]!;
          const inputImageUrl = order.primaryInputImageUrl ?? (order.inputImageUrls as string[])[0];

          if (!inputImageUrl) {
            await wa.sendText(session.phoneNumber, isHindi(lang) ? 'Photo nahi mili.' : 'Could not find the original photo.');
            return;
          }

          // Check revision limit
          const totalFreeRedos = (order.outputStyleCount || (order.stylesOrdered as string[]).length || OUTPUT_STYLES_PER_ORDER) * FREE_REDOS_PER_STYLE;
          if (order.revisionsUsed >= totalFreeRedos) {
            await wa.sendText(session.phoneNumber, isHindi(lang)
              ? 'Aapke free edits khatam ho gaye.'
              : "You've used your free edits.");
            return;
          }

          // Create a single ImageJob for the redo
          const imageJob = await prisma.imageJob.create({
            data: {
              orderId: order.id,
              inputImageUrl,
              style: targetStyle,
              styleIndex,
              pipeline: 'primary',
              status: 'queued',
            },
          });

          // Increment revision count and mark as processing
          await prisma.order.update({
            where: { id: order.id },
            data: {
              revisionsUsed: { increment: 1 },
              status: 'processing',
              processingStartedAt: new Date(),
              processingCompletedAt: null,
            },
          });

          // Enqueue the single redo job
          const { getImageQueue } = await import('@autmn/queue');
          const imageQueue = getImageQueue();
          await imageQueue.add('process_image', {
            orderId: order.id,
            imageJobId: imageJob.id,
            phoneNumber: session.phoneNumber,
            inputImageUrl,
            style: targetStyle,
            voiceInstructions: (order.voiceInstructions as string | null) ?? undefined,
            productCategory: (order.productCategory as string | null) ?? undefined,
            pipeline: 'primary',
          });

          // Transition to EDIT_PROCESSING
          await transitionTo(session.phoneNumber, 'EDIT_PROCESSING', {
            currentOrderId: order.id,
          });

          const styleName = styleDisplayName(targetStyle, lang);
          await wa.sendText(session.phoneNumber, isHindi(lang)
            ? `${styleName} dubara ban raha hai... thodi der mein ready!`
            : `Redoing your ${styleName} ad... almost ready!`);

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
          // V4: clear images and send to AWAITING_PHOTO — style picked AFTER photos
          await transitionTo(session.phoneNumber, 'AWAITING_PHOTO', {
            imageMediaIds: [],
            imageStorageUrls: [],
            currentOrderId: null,
            styleSelection: null,
            styleSelections: [],
            stylePickStep: 0,
            voiceInstructions: null,
            earlyPhotoMediaId: null,
          });
          {
            const { msgSendProductPhotos } = await import('../messages.js');
            await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
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
  lang: Language,
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
  lang: Language,
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
      isHindi(lang) ? 'Kya badlana hai?' : 'What would you like to change?',
      isHindi(lang) ? 'Badlao chunein' : 'Pick a change',
      [
        {
          title: isHindi(lang) ? 'Options' : 'Options',
          rows: [
            { id: 'edit_background', title: isHindi(lang) ? 'Background badlo' : 'Change background', description: isHindi(lang) ? 'Naya background lagayein' : 'Apply a new background' },
            { id: 'edit_lighting', title: isHindi(lang) ? 'Roshni adjust karein' : 'Adjust lighting', description: isHindi(lang) ? 'Bright ya dark karein' : 'Brighter or darker' },
            { id: 'edit_style', title: isHindi(lang) ? 'Style badlein' : 'Change style', description: isHindi(lang) ? 'Poori style badal dein' : 'Change the whole style' },
            { id: 'edit_crop', title: isHindi(lang) ? 'Product zoom' : 'Zoom product', description: isHindi(lang) ? 'Product bada dikhayein' : 'Make product bigger' },
            { id: 'edit_other', title: isHindi(lang) ? 'Kuch aur' : 'Something else', description: isHindi(lang) ? 'Text ya voice note bhejein' : 'Send text or voice note' },
          ],
        },
      ],
    );
  } catch {
    await wa.sendText(
      session.phoneNumber,
      isHindi(lang)
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
  lang: Language,
): Promise<void> {
  await wa.sendButtons(
    session.phoneNumber,
    isHindi(lang) ? 'Kaunsi photo use karein?' : 'Which photo would you like to use?',
    [
      { id: 'reuse_photo', title: isHindi(lang) ? 'Wahi photo' : 'Same photo' },
      { id: 'new_photo', title: isHindi(lang) ? 'Nayi photo' : 'New photo' },
    ],
  );
}

// ---------------------------------------------------------------------------
// Post-delivery numbered menu helpers
// ---------------------------------------------------------------------------

function buildPostDeliveryMenu(adCount: number, lang: Language): string {
  const countStr = adCount === 1 ? '1 ad' : `${adCount} ads`;
  if (lang === 'hi') {
    const countHi = adCount === 1 ? 'ये रहा आपका 1 ऐड' : `ये रहे आपके ${adCount} ऐड`;
    return `${countHi} 🎉\n\nअब क्या करना है?\n\n1 — कुछ बदलना है\n2 — दूसरे प्रोडक्ट का ऑर्डर करें\n3 — सेव करके खत्म करें`;
  }
  if (isHindi(lang)) {
    return `Yeh raha aapka ${adCount === 1 ? '1 ad' : `${adCount} ads`} 🎉\n\nKya karna chahenge? Reply karein:\n\n1 — Kuch badalna hai\n2 — Doosre product ka order\n3 — Save karke khatam`;
  }
  return `That's your ${countStr} 🎉\n\nWhat would you like to do? Reply with:\n\n1 — Change something\n2 — Order another product\n3 — Save and finish`;
}

function isMenuOption1(t: string): boolean {
  return /^(1|change|badal|kuch\s*badal|edit)\b/i.test(t);
}

function isMenuOption2(t: string): boolean {
  return /^(2|order|another|nayi?\s*order|doosra|naya)\b/i.test(t);
}

function isMenuOption3(t: string): boolean {
  return /^(3|save|finish|done|khatam|ho\s*gaya|theek)\b/i.test(t);
}

// ---------------------------------------------------------------------------
// Post-delivery menu sub-handlers
// ---------------------------------------------------------------------------

async function handleChangeRequest(
  session: Session,
  _user: User,
  wa: WhatsAppClient,
  lang: Language,
): Promise<void> {
  if (!session.currentOrderId) {
    await wa.sendText(session.phoneNumber, isHindi(lang) ? 'Koi order nahi mila.' : 'No order found.');
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: session.currentOrderId },
    select: { stylesOrdered: true },
  });

  const styles = (order?.stylesOrdered as string[] | null) ?? [];

  if (styles.length === 0) {
    await wa.sendText(session.phoneNumber, isHindi(lang) ? 'Koi ad nahi mila.' : 'No ads found for this order.');
    return;
  }

  // Single ad: skip selection, go straight to instruction
  if (styles.length === 1) {
    const styleId = styles[0]!;
    await prisma.session.update({
      where: { phoneNumber: session.phoneNumber },
      data: { pendingEditStyle: styleId } as any,
    });
    await wa.sendText(
      session.phoneNumber,
      lang === 'hi'
        ? `${styleDisplayName(styleId, lang)} ऐड में क्या बदलना है? जो पसंद नहीं आया वो बताएं, या बताएं क्या चाहिए।`
        : isHindi(lang)
        ? `${styleDisplayName(styleId, lang)} mein kya badlana chahte hain? Text ya voice note bhejein.`
        : `What would you like to change in your ${styleDisplayName(styleId, lang)} ad? Send a text or voice note.`,
    );
    return;
  }

  // Multiple ads: ask which one
  await prisma.session.update({
    where: { phoneNumber: session.phoneNumber },
    data: { pendingEditStyle: '__select__' } as any,
  });

  const list = styles.map((id, i) => `${i + 1}. ${styleDisplayName(id, lang)}`).join('\n');
  await wa.sendText(
    session.phoneNumber,
    lang === 'hi'
      ? `कौन सा ऐड फिर से बनाना है? नंबर भेजें:\n\n${list}`
      : isHindi(lang)
      ? `Kaun sa ad badalna hai? Number bhejein:\n\n${list}`
      : `Which ad would you like to change? Reply with the number:\n\n${list}`,
  );
}

async function handleAdSelection(
  session: Session,
  _user: User,
  message: MessageContext,
  wa: WhatsAppClient,
  lang: Language,
): Promise<void> {
  if (!session.currentOrderId) {
    await wa.sendText(session.phoneNumber, isHindi(lang) ? 'Koi order nahi mila.' : 'No order found.');
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: session.currentOrderId },
    select: { stylesOrdered: true },
  });

  const styles = (order?.stylesOrdered as string[] | null) ?? [];
  const parsed = parseInt((message.text ?? '').trim(), 10);

  if (!parsed || parsed < 1 || parsed > styles.length) {
    const list = styles.map((id, i) => `${i + 1}. ${styleDisplayName(id, lang)}`).join('\n');
    await wa.sendText(
      session.phoneNumber,
      isHindi(lang)
        ? `Please valid number bhejein (1–${styles.length}):\n\n${list}`
        : `Please reply with a number between 1 and ${styles.length}:\n\n${list}`,
    );
    return;
  }

  const targetStyle = styles[parsed - 1]!;

  await prisma.session.update({
    where: { phoneNumber: session.phoneNumber },
    data: { pendingEditStyle: targetStyle } as any,
  });

  await wa.sendText(
    session.phoneNumber,
    lang === 'hi'
      ? `${styleDisplayName(targetStyle, lang)} ऐड में क्या बदलना है? जो पसंद नहीं आया वो बताएं, या बताएं क्या चाहिए।`
      : isHindi(lang)
      ? `${styleDisplayName(targetStyle, lang)} mein kya badlana chahte hain? Text ya voice note bhejein.`
      : `What would you like to change in your ${styleDisplayName(targetStyle, lang)} ad? Send a text or voice note.`,
  );
}

async function handleEditInstruction(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
  lang: Language,
  styleId: string,
): Promise<void> {
  // Audio without transcription: ask user to re-send as text
  if (message.messageType === 'audio' && !message.text) {
    await wa.sendText(
      session.phoneNumber,
      isHindi(lang)
        ? 'Text mein bataiye kya badlana hai.'
        : 'Please send your change request as a text message.',
    );
    return;
  }

  const userInstruction = message.text?.trim() ?? message.caption?.trim() ?? '';

  if (!userInstruction) {
    await wa.sendText(
      session.phoneNumber,
      isHindi(lang)
        ? 'Kya badlana hai? Text mein likhein.'
        : 'What would you like to change? Please type it out.',
    );
    return;
  }

  if (!session.currentOrderId) {
    await wa.sendText(session.phoneNumber, isHindi(lang) ? 'Koi order nahi mila.' : 'No order found.');
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: session.currentOrderId } });

  if (!order) {
    await wa.sendText(session.phoneNumber, isHindi(lang) ? 'Order nahi mila.' : 'Order not found.');
    return;
  }

  const styles = order.stylesOrdered as string[];
  const styleIndex = styles.indexOf(styleId);

  if (styleIndex === -1) {
    await wa.sendText(session.phoneNumber, isHindi(lang) ? 'Style nahi mili.' : 'Style not found in order.');
    return;
  }

  const inputImageUrl = order.primaryInputImageUrl ?? (order.inputImageUrls as string[])[0];

  if (!inputImageUrl) {
    await wa.sendText(session.phoneNumber, isHindi(lang) ? 'Photo nahi mili.' : 'Could not find the original photo.');
    return;
  }

  // Check revision limit
  const totalFreeRedos = (order.outputStyleCount || styles.length || OUTPUT_STYLES_PER_ORDER) * FREE_REDOS_PER_STYLE;
  if (order.revisionsUsed >= totalFreeRedos) {
    await wa.sendText(
      session.phoneNumber,
      isHindi(lang)
        ? 'Aapke free edits khatam ho gaye. Dobaara order karein ya aage badein.'
        : "You've used your free edits. Place a new order to continue.",
    );
    await prisma.session.update({
      where: { phoneNumber: session.phoneNumber },
      data: { pendingEditStyle: null } as any,
    });
    return;
  }

  // Create ImageJob for this redo
  const imageJob = await prisma.imageJob.create({
    data: {
      orderId: order.id,
      inputImageUrl,
      style: styleId,
      styleIndex,
      pipeline: 'primary',
      status: 'queued',
    },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: {
      revisionsUsed: { increment: 1 },
      status: 'processing',
      processingStartedAt: new Date(),
      processingCompletedAt: null,
    },
  });

  // voiceInstructions = new user instruction, originalVoiceInstructions = first-gen constraints
  const { getImageQueue } = await import('@autmn/queue');
  const imageQueue = getImageQueue();
  await imageQueue.add('process_image', {
    orderId: order.id,
    imageJobId: imageJob.id,
    phoneNumber: session.phoneNumber,
    inputImageUrl,
    style: styleId,
    voiceInstructions: userInstruction,
    originalVoiceInstructions: (order.voiceInstructions as string | null) ?? undefined,
    productCategory: (order.productCategory as string | null) ?? undefined,
    brandName: (user as any).brandName ?? undefined,
    pipeline: 'primary',
  });

  // Clear pending style and transition to EDIT_PROCESSING
  await prisma.session.update({
    where: { phoneNumber: session.phoneNumber },
    data: { pendingEditStyle: null } as any,
  });

  await transitionTo(session.phoneNumber, 'EDIT_PROCESSING', {
    currentOrderId: order.id,
  });

  const styleName = styleDisplayName(styleId, lang);
  await wa.sendText(
    session.phoneNumber,
    lang === 'hi'
      ? `${styleName} ऐड फिर से बन रहा है — थोड़ी देर में तैयार हो जाएगा। ✨`
      : isHindi(lang)
      ? `${styleName} dubara ban raha hai... thodi der mein ready! ✨`
      : `Redoing your ${styleName} ad with your changes... almost ready! ✨`,
  );
}

async function handleOrderAnother(
  session: Session,
  wa: WhatsAppClient,
  lang: Language,
): Promise<void> {
  await transitionTo(session.phoneNumber, 'AWAITING_PHOTO', {
    imageMediaIds: [],
    imageStorageUrls: [],
    currentOrderId: null,
    styleSelection: null,
    styleSelections: [],
    stylePickStep: 0,
    voiceInstructions: null,
    earlyPhotoMediaId: null,
  });
  await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
}

async function handleSaveAndFinish(
  session: Session,
  user: User,
  wa: WhatsAppClient,
  lang: Language,
): Promise<void> {
  await wa.sendText(
    session.phoneNumber,
    isHindi(lang)
      ? 'Done! Aapke ads save ho gaye. Kisi bhi time message karein — hum aur ads banane ke liye ready hain. 😊'
      : 'Done. Your ads are saved. Message us anytime to make more. 😊',
  );

  const order = session.currentOrderId
    ? await prisma.order.findUnique({ where: { id: session.currentOrderId } })
    : null;

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

  logger.info('Order completed — Save and finish', {
    phoneNumber: session.phoneNumber,
    orderId: order?.id,
    styleId,
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

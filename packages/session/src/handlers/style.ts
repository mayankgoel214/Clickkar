/**
 * SETUP_STYLE handler — V3 streamlined flow.
 *
 * After style pick → straight to AWAITING_PHOTO.
 * Instructions merged into photo step (caption).
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import type { Session, User } from '@whatsads/db';
import { prisma } from '@whatsads/db';
import { getImageQueue } from '@whatsads/queue';
import { transitionTo } from '../db-helpers.js';
import { styleDisplayName, msgSendPhoto, msgRevisionLimitReached } from '../messages.js';
import { ListIds, ButtonIds, FREE_REVISIONS_PER_ORDER } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

export async function handleSetupStyle(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;

  let styleId: string | null = null;

  // List reply (normal flow)
  if (message.messageType === 'interactive' && message.listReplyId) {
    if (VALID_STYLE_IDS.has(message.listReplyId)) {
      styleId = message.listReplyId;
    }
  }

  // User typed a style name
  if (!styleId && message.messageType === 'text' && message.text) {
    styleId = resolveStyleFromText(message.text.trim().toLowerCase());
  }

  // Returning user: same/new style buttons
  if (!styleId && message.messageType === 'interactive' && message.buttonReplyId) {
    if (message.buttonReplyId === ButtonIds.SAME_STYLE && user.lastStyleUsed) {
      styleId = user.lastStyleUsed;
    }
    if (message.buttonReplyId === ButtonIds.NEW_STYLE) {
      const { sendStyleList } = await import('./onboarding.js');
      await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined);
      return;
    }
  }

  // Fallback: buttonReplyId might contain a style ID (some WhatsApp clients send list selections as button replies)
  if (!styleId && message.buttonReplyId) {
    if (VALID_STYLE_IDS.has(message.buttonReplyId)) {
      styleId = message.buttonReplyId;
    }
  }

  if (!styleId) {
    console.warn(JSON.stringify({
      event: 'style_resolution_failed',
      phoneNumber: session.phoneNumber,
      messageType: message.messageType,
      listReplyId: message.listReplyId,
      buttonReplyId: message.buttonReplyId,
      text: message.text,
    }));
    const { sendStyleList } = await import('./onboarding.js');
    await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined);
    return;
  }

  const styleName = styleDisplayName(styleId, lang);

  // Check if this is a style-change edit (currentOrderId preserved from edit.ts)
  if (session.currentOrderId) {
    const order = await prisma.order.findUnique({ where: { id: session.currentOrderId } });
    if (order && order.inputImageUrls.length > 0) {
      // Check revision limits before reprocessing
      if (order.revisionsUsed >= FREE_REVISIONS_PER_ORDER) {
        await wa.sendText(phoneNumber, msgRevisionLimitReached(lang));
        await transitionTo(phoneNumber, 'DELIVERED');
        return;
      }

      // Style-change edit: reuse existing photos, enqueue reprocessing immediately
      await wa.sendText(
        phoneNumber,
        lang === 'hi'
          ? `*${styleName}* mein bana rahe hain — bas thoda wait karein!`
          : `Reprocessing in *${styleName}* — just a moment!`,
      );

      // Increment revision count and reset order status
      await prisma.order.update({
        where: { id: order.id },
        data: {
          style: styleId,
          revisionsUsed: { increment: 1 },
          status: 'processing',
          processingStartedAt: new Date(),
          processingCompletedAt: null,
        },
      });

      // Create ImageJob record for the style change
      const editJobId = crypto.randomUUID();
      await prisma.imageJob.create({
        data: {
          id: editJobId,
          orderId: order.id,
          inputImageUrl: order.cutoutUrls[0] || order.inputImageUrls[0] || '',
          style: styleId,
          status: 'queued',
        },
      });

      // Enqueue re-processing job
      const queue = getImageQueue();
      await queue.add('process_image', {
        orderId: order.id,
        imageJobId: editJobId,
        phoneNumber: phoneNumber,
        inputImageUrl: order.cutoutUrls[0] || order.inputImageUrls[0] || '',
        style: styleId,
        productCategory: order.productCategory ?? undefined,
        pipeline: order.cutoutUrls.length > 0 ? 'fallback' : 'primary',
      });

      await transitionTo(phoneNumber, 'EDIT_PROCESSING', {
        styleSelection: styleId,
      });

      logger.info('Style-change edit: reprocessing with new style', { phoneNumber, styleId, orderId: order.id });
      return;
    }
  }

  // Normal flow: new order, ask for photo
  await transitionTo(phoneNumber, 'AWAITING_PHOTO', {
    styleSelection: styleId,
    imageMediaIds: [],
    imageStorageUrls: [],
    voiceInstructions: null,
    currentOrderId: null,
  });

  const isFirstOrder = (user.orderCount ?? 0) === 0;
  const photoPrompt = msgSendPhoto(lang, isFirstOrder);
  await wa.sendText(phoneNumber, `*${styleName}* set!\n\n${photoPrompt}`);

  logger.info('Style selected, awaiting photo', { phoneNumber, styleId });
}

// ---------------------------------------------------------------------------

const VALID_STYLE_IDS = new Set<string>(Object.values(ListIds).filter(id => id.startsWith('style_')));

function resolveStyleFromText(text: string): string | null {
  if (text.includes('white') || text.includes('safed') || text.includes('clean')) return ListIds.STYLE_CLEAN_WHITE;
  if (text.includes('lifestyle') || text.includes('life')) return ListIds.STYLE_LIFESTYLE;
  if (text.includes('gradient') || text.includes('color') || text.includes('colour')) return ListIds.STYLE_GRADIENT;
  if (text.includes('outdoor') || text.includes('bahar') || text.includes('nature')) return ListIds.STYLE_OUTDOOR;
  if (text.includes('studio') || text.includes('professional')) return ListIds.STYLE_STUDIO;
  if (text.includes('festive') || text.includes('tyohar') || text.includes('festival')) return ListIds.STYLE_FESTIVE;
  if (text.includes('minimal') || text.includes('simple')) return ListIds.STYLE_MINIMAL;
  if (text.includes('model') || text.includes('person') || text.includes('human')) return ListIds.STYLE_WITH_MODEL;
  return null;
}

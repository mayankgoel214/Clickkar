/**
 * CONFIRMING handler.
 *
 * - Builds and sends the order summary.
 * - Confirm button → create Order in DB, advance to AWAITING_PAYMENT.
 * - Change Style button → go back to AWAITING_STYLE.
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { prisma } from '@whatsads/db';
import type { Session, User } from '@whatsads/db';
import { transitionTo } from '../db-helpers.js';
import {
  msgOrderSummary,
  msgConfirmOrder,
  msgGenericError,
  styleDisplayName,
} from '../messages.js';
import { ButtonIds, PRICE_PER_IMAGE_PAISE } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';
import { sendStyleList } from './style.js';

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleConfirming(
  session: Session,
  user: User,
  message: MessageContext,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;

  const btnId = message.buttonReplyId;

  // ---- Change Style ----
  if (btnId === ButtonIds.CHANGE_STYLE) {
    await transitionTo(phoneNumber, 'AWAITING_STYLE');
    await sendStyleList(phoneNumber, lang, waClient);
    return;
  }

  // ---- Confirm OR auto-summary trigger ----
  const isConfirm =
    btnId === ButtonIds.CONFIRM_ORDER || btnId === '__auto_confirm_summary';

  if (isConfirm || message.messageType === 'interactive') {
    // Validate session has required data
    if (!session.styleSelection || session.imageStorageUrls.length === 0) {
      logger.warn('Confirm attempted with incomplete session', {
        phoneNumber,
        hasStyle: Boolean(session.styleSelection),
        imageCount: session.imageStorageUrls.length,
      });
      await waClient.sendText(phoneNumber, msgGenericError(lang));
      return;
    }

    if (isConfirm && btnId === ButtonIds.CONFIRM_ORDER) {
      // Actually create the order
      await createOrderAndAdvance(session, user, waClient);
      return;
    }

    // Show the summary (auto or first visit to CONFIRMING)
    await sendOrderSummary(session, user, waClient);
    return;
  }

  // Any other message → re-show summary
  await sendOrderSummary(session, user, waClient);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendOrderSummary(
  session: Session,
  user: User,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;
  const imageCount = session.imageStorageUrls.length;
  const style = session.styleSelection ?? 'style_clean_white';
  const totalPaise = imageCount * PRICE_PER_IMAGE_PAISE;
  const styleName = styleDisplayName(style, lang);

  const summaryText = msgOrderSummary(lang, imageCount, styleName, totalPaise);

  await waClient.sendButtons(
    phoneNumber,
    `${summaryText}\n\n${msgConfirmOrder(lang)}`,
    [
      { id: ButtonIds.CONFIRM_ORDER, title: lang === 'hi' ? 'Shuru karo ✅' : 'Confirm ✅' },
      { id: ButtonIds.CHANGE_STYLE, title: lang === 'hi' ? 'Style badlo' : 'Change Style' },
    ],
  );
}

async function createOrderAndAdvance(
  session: Session,
  user: User,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;
  const imageCount = session.imageStorageUrls.length;
  const totalPaise = imageCount * PRICE_PER_IMAGE_PAISE;

  try {
    // Create the Order in a transaction
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          phoneNumber,
          imageCount,
          style: session.styleSelection ?? 'style_clean_white',
          voiceInstructions: session.voiceInstructions,
          inputImageUrls: session.imageStorageUrls,
          status: 'payment_pending',
          amount: totalPaise,
          productCategory: user.businessType ?? 'general',
          userId: user.id,
        },
      });

      await tx.session.update({
        where: { phoneNumber },
        data: { state: 'AWAITING_PAYMENT', currentOrderId: newOrder.id, stateEnteredAt: new Date() },
      });

      return newOrder;
    });

    logger.info('Order created', { phoneNumber, orderId: order.id, amount: totalPaise });

    // Import payment handler to send the payment link
    const { handleAwaitingPayment } = await import('./payment.js');
    const freshSession = await prisma.session.findUnique({ where: { phoneNumber } });
    if (freshSession) {
      await handleAwaitingPayment(
        freshSession,
        user,
        { ...{ messageId: '', messageType: 'interactive' as const, timestamp: Date.now() }, buttonReplyId: '__send_payment_link' },
        waClient,
      );
    }
  } catch (err) {
    logger.error('Order creation failed', {
      phoneNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    await waClient.sendText(phoneNumber, msgGenericError(lang));
  }
}

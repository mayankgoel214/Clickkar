/**
 * Session state machine — V2 streamlined flow.
 *
 * States: IDLE → SETUP_NAME → SETUP_CATEGORY → SETUP_STYLE →
 *         SETUP_INSTRUCTIONS → AWAITING_PHOTO → AWAITING_PAYMENT →
 *         PROCESSING → DELIVERED → EDIT_PROCESSING
 *
 * Every incoming WhatsApp message passes through handleIncomingMessage(),
 * which looks up the session state and dispatches to the correct handler.
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { prisma } from '@whatsads/db';
import { getSession, getOrCreateUser, transitionTo } from './db-helpers.js';
import type { MessageContext } from './types.js';
import { logger } from './logger.js';

// Handlers
import {
  handleIdle,
  handleSetupLanguage,
  handleSetupName,
  handleSetupCategory,
} from './handlers/onboarding.js';
import { handleSetupStyle } from './handlers/style.js';
import { handleAwaitingPhoto } from './handlers/images.js';
import { handleAwaitingPayment } from './handlers/payment.js';
import { handleDelivered } from './handlers/delivery.js';
import { handleAwaitingEdit, handleEditProcessing } from './handlers/edit.js';
import {
  msgProcessingStuck,
  msgGenericError,
} from './messages.js';

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function handleIncomingMessage(
  phoneNumber: string,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  // 1. Idempotency check
  const existing = await prisma.processedMessage.findUnique({
    where: { messageId: message.messageId },
  });
  if (existing) {
    logger.debug('Duplicate message, skipping', { messageId: message.messageId });
    return;
  }

  // 2. Mark as processed
  await prisma.processedMessage.create({
    data: { messageId: message.messageId },
  });

  // 3. Get or create user
  const user = await getOrCreateUser(phoneNumber);

  // 4. Get or create session
  let session = await getSession(phoneNumber);
  if (!session) {
    session = await transitionTo(phoneNumber, 'IDLE', {
      userId: user.id,
      lastUserMessageAt: new Date(),
      cswExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  } else {
    await prisma.session.update({
      where: { phoneNumber },
      data: {
        lastUserMessageAt: new Date(),
        cswExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  logger.info('Routing message', {
    phoneNumber,
    state: session.state,
    messageType: message.messageType,
  });

  // 5. Route based on current state
  try {
    switch (session.state) {
      case 'IDLE':
        await handleIdle(session, user, message, wa);
        break;

      case 'SETUP_LANGUAGE':
        await handleSetupLanguage(session, user, message, wa);
        break;

      case 'SETUP_NAME':
        await handleSetupName(session, user, message, wa);
        break;

      case 'SETUP_CATEGORY':
        await handleSetupCategory(session, user, message, wa);
        break;

      case 'SETUP_STYLE':
        await handleSetupStyle(session, user, message, wa);
        break;

      case 'AWAITING_PHOTO':
        await handleAwaitingPhoto(session, user, message, wa);
        break;

      case 'AWAITING_PAYMENT':
        await handleAwaitingPayment(session, user, message, wa);
        break;

      case 'PROCESSING': {
        // Auto-recovery: if stuck for >5 minutes, reset to IDLE
        const stuckMinutes = session.stateEnteredAt
          ? (Date.now() - new Date(session.stateEnteredAt).getTime()) / 60_000
          : 0;

        if (stuckMinutes > 5) {
          await prisma.session.update({
            where: { id: session.id },
            data: { state: 'IDLE', stateEnteredAt: new Date() },
          });
          const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
          await wa.sendText(phoneNumber, msgProcessingStuck(lang));
        } else {
          const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
          await wa.sendText(
            phoneNumber,
            lang === 'hi'
              ? 'Aapki photo process ho rahi hai — bas thoda wait karein!'
              : 'Your photo is being processed — just a moment!',
          );
        }
        break;
      }

      case 'DELIVERED':
        await handleDelivered(session, user, message, wa);
        break;

      case 'EDIT_PROCESSING':
        await handleEditProcessing(session, user, message, wa);
        break;

      default:
        logger.warn('Unknown session state', { state: session.state, phoneNumber });
        await transitionTo(phoneNumber, 'IDLE');
        await handleIdle(session, user, message, wa);
    }
  } catch (err) {
    logger.error('Handler error', {
      error: String(err),
      phoneNumber,
      state: session.state,
    });

    try {
      const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
      await wa.sendText(phoneNumber, msgGenericError(lang));
    } catch {
      logger.error('Failed to send error message', { phoneNumber });
    }
  }
}

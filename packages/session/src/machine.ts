/**
 * Session state machine — the main message router.
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
import { handleIdle, handleOnboardingWelcome, handleOnboardingName, handleOnboardingCategory, handleOnboardingConsent } from './handlers/onboarding.js';
import { handleAwaitingImages } from './handlers/images.js';
import { handleAwaitingStyle } from './handlers/style.js';
import { handleAwaitingVoice } from './handlers/voice.js';
import { handleConfirming } from './handlers/confirmation.js';
import { handleAwaitingPayment } from './handlers/payment.js';
import { handleDelivered } from './handlers/delivery.js';
import { handleAwaitingEdit, handleEditProcessing } from './handlers/edit.js';

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function handleIncomingMessage(
  phoneNumber: string,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  // 1. Idempotency check — skip if already processed
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
    // Update timestamps on every message
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

      case 'ONBOARDING_WELCOME':
        await handleOnboardingWelcome(session, user, message, wa);
        break;

      case 'ONBOARDING_NAME':
        await handleOnboardingName(session, user, message, wa);
        break;

      case 'ONBOARDING_CATEGORY':
        await handleOnboardingCategory(session, user, message, wa);
        break;

      case 'ONBOARDING_CONSENT':
        await handleOnboardingConsent(session, user, message, wa);
        break;

      case 'AWAITING_IMAGES':
        await handleAwaitingImages(session, user, message, wa);
        break;

      case 'AWAITING_STYLE':
        await handleAwaitingStyle(session, user, message, wa);
        break;

      case 'AWAITING_VOICE':
        await handleAwaitingVoice(session, user, message, wa);
        break;

      case 'CONFIRMING':
        await handleConfirming(session, user, message, wa);
        break;

      case 'AWAITING_PAYMENT':
        await handleAwaitingPayment(session, user, message, wa);
        break;

      case 'PROCESSING':
        // User sent something while processing — just acknowledge
        await wa.sendText(
          phoneNumber,
          user.language === 'hi'
            ? 'Aapki photo process ho rahi hai — bas thoda wait karein!'
            : 'Your photo is being processed — just a moment!',
        );
        break;

      case 'DELIVERED':
        await handleDelivered(session, user, message, wa);
        break;

      case 'AWAITING_EDIT':
        await handleAwaitingEdit(session, user, message, wa);
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
    logger.error('Handler error', { error: String(err), phoneNumber, state: session.state });

    // Send a friendly error message
    try {
      await wa.sendText(
        phoneNumber,
        user.language === 'hi'
          ? 'Kuch gadbad ho gayi. Thodi der mein dobara try karein.'
          : 'Something went wrong. Please try again in a moment.',
      );
    } catch {
      // Can't even send error message — just log
      logger.error('Failed to send error message', { phoneNumber });
    }
  }
}

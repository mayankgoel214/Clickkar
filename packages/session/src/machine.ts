/**
 * Session state machine — V2 streamlined flow.
 *
 * States: IDLE → SETUP_NAME → SETUP_CATEGORY → SETUP_STYLE →
 *         AWAITING_PHOTO → AWAITING_PAYMENT →
 *         PROCESSING → DELIVERED → EDIT_PROCESSING
 *
 * Every incoming WhatsApp message passes through handleIncomingMessage(),
 * which looks up the session state and dispatches to the correct handler.
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import { prisma } from '@autmn/db';
import { getSession, getOrCreateUser, transitionTo, checkAndMarkProcessed } from './db-helpers.js';
import type { MessageContext, Language } from './types.js';
import { isHindi } from './types.js';
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
  msgLanguageSwitched,
  msgLanguageAlreadySet,
} from './messages.js';
import { onRevisionPaymentConfirmed } from './handlers/payment.js';

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function handleIncomingMessage(
  phoneNumber: string,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  // 1. Idempotency check — atomic create; catches P2002 unique constraint violation
  const isDuplicate = await checkAndMarkProcessed(message.messageId);
  if (isDuplicate) {
    logger.debug('Duplicate message, skipping', { messageId: message.messageId });
    return;
  }

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

  // 5-pre. Session recovery — if the user returns after a significant gap on an
  // incomplete session, send a contextual "you left off..." message before the
  // normal handler runs. The normal handler still runs immediately after, so the
  // user sees the recovery ack followed by the current-state prompt in one exchange.
  //
  // `session.lastUserMessageAt` holds the value from BEFORE the update above,
  // because getSession fetched it before the update ran. So the gap is real.
  if (!isEscapeIntent(message)) {
    const recoveryMsg = buildSessionRecoveryMessage(session, user.language as Language);
    if (recoveryMsg) {
      await wa.sendText(phoneNumber, recoveryMsg);
      logger.info('Session recovery message shown', { phoneNumber, state: session.state });
    }
  }

  // 5a. Help intent — intercept before state routing
  if (isHelpIntent(message.text)) {
    const lang = user.language as Language;
    const helpText = isHindi(lang)
      ? `🙏 *Autmn Help*\n\n📸 Product photo bhejein → AI professional ad banayega\n\n*Commands:*\n• "hi" — Naya order shuru karein\n• Photo bhejein — Ad banaye\n• Voice note — Instructions dein\n• "hindi" / "english" — Bhasha badlein\n\n*Current status:* ${session.state === 'IDLE' ? 'Ready! Photo bhejein.' : session.state === 'PROCESSING' ? 'Aapka photo process ho raha hai...' : session.state === 'DELIVERED' ? 'Photo deliver ho gaya. Edit karein ya naya bhejein.' : 'Setup chal raha hai.'}`
      : `🙏 *Autmn Help*\n\n📸 Send a product photo → AI creates a professional ad\n\n*Commands:*\n• "hi" — Start a new order\n• Send a photo — Create an ad\n• Voice note — Give instructions\n• "hindi" / "english" — Change language\n\n*Current status:* ${session.state === 'IDLE' ? 'Ready! Send a photo.' : session.state === 'PROCESSING' ? 'Your photo is being processed...' : session.state === 'DELIVERED' ? 'Photo delivered. Edit or send a new one.' : 'Setting up your preferences.'}`;
    await wa.sendText(phoneNumber, helpText);
    return;
  }

  // 5b. Language switch intent — intercept before state routing
  const langSwitch = isLanguageSwitch(message.text);
  if (langSwitch !== null) {
    const currentLang = user.language as Language;
    if (currentLang === langSwitch) {
      await wa.sendText(phoneNumber, msgLanguageAlreadySet(langSwitch));
      return;
    }

    // Update user language in DB
    await prisma.user.update({
      where: { phoneNumber },
      data: { language: langSwitch },
    });
    user.language = langSwitch; // update in-memory ref

    // Acknowledge in the NEW language
    await wa.sendText(phoneNumber, msgLanguageSwitched(langSwitch));

    // For interactive states, re-send the current prompt in new language
    const repromptStates = ['IDLE', 'SETUP_NAME', 'SETUP_CATEGORY', 'SETUP_STYLE', 'DELIVERED'];
    if (repromptStates.includes(session.state)) {
      const freshSession = await getSession(phoneNumber);
      if (freshSession) {
        switch (freshSession.state) {
          case 'IDLE':
            await handleIdle(freshSession, user, message, wa);
            break;
          case 'SETUP_NAME': {
            const namePrompt = langSwitch === 'hinglish' ? 'Aapka naam bataiye?' : "What's your name?";
            await wa.sendText(phoneNumber, namePrompt);
            break;
          }
          case 'DELIVERED':
            await handleDelivered(freshSession, user, message, wa);
            break;
          // SETUP_CATEGORY and SETUP_STYLE: acknowledgement is enough
          default:
            break;
        }
      }
    }

    logger.info('Language switched', { phoneNumber, newLang: langSwitch, state: session.state });
    return;
  }

  // 5. Route based on current state
  try {
    switch (session.state) {
      case 'IDLE':
        await handleIdle(session, user, message, wa);
        break;

      case 'SETUP_LANGUAGE': {
        if (isEscapeIntent(message)) {
          logger.info('Escape intent in SETUP_LANGUAGE — resetting to IDLE', { phoneNumber });
          await transitionTo(phoneNumber, 'IDLE', {
            currentOrderId: null, styleSelection: null, styleSelections: [],
            stylePickStep: 0, earlyPhotoMediaId: null,
          });
          const freshSession = await getSession(phoneNumber);
          if (freshSession) await handleIdle(freshSession, user, message, wa);
          break;
        }
        await handleSetupLanguage(session, user, message, wa);
        break;
      }

      case 'SETUP_NAME': {
        if (isEscapeIntent(message)) {
          logger.info('Escape intent in SETUP_NAME — resetting to IDLE', { phoneNumber });
          await transitionTo(phoneNumber, 'IDLE', {
            currentOrderId: null, styleSelection: null, styleSelections: [],
            stylePickStep: 0, earlyPhotoMediaId: null,
          });
          const freshSession = await getSession(phoneNumber);
          if (freshSession) await handleIdle(freshSession, user, message, wa);
          break;
        }
        await handleSetupName(session, user, message, wa);
        break;
      }

      case 'SETUP_CATEGORY': {
        if (isEscapeIntent(message)) {
          logger.info('Escape intent in SETUP_CATEGORY — resetting to IDLE', { phoneNumber });
          await transitionTo(phoneNumber, 'IDLE', {
            currentOrderId: null, styleSelection: null, styleSelections: [],
            stylePickStep: 0, earlyPhotoMediaId: null,
          });
          const freshSession = await getSession(phoneNumber);
          if (freshSession) await handleIdle(freshSession, user, message, wa);
          break;
        }
        await handleSetupCategory(session, user, message, wa);
        break;
      }

      case 'SETUP_STYLE': {
        // Escape hatch — user wants to start over from scratch
        if (isEscapeIntent(message)) {
          logger.info('Escape intent in SETUP_STYLE — resetting to IDLE', { phoneNumber });
          await transitionTo(phoneNumber, 'IDLE', {
            currentOrderId: null,
            styleSelection: null,
            styleSelections: [],
            stylePickStep: 0,
            voiceInstructions: null,
            imageMediaIds: [],
            imageStorageUrls: [],
            earlyPhotoMediaId: null,
          });
          const freshSession = await getSession(phoneNumber);
          if (freshSession) await handleIdle(freshSession, user, message, wa);
          break;
        }

        await handleSetupStyle(session, user, message, wa);
        break;
      }

      case 'AWAITING_PHOTO': {
        const awaitingPhotoMinutes = session.stateEnteredAt
          ? (Date.now() - new Date(session.stateEnteredAt).getTime()) / 60_000
          : 0;

        if (awaitingPhotoMinutes > 60) {
          // 1 hour timeout — user abandoned photo upload
          logger.info('AWAITING_PHOTO timeout — resetting to IDLE', { phoneNumber });
          await transitionTo(phoneNumber, 'IDLE', {
            currentOrderId: null, styleSelection: null, styleSelections: [],
            stylePickStep: 0, imageMediaIds: [], imageStorageUrls: [],
            earlyPhotoMediaId: null, voiceInstructions: null,
          });
          const freshSession = await getSession(phoneNumber);
          if (freshSession) await handleIdle(freshSession, user, message, wa);
          break;
        }

        await handleAwaitingPhoto(session, user, message, wa);
        break;
      }

      case 'AWAITING_PAYMENT': {
        // Escape hatch — let users abandon payment and restart
        if (isEscapeIntent(message)) {
          logger.info('Escape intent in AWAITING_PAYMENT — resetting to IDLE', { phoneNumber });
          await transitionTo(phoneNumber, 'IDLE', {
            currentOrderId: null,
            styleSelection: null,
            styleSelections: [],
            stylePickStep: 0,
            voiceInstructions: null,
            imageMediaIds: [],
            imageStorageUrls: [],
            earlyPhotoMediaId: null,
          });
          const freshSession = await getSession(phoneNumber);
          if (freshSession) await handleIdle(freshSession, user, message, wa);
          break;
        }

        await handleAwaitingPayment(session, user, message, wa);
        break;
      }

      case 'PROCESSING': {
        // Escape hatch — user wants to start fresh
        // NOTE: Do NOT clear currentOrderId — the worker is still running and needs it
        // to deliver results. The worker accepts IDLE as a valid source state for the
        // DELIVERED transition, so feedback buttons will still be shown when done.
        if (isEscapeIntent(message)) {
          logger.info('Escape intent in PROCESSING — resetting to IDLE (keeping currentOrderId)', { phoneNumber });
          await transitionTo(phoneNumber, 'IDLE', {
            styleSelections: [],
            stylePickStep: 0,
            imageMediaIds: [],
            imageStorageUrls: [],
            earlyPhotoMediaId: null,
          });
          const freshSession = await getSession(phoneNumber);
          if (freshSession) await handleIdle(freshSession, user, message, wa);
          break;
        }

        // Auto-recovery: if stuck for >10 minutes, reset to IDLE
        const stuckMinutes = session.stateEnteredAt
          ? (Date.now() - new Date(session.stateEnteredAt).getTime()) / 60_000
          : 0;

        if (stuckMinutes > 10) {
          await transitionTo(phoneNumber, 'IDLE', {
            currentOrderId: null,
            imageMediaIds: [],
            imageStorageUrls: [],
            earlyPhotoMediaId: null,
          });
          const lang = user.language as Language;
          await wa.sendText(phoneNumber, msgProcessingStuck(lang));
        } else {
          const lang = user.language as Language;
          await wa.sendText(
            phoneNumber,
            isHindi(lang)
              ? 'Aapki photo process ho rahi hai — bas thoda wait karein!'
              : 'Your photo is being processed — just a moment!',
          );
        }
        break;
      }

      case 'DELIVERED':
        await handleDelivered(session, user, message, wa);
        break;

      case 'EDIT_PROCESSING': {
        // Escape hatch — user wants to start fresh
        if (isEscapeIntent(message)) {
          logger.info('Escape intent in EDIT_PROCESSING — resetting to IDLE', { phoneNumber });
          await transitionTo(phoneNumber, 'IDLE', {
            currentOrderId: null,
            styleSelections: [],
            stylePickStep: 0,
            imageMediaIds: [],
            imageStorageUrls: [],
            earlyPhotoMediaId: null,
          });
          const freshSession = await getSession(phoneNumber);
          if (freshSession) await handleIdle(freshSession, user, message, wa);
          break;
        }

        // Auto-recovery: if stuck for >5 minutes, reset to DELIVERED and notify user
        const editStuckMinutes = session.stateEnteredAt
          ? (Date.now() - new Date(session.stateEnteredAt).getTime()) / 60_000
          : 0;

        if (editStuckMinutes > 5) {
          await transitionTo(phoneNumber, 'DELIVERED');
          const lang = user.language as Language;
          await wa.sendText(phoneNumber, msgProcessingStuck(lang));
        } else {
          await handleEditProcessing(session, user, message, wa);
        }
        break;
      }

      case 'AWAITING_REVISION_PAYMENT': {
        // Escape hatch — user gives up on revision payment
        if (isEscapeIntent(message)) {
          logger.info('Escape intent in AWAITING_REVISION_PAYMENT — resetting to IDLE', { phoneNumber });
          await transitionTo(phoneNumber, 'IDLE', {
            currentOrderId: null,
            styleSelection: null,
            styleSelections: [],
            stylePickStep: 0,
            pendingEditStyle: null,
            pendingEditInstructions: null,
            earlyPhotoMediaId: null,
          });
          const freshSession = await getSession(phoneNumber);
          if (freshSession) await handleIdle(freshSession, user, message, wa);
          break;
        }

        // Auto-recovery: 30 minute timeout — user abandoned revision payment, reset to DELIVERED
        const revisionPaymentStuckMinutes = session.stateEnteredAt
          ? (Date.now() - new Date(session.stateEnteredAt).getTime()) / 60_000
          : 0;

        if (revisionPaymentStuckMinutes > 30) {
          logger.info('AWAITING_REVISION_PAYMENT timeout — resetting to DELIVERED', { phoneNumber });
          await transitionTo(phoneNumber, 'DELIVERED', {
            pendingEditStyle: null,
            pendingEditInstructions: null,
          });
          const freshSession = await getSession(phoneNumber);
          if (freshSession) {
            await handleDelivered(freshSession, user, message, wa);
          }
          break;
        }

        // Remind user we are waiting for payment
        {
          const lang = user.language as Language;
          const waitMsg = isHindi(lang)
            ? 'Payment ka intezaar hai. Pay karne ke baad hum aapka edit process karenge.'
            : "Waiting for payment. We'll process your edit once payment is confirmed.";
          await wa.sendText(phoneNumber, waitMsg);
        }
        break;
      }

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
      const lang = user.language as Language;
      await wa.sendText(phoneNumber, msgGenericError(lang));
    } catch {
      logger.error('Failed to send error message', { phoneNumber });
    }
  }
}

// ---------------------------------------------------------------------------
// Session recovery — contextual "you left off..." messages
// ---------------------------------------------------------------------------

const RECOVERY_GAP_MS = 30 * 60 * 1000; // 30 minutes

type RecoveryStep =
  | 'brand_intake'
  | 'photo_upload'
  | 'style_selection'
  | 'payment'
  | 'generation'
  | 'delivery';

function mapStateToRecoveryStep(state: string): RecoveryStep | null {
  switch (state) {
    case 'SETUP_LANGUAGE':
    case 'SETUP_NAME':
    case 'SETUP_CATEGORY':
      return 'brand_intake';
    case 'SETUP_STYLE':
      return 'style_selection';
    case 'AWAITING_PHOTO':
      return 'photo_upload';
    case 'AWAITING_PAYMENT':
    case 'AWAITING_REVISION_PAYMENT':
      return 'payment';
    case 'PROCESSING':
    case 'EDIT_PROCESSING':
      return 'generation';
    case 'DELIVERED':
      return 'delivery';
    default:
      return null; // IDLE — no recovery needed
  }
}

function buildSessionRecoveryMessage(
  session: { state: string; lastUserMessageAt: Date | null; stateEnteredAt: Date | null },
  lang: Language,
): string | null {
  const step = mapStateToRecoveryStep(session.state);
  if (!step) return null;

  // Use lastUserMessageAt if available, fall back to stateEnteredAt
  const lastActivity = session.lastUserMessageAt ?? session.stateEnteredAt;
  if (!lastActivity) return null;

  const gapMs = Date.now() - new Date(lastActivity).getTime();
  if (gapMs < RECOVERY_GAP_MS) return null;

  switch (step) {
    case 'brand_intake':
      return lang === 'hi'
        ? 'आप बीच में रुक गए थे — ब्रांड सेटअप। वहीं से जारी रखना है, या नए सिरे से शुरू करें?'
        : isHindi(lang)
        ? 'Aap apna brand setup chhod ke gaye the. Wahin se shuru karein?'
        : 'You left off telling me about your brand. Want to pick up where you stopped?';
    case 'photo_upload':
      return lang === 'hi'
        ? 'आप बीच में रुक गए थे — फ़ोटो भेजना। वहीं से जारी रखना है, या नए सिरे से शुरू करें?'
        : isHindi(lang)
        ? 'Aap photo bhejne wale the. Wahin se continue karein?'
        : 'You were in the middle of sending photos. Want to continue from there?';
    case 'style_selection':
      return lang === 'hi'
        ? 'आप बीच में रुक गए थे — स्टाइल चुनना। वहीं से जारी रखना है, या नए सिरे से शुरू करें?'
        : isHindi(lang)
        ? 'Aap styles pick kar rahe the. Continue karein, ya fresh start?'
        : 'You left off picking your styles. Want to continue, or start fresh?';
    case 'payment':
      return lang === 'hi'
        ? 'आप बीच में रुक गए थे — पेमेंट। वहीं से जारी रखना है, या नए सिरे से शुरू करें?'
        : isHindi(lang)
        ? 'Aapka order ready tha par payment complete nahi hua. Wahin se continue karein?'
        : "Your order is ready but payment wasn't completed. Want to pick up from there?";
    case 'generation':
      return lang === 'hi'
        ? 'आप बीच में रुक गए थे — ऐड बनाना। वहीं से जारी रखना है, या नए सिरे से शुरू करें?'
        : isHindi(lang)
        ? 'Jab session drop hua, aapke ads generate ho rahe the. Check kar lete hain...'
        : 'Your ads were being generated when the session dropped. Let me check on that.';
    case 'delivery':
      return lang === 'hi'
        ? 'आप बीच में रुक गए थे — ऐड देखना। वहीं से जारी रखना है, या नए सिरे से शुरू करें?'
        : isHindi(lang)
        ? 'Aapke ads pehle se bhej diye gaye hain. Changes karein ya naya order?'
        : 'Your ads were already sent. Want to make changes, or start a new order?';
  }
}

// ---------------------------------------------------------------------------
// Help intent detection
// ---------------------------------------------------------------------------

function isHelpIntent(text: string | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  return /^(help|madad|sahayata|menu|\?|kaise|how)$/i.test(t);
}

// ---------------------------------------------------------------------------
// Escape intent detection — lets users break out of stuck states
// ---------------------------------------------------------------------------

function isEscapeIntent(message: MessageContext): boolean {
  if (message.messageType !== 'text' || !message.text) return false;
  const text = message.text.trim().toLowerCase();
  return /^(hi|hello|hey|hii|hiii|namaste|naya|new|start|shuru|hlo|hlw|cancel|stop|reset|restart|start over|naya karo|band karo)\s*$/.test(text);
}

// ---------------------------------------------------------------------------
// Language intent detection — lets users switch language at any point
// ---------------------------------------------------------------------------

function isLanguageSwitch(text: string | undefined): Language | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();

  // English — keyword or phrase ("reply in English", "English mein baat karo")
  if (/^(english|angrezi|अंग्रेजी|अंग्रेज़ी|change to english|english mein|bhasha english)$/.test(t)) return 'en';
  if (/\b(reply|respond|answer|talk|switch)\s+(in|to)\s+english\b/.test(t)) return 'en';
  if (/\benglish\s+mein\s+(baat|reply|respond|bol)/.test(t)) return 'en';

  // Hindi (Devanagari) — keyword or phrase ("Hindi mein baat karo", "reply in Hindi")
  if (/^(hindi|हिंदी|हिन्दी|देवनागरी|change to hindi|hindi mein|bhasha hindi)$/.test(t)) return 'hi';
  if (/\b(reply|respond|answer|talk|switch)\s+(in|to)\s+hindi\b/.test(t)) return 'hi';
  if (/\bhindi\s+mein\s+(baat|reply|respond|bol)/.test(t)) return 'hi';

  // Hinglish (Roman-script Hindi)
  if (/^(hinglish|roman hindi|hindi roman)$/.test(t)) return 'hinglish';
  // Tamil
  if (/^(tamil|தமிழ்|tamizh)$/.test(t)) return 'ta';
  // Telugu
  if (/^(telugu|తెలుగు)$/.test(t)) return 'te';
  // Bengali
  if (/^(bengali|bangla|বাংলা)$/.test(t)) return 'bn';
  // Marathi
  if (/^(marathi|मराठी)$/.test(t)) return 'mr';
  // Gujarati
  if (/^(gujarati|ગુજરાતી)$/.test(t)) return 'gu';
  // Kannada
  if (/^(kannada|ಕನ್ನಡ)$/.test(t)) return 'kn';
  // Malayalam
  if (/^(malayalam|മലയാളം)$/.test(t)) return 'ml';
  // Punjabi
  if (/^(punjabi|ਪੰਜਾਬੀ|panjabi)$/.test(t)) return 'pa';
  // Odia
  if (/^(odia|ଓଡ଼ିଆ|oriya)$/.test(t)) return 'or';

  return null;
}

/**
 * Onboarding handler.
 * Covers states: IDLE, ONBOARDING_WELCOME, ONBOARDING_NAME,
 *               ONBOARDING_CATEGORY, ONBOARDING_CONSENT
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { prisma } from '@whatsads/db';
import type { Session, User } from '@whatsads/db';
import {
  getOrCreateUser,
  transitionTo,
  updateUser,
  getLanguage,
} from '../db-helpers.js';
import {
  msgWelcome,
  msgAskLanguage,
  msgWelcomeBack,
  msgAskName,
  msgAskCategory,
  msgDpppConsent,
  msgOnboardingComplete,
  msgPhotoTipJewellery,
  msgPhotoTipFood,
  msgPhotoTipGarment,
  msgPhotoTipSkincare,
  msgPhotoTipCandle,
  msgPhotoTipBag,
  msgPhotoTipGeneral,
  msgCleanLensTip,
} from '../messages.js';
import { ButtonIds, ListIds } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// IDLE / ONBOARDING_WELCOME
// ---------------------------------------------------------------------------

/**
 * Entry point for new or returning users.
 * - Returning user with a name → send welcome back.
 * - Returning user who sent a photo directly → skip to AWAITING_IMAGES.
 * - New user → send welcome + language picker.
 */
export async function handleIdle(
  session: Session,
  user: User,
  message: MessageContext,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const isReturning = Boolean(user.name);

  // Returning user sent a photo directly — fast-path into image flow
  if (isReturning && message.messageType === 'image') {
    await transitionTo(session.phoneNumber, 'AWAITING_IMAGES', {
      imageMediaIds: [],
      imageStorageUrls: [],
      styleSelection: null,
      voiceInstructions: null,
      currentOrderId: null,
    });
    await waClient.sendText(
      session.phoneNumber,
      msgWelcomeBack(lang, user.name!),
    );
    // The image message itself will be processed by the AWAITING_IMAGES handler
    // on the same pass — but since state is now AWAITING_IMAGES the machine
    // will re-route. To avoid requiring a second message, forward to images:
    const { handleAwaitingImages } = await import('./images.js');
    await handleAwaitingImages(
      await prisma.session.findUnique({ where: { phoneNumber: session.phoneNumber } }) ?? session,
      user,
      message,
      waClient,
    );
    return;
  }

  // Returning user, no image → greet and ask if they want a new photo
  if (isReturning) {
    await transitionTo(session.phoneNumber, 'ONBOARDING_WELCOME');
    await waClient.sendButtons(
      session.phoneNumber,
      msgWelcomeBack(lang, user.name!),
      [
        { id: ButtonIds.IS_SELLER_YES, title: lang === 'hi' ? 'Haan, naya photo' : 'Yes, new photo' },
        { id: ButtonIds.IS_SELLER_NO, title: lang === 'hi' ? 'Bas dekhne aaya' : 'Just browsing' },
      ],
    );
    return;
  }

  // New user — send welcome and language picker
  await transitionTo(session.phoneNumber, 'ONBOARDING_WELCOME');
  await waClient.sendButtons(
    session.phoneNumber,
    `${msgWelcome('hi')}\n\n${msgAskLanguage('hi')}`,
    [
      { id: ButtonIds.LANG_HINDI, title: 'Hindi mein' },
      { id: ButtonIds.LANG_ENGLISH, title: 'English' },
    ],
  );
}

// ---------------------------------------------------------------------------
// ONBOARDING_WELCOME — user picks language / confirms returning intent
// ---------------------------------------------------------------------------

export async function handleOnboardingWelcome(
  session: Session,
  user: User,
  message: MessageContext,
  waClient: WhatsAppClient,
): Promise<void> {
  let lang: 'hi' | 'en' = 'hi';

  if (message.messageType === 'interactive' && message.buttonReplyId) {
    const btnId = message.buttonReplyId;

    if (btnId === ButtonIds.LANG_ENGLISH) {
      lang = 'en';
      await updateUser(session.phoneNumber, { language: 'en' });
    } else if (btnId === ButtonIds.LANG_HINDI) {
      lang = 'hi';
      await updateUser(session.phoneNumber, { language: 'hi' });
    } else if (btnId === ButtonIds.IS_SELLER_YES) {
      // Returning user wants a new photo
      lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
      await transitionTo(session.phoneNumber, 'AWAITING_IMAGES', {
        imageMediaIds: [],
        imageStorageUrls: [],
        styleSelection: null,
        voiceInstructions: null,
        currentOrderId: null,
      });
      await waClient.sendText(session.phoneNumber, msgOnboardingComplete(lang));
      return;
    } else if (btnId === ButtonIds.IS_SELLER_NO) {
      // Just browsing — stay idle, send demo message
      lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
      await transitionTo(session.phoneNumber, 'IDLE');
      await waClient.sendText(
        session.phoneNumber,
        lang === 'hi'
          ? 'Theek hai! Jab bhi ready hon, wapas aa jaana. 😊'
          : 'No problem! Come back whenever you are ready. 😊',
      );
      return;
    }
  } else {
    // User typed something unexpected — default to Hindi
    lang = await getLanguage(session.phoneNumber);
  }

  // Advance to asking for name
  await transitionTo(session.phoneNumber, 'ONBOARDING_NAME');
  await waClient.sendText(session.phoneNumber, msgAskName(lang));
}

// ---------------------------------------------------------------------------
// ONBOARDING_NAME
// ---------------------------------------------------------------------------

export async function handleOnboardingName(
  session: Session,
  user: User,
  message: MessageContext,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';

  // Accept any text as the user's name
  const rawName = message.text?.trim();
  if (!rawName || rawName.length < 1) {
    await waClient.sendText(session.phoneNumber, msgAskName(lang));
    return;
  }

  // Capitalise first letter
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  await updateUser(session.phoneNumber, { name });
  await transitionTo(session.phoneNumber, 'ONBOARDING_CATEGORY');

  // Send category list
  await waClient.sendText(
    session.phoneNumber,
    lang === 'hi' ? `Shukriya, ${name} ji! 😊` : `Thanks, ${name}! 😊`,
  );
  await sendCategoryList(session.phoneNumber, lang, waClient);
}

// ---------------------------------------------------------------------------
// ONBOARDING_CATEGORY
// ---------------------------------------------------------------------------

export async function handleOnboardingCategory(
  session: Session,
  user: User,
  message: MessageContext,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';

  if (message.messageType !== 'interactive' || !message.listReplyId) {
    // Didn't pick from list — re-send it
    await sendCategoryList(session.phoneNumber, lang, waClient);
    return;
  }

  const categoryId = message.listReplyId;
  const categoryName = categoryIdToName(categoryId);
  await updateUser(session.phoneNumber, { businessType: categoryName });
  await transitionTo(session.phoneNumber, 'ONBOARDING_CONSENT');

  // Send category-specific photo tip then the lens tip
  const tipMsg = getCategoryTip(categoryId, lang);
  await waClient.sendText(session.phoneNumber, tipMsg);
  await waClient.sendText(session.phoneNumber, msgCleanLensTip(lang));

  // Send DPDP consent with a confirm button
  await waClient.sendButtons(
    session.phoneNumber,
    msgDpppConsent(lang),
    [{ id: ButtonIds.CONSENT_OK, title: lang === 'hi' ? 'Theek hai ✅' : 'OK ✅' }],
  );
}

// ---------------------------------------------------------------------------
// ONBOARDING_CONSENT
// ---------------------------------------------------------------------------

export async function handleOnboardingConsent(
  session: Session,
  user: User,
  message: MessageContext,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';

  // Accept any reply as consent (button tap or any text)
  const tappedOk =
    message.buttonReplyId === ButtonIds.CONSENT_OK ||
    message.messageType === 'text';

  if (!tappedOk) {
    // Re-send consent prompt
    await waClient.sendButtons(
      session.phoneNumber,
      msgDpppConsent(lang),
      [{ id: ButtonIds.CONSENT_OK, title: lang === 'hi' ? 'Theek hai ✅' : 'OK ✅' }],
    );
    return;
  }

  await transitionTo(session.phoneNumber, 'AWAITING_IMAGES', {
    imageMediaIds: [],
    imageStorageUrls: [],
    styleSelection: null,
    voiceInstructions: null,
    currentOrderId: null,
  });
  await waClient.sendText(session.phoneNumber, msgOnboardingComplete(lang));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendCategoryList(
  phoneNumber: string,
  lang: 'hi' | 'en',
  waClient: WhatsAppClient,
): Promise<void> {
  await waClient.sendList(
    phoneNumber,
    msgAskCategory(lang),
    lang === 'hi' ? 'Category chuniye' : 'Choose Category',
    [
      {
        title: lang === 'hi' ? 'Product type' : 'Product Type',
        rows: [
          { id: ListIds.CAT_JEWELLERY, title: lang === 'hi' ? 'Jewellery / Zewar' : 'Jewellery', description: lang === 'hi' ? 'Rings, necklaces, earrings...' : 'Rings, necklaces, earrings...' },
          { id: ListIds.CAT_FOOD, title: lang === 'hi' ? 'Khaana / Food' : 'Food', description: lang === 'hi' ? 'Packaged food, sweets, snacks...' : 'Packaged food, sweets, snacks...' },
          { id: ListIds.CAT_GARMENT, title: lang === 'hi' ? 'Kapde / Garments' : 'Garments', description: lang === 'hi' ? 'Sarees, kurtas, shirts...' : 'Sarees, kurtas, shirts...' },
          { id: ListIds.CAT_SKINCARE, title: lang === 'hi' ? 'Skincare / Beauty' : 'Skincare / Beauty', description: lang === 'hi' ? 'Creams, serums, cosmetics...' : 'Creams, serums, cosmetics...' },
          { id: ListIds.CAT_CANDLE, title: lang === 'hi' ? 'Candle / Home Decor' : 'Candle / Home Decor', description: lang === 'hi' ? 'Candles, diffusers, decor...' : 'Candles, diffusers, decor...' },
          { id: ListIds.CAT_BAG, title: lang === 'hi' ? 'Bag / Purse' : 'Bag / Purse', description: lang === 'hi' ? 'Handbags, wallets, clutches...' : 'Handbags, wallets, clutches...' },
          { id: ListIds.CAT_GENERAL, title: lang === 'hi' ? 'Kuch Aur / Other' : 'Other', description: lang === 'hi' ? 'Electronics, toys, etc...' : 'Electronics, toys, etc...' },
        ],
      },
    ],
  );
}

function getCategoryTip(categoryId: string, lang: 'hi' | 'en'): string {
  switch (categoryId) {
    case ListIds.CAT_JEWELLERY: return msgPhotoTipJewellery(lang);
    case ListIds.CAT_FOOD: return msgPhotoTipFood(lang);
    case ListIds.CAT_GARMENT: return msgPhotoTipGarment(lang);
    case ListIds.CAT_SKINCARE: return msgPhotoTipSkincare(lang);
    case ListIds.CAT_CANDLE: return msgPhotoTipCandle(lang);
    case ListIds.CAT_BAG: return msgPhotoTipBag(lang);
    default: return msgPhotoTipGeneral(lang);
  }
}

function categoryIdToName(categoryId: string): string {
  const map: Record<string, string> = {
    cat_jewellery: 'jewellery',
    cat_food: 'food',
    cat_garment: 'garment',
    cat_skincare: 'skincare',
    cat_candle: 'candle',
    cat_bag: 'bag',
    cat_general: 'general',
  };
  return map[categoryId] ?? 'general';
}

export { logger };

/**
 * Onboarding handlers — V3 streamlined flow.
 *
 * New users: IDLE → SETUP_LANGUAGE → SETUP_NAME → SETUP_CATEGORY → SETUP_STYLE → AWAITING_PHOTO
 * Returning users: IDLE → (confirm style) → AWAITING_PHOTO
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import type { Session, User } from '@whatsads/db';
import { prisma } from '@whatsads/db';
import { uploadFile, Buckets } from '@whatsads/storage';
import { transitionTo, updateUser } from '../db-helpers.js';
import { downloadWhatsAppMedia, mimeToExt } from './instructions.js';
import {
  msgAskStyle,
  styleDisplayName,
} from '../messages.js';
import { ListIds, ButtonIds, CATEGORY_STYLE_RECOMMENDATION } from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// IDLE — entry point
// ---------------------------------------------------------------------------

export async function handleIdle(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const isReturning = Boolean(user.name);

  logger.info('handleIdle called', { phoneNumber: session.phoneNumber, isReturning, lastStyleUsed: user.lastStyleUsed, lang });

  if (isReturning) {
    // --- Returning user with saved style: confirm ---
    if (user.lastStyleUsed) {
      const styleName = styleDisplayName(user.lastStyleUsed, lang);

      // If they sent a photo directly, download + upload immediately, then ask style
      if (message.messageType === 'image' && message.mediaId) {
        let storageUrl: string | null = null;
        try {
          const { buffer, mimeType } = await downloadWhatsAppMedia(message.mediaId);
          const ext = mimeToExt(mimeType);
          const path = `${session.phoneNumber}/${Date.now()}_0${ext}`;
          storageUrl = await uploadFile(Buckets.RAW_IMAGES, path, buffer, mimeType);
        } catch (err) {
          logger.error('Failed to download/upload early photo in IDLE', {
            phoneNumber: session.phoneNumber,
            mediaId: message.mediaId,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        await prisma.session.update({
          where: { phoneNumber: session.phoneNumber },
          data: {
            state: 'AWAITING_PHOTO',
            stateEnteredAt: new Date(),
            imageMediaIds: storageUrl ? [message.mediaId] : [],
            imageStorageUrls: storageUrl ? [storageUrl] : [],
            earlyPhotoMediaId: null,
            styleSelection: null,
            voiceInstructions: message.caption?.trim() || null,
            currentOrderId: null,
          },
        });
        try {
          await wa.sendButtons(
            session.phoneNumber,
            lang === 'hi'
              ? `Photo mil gayi, ${user.name} ji!\n${styleName} style lagayein?`
              : `Got your photo, ${user.name}!\nUse ${styleName} style?`,
            [
              { id: ButtonIds.SAME_STYLE, title: lang === 'hi' ? 'Haan' : 'Yes' },
              { id: ButtonIds.NEW_STYLE, title: lang === 'hi' ? 'Naya style' : 'New style' },
            ],
          );
        } catch (btnErr) {
          logger.error('sendButtons failed in handleIdle (photo path), falling back to sendText', { phoneNumber: session.phoneNumber, error: String(btnErr) });
          await wa.sendText(session.phoneNumber, lang === 'hi'
            ? `Photo mil gayi, ${user.name} ji! Kaunsa style: "${styleName}" ya naya?`
            : `Got your photo, ${user.name}! Use "${styleName}" style or pick a new one?`);
        }
        return;
      }

      // Text message: show style confirmation
      logger.info('Sending returning-user style confirmation buttons', { phoneNumber: session.phoneNumber, styleName });
      try {
        await wa.sendButtons(
          session.phoneNumber,
          lang === 'hi'
            ? `${user.name} ji! Photo bhejiye — ${styleName} mein banayenge.\nStyle badlana hai?`
            : `${user.name}! Send your photo — we'll use ${styleName}.\nWant a different style?`,
          [
            { id: ButtonIds.SAME_STYLE, title: lang === 'hi' ? 'Haan, wahi' : 'Yes, same' },
            { id: ButtonIds.NEW_STYLE, title: lang === 'hi' ? 'Naya style' : 'New style' },
          ],
        );
        logger.info('sendButtons succeeded', { phoneNumber: session.phoneNumber });
      } catch (btnErr) {
        logger.error('sendButtons failed in handleIdle, falling back to sendText', { phoneNumber: session.phoneNumber, error: String(btnErr) });
        // Fallback: plain text works when interactive messages fail
        await wa.sendText(
          session.phoneNumber,
          lang === 'hi'
            ? `Wapas aao, ${user.name} ji! Photo bhejiye, "${styleName}" mein banayenge.`
            : `Welcome back, ${user.name}! Send your product photo — we'll use "${styleName}".`,
        );
      }
      return;
    }

    // --- Returning user without saved style: go to style picker ---
    logger.info('Returning user — no lastStyleUsed, sending style picker', { phoneNumber: session.phoneNumber });
    try {
      await wa.sendText(
        session.phoneNumber,
        lang === 'hi' ? `Wapas aao, ${user.name} ji!` : `Welcome back, ${user.name}!`,
      );
    } catch (txtErr) {
      logger.error('sendText failed for welcome back message', { phoneNumber: session.phoneNumber, error: String(txtErr) });
    }
    await transitionTo(session.phoneNumber, 'SETUP_STYLE', {
      imageMediaIds: [],
      imageStorageUrls: [],
      styleSelection: null,
      voiceInstructions: null,
      currentOrderId: null,
    });
    try {
      await sendStyleList(session.phoneNumber, lang, wa, user.businessType ?? undefined);
    } catch (listErr) {
      logger.error('sendStyleList failed in handleIdle, falling back to sendText', { phoneNumber: session.phoneNumber, error: String(listErr) });
      await wa.sendText(session.phoneNumber, lang === 'hi'
        ? 'Kaunsa style chahiye? Clean White, Lifestyle, Gradient, Outdoor, Studio, Festive, Minimal, ya Model ke saath?'
        : 'Which style? Clean White, Lifestyle, Gradient, Outdoor, Studio, Festive, Minimal, or With Model?');
    }
    return;
  }

  // --- New user: welcome + language picker ---
  await transitionTo(session.phoneNumber, 'SETUP_LANGUAGE');
  try {
    await wa.sendButtons(
      session.phoneNumber,
      'Namaste! Welcome to Clickkar.\nKaunsi bhasha? Which language?',
      [
        { id: ButtonIds.LANG_HINDI, title: 'Hindi' },
        { id: ButtonIds.LANG_ENGLISH, title: 'English' },
      ],
    );
  } catch (btnErr) {
    logger.error('sendButtons failed for new user language picker, falling back to sendText', { phoneNumber: session.phoneNumber, error: String(btnErr) });
    await wa.sendText(session.phoneNumber, 'Namaste! Welcome to Clickkar.\nReply "Hindi" or "English" to continue.');
  }
}

// ---------------------------------------------------------------------------
// SETUP_LANGUAGE — user picks Hindi or English
// ---------------------------------------------------------------------------

export async function handleSetupLanguage(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  let lang: 'hi' | 'en' = 'en';

  if (message.messageType === 'interactive' && message.buttonReplyId) {
    lang = message.buttonReplyId === ButtonIds.LANG_HINDI ? 'hi' : 'en';
  } else if (message.messageType === 'text' && message.text) {
    const text = message.text.toLowerCase().trim() ?? '';
    const isHindi = text === 'hindi' || text === '1' || text === 'हिंदी' || text === 'हिन्दी' ||
                    text.includes('hindi') || text.includes('हिं');
    lang = isHindi ? 'hi' : 'en';
  }

  await updateUser(session.phoneNumber, { language: lang });
  await transitionTo(session.phoneNumber, 'SETUP_NAME');
  await wa.sendText(
    session.phoneNumber,
    lang === 'hi' ? 'Aapka naam bataiye?' : "What's your name?",
  );
}

// ---------------------------------------------------------------------------
// SETUP_NAME — user types their name
// ---------------------------------------------------------------------------

export async function handleSetupName(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const rawName = message.text?.trim();

  if (!rawName || rawName.length < 1) {
    await wa.sendText(
      session.phoneNumber,
      lang === 'hi' ? 'Naam likh ke bhejiye.' : 'Please type your name.',
    );
    return;
  }

  // Sanitize: strip non-printable characters, truncate to 50 chars
  // eslint-disable-next-line no-control-regex
  const sanitized = rawName.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 50);
  const name = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
  await updateUser(session.phoneNumber, { name });

  // Go straight to category — no filler message
  await transitionTo(session.phoneNumber, 'SETUP_CATEGORY');
  await sendCategoryList(session.phoneNumber, lang, wa, name);
}

// ---------------------------------------------------------------------------
// SETUP_CATEGORY — user picks category, style list appears immediately
// ---------------------------------------------------------------------------

export async function handleSetupCategory(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';

  if (message.messageType !== 'interactive' || !message.listReplyId) {
    await sendCategoryList(session.phoneNumber, lang, wa, user.name ?? undefined);
    return;
  }

  const categoryId = message.listReplyId;
  if (!VALID_CATEGORY_IDS.has(categoryId)) {
    await sendCategoryList(session.phoneNumber, lang, wa, user.name ?? undefined);
    return;
  }

  await updateUser(session.phoneNumber, { businessType: categoryId });

  // INSTANT: transition to style and send style list — no filler message
  await transitionTo(session.phoneNumber, 'SETUP_STYLE');
  await sendStyleList(session.phoneNumber, lang, wa, categoryId);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export async function sendCategoryList(
  phoneNumber: string,
  lang: 'hi' | 'en',
  wa: WhatsAppClient,
  name?: string,
): Promise<void> {
  const greeting = name
    ? (lang === 'hi' ? `Shukriya, ${name} ji! Aap kaunsa product bechte hain?` : `Thanks, ${name}! What kind of product do you sell?`)
    : (lang === 'hi' ? 'Aap kaunsa product bechte hain?' : 'What kind of product do you sell?');

  await wa.sendList(
    phoneNumber,
    greeting,
    lang === 'hi' ? 'Chuniye' : 'Choose',
    [
      {
        title: lang === 'hi' ? 'Product type' : 'Product Type',
        rows: [
          { id: ListIds.CAT_JEWELLERY, title: lang === 'hi' ? 'Jewellery / Zewar' : 'Jewellery', description: 'Rings, necklaces, earrings...' },
          { id: ListIds.CAT_FOOD, title: lang === 'hi' ? 'Khaana / Food' : 'Food', description: 'Packaged food, sweets, snacks...' },
          { id: ListIds.CAT_GARMENT, title: lang === 'hi' ? 'Kapde / Garments' : 'Garments', description: 'Sarees, kurtas, shirts...' },
          { id: ListIds.CAT_SKINCARE, title: 'Skincare / Beauty', description: 'Creams, serums, cosmetics...' },
          { id: ListIds.CAT_CANDLE, title: 'Candle / Home Decor', description: 'Candles, diffusers, decor...' },
          { id: ListIds.CAT_BAG, title: 'Bag / Purse', description: 'Handbags, wallets, clutches...' },
          { id: ListIds.CAT_GENERAL, title: lang === 'hi' ? 'Kuch Aur' : 'Other', description: 'Electronics, toys, etc...' },
        ],
      },
    ],
  );
}

export async function sendStyleList(
  phoneNumber: string,
  lang: 'hi' | 'en',
  wa: WhatsAppClient,
  categoryId?: string,
): Promise<void> {
  const recStyleId = categoryId ? (CATEGORY_STYLE_RECOMMENDATION[categoryId] ?? null) : null;

  const makeDesc = (id: string, desc: string) => {
    return id === recStyleId ? `${desc} -- Recommended` : desc;
  };

  await wa.sendList(
    phoneNumber,
    lang === 'hi' ? 'Kaunsa style chahiye?' : 'Which style would you like?',
    lang === 'hi' ? 'Chuniye' : 'Choose',
    [
      {
        title: 'Styles',
        rows: [
          {
            id: ListIds.STYLE_SMART,
            title: '✨ Smart Style',
            description: lang === 'hi' ? 'AI aapke product ke liye best style chunega' : 'AI picks the best style for your product',
          },
          { id: ListIds.STYLE_CLEAN_WHITE, title: styleDisplayName(ListIds.STYLE_CLEAN_WHITE, lang), description: makeDesc(ListIds.STYLE_CLEAN_WHITE, 'Pure white background') },
          { id: ListIds.STYLE_LIFESTYLE, title: styleDisplayName(ListIds.STYLE_LIFESTYLE, lang), description: makeDesc(ListIds.STYLE_LIFESTYLE, 'Real-life setting') },
          { id: ListIds.STYLE_GRADIENT, title: styleDisplayName(ListIds.STYLE_GRADIENT, lang), description: makeDesc(ListIds.STYLE_GRADIENT, 'Cinematic dark & dramatic') },
          { id: ListIds.STYLE_OUTDOOR, title: styleDisplayName(ListIds.STYLE_OUTDOOR, lang), description: makeDesc(ListIds.STYLE_OUTDOOR, 'Natural outdoor scene') },
          { id: ListIds.STYLE_STUDIO, title: styleDisplayName(ListIds.STYLE_STUDIO, lang), description: makeDesc(ListIds.STYLE_STUDIO, 'Colored backdrop studio') },
          { id: ListIds.STYLE_FESTIVE, title: styleDisplayName(ListIds.STYLE_FESTIVE, lang), description: makeDesc(ListIds.STYLE_FESTIVE, 'Festive/Diwali vibes') },
          { id: ListIds.STYLE_MINIMAL, title: styleDisplayName(ListIds.STYLE_MINIMAL, lang), description: makeDesc(ListIds.STYLE_MINIMAL, 'Simple and clean') },
          { id: ListIds.STYLE_WITH_MODEL, title: styleDisplayName(ListIds.STYLE_WITH_MODEL, lang), description: makeDesc(ListIds.STYLE_WITH_MODEL, 'AI person with product') },
        ],
      },
    ],
  );
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

const VALID_CATEGORY_IDS = new Set<string>(Object.values(ListIds).filter(id => id.startsWith('cat_')));

export { logger };

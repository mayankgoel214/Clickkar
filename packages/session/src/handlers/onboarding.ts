/**
 * Onboarding handlers.
 *
 * New users:      IDLE → SETUP_LANGUAGE → SETUP_NAME → AWAITING_PHOTO (category inline)
 *                 or IDLE → SETUP_LANGUAGE → SETUP_NAME → SETUP_CATEGORY → AWAITING_PHOTO
 * Returning users: IDLE → profile confirmation (Continue / Change brand / Change category)
 *                  → AWAITING_PHOTO (styles auto-selected at order time)
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import type { Session, User } from '@autmn/db';
import { prisma } from '@autmn/db';
import { uploadFile, Buckets } from '@autmn/storage';
import { detectLanguage } from '@autmn/ai';
import { transitionTo, updateUser } from '../db-helpers.js';
import { downloadWhatsAppMedia, mimeToExt } from './instructions.js';
import {
  styleDisplayName,
  msgAllStylesReady,
  msgSendProductPhotos,
  msgPickStylePack,
} from '../messages.js';
import { ListIds, ButtonIds, CATEGORY_STYLE_RECOMMENDATION, OUTPUT_STYLES_PER_ORDER, isHindi } from '../types.js';
import { selectStylesForOrder } from '../auto-styles.js';
import type { Language } from '../types.js';
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
  // Guard against stale dispatches — re-read state to ensure we're still IDLE.
  const fresh = await prisma.session.findUnique({
    where: { phoneNumber: session.phoneNumber },
    select: { state: true },
  });
  if (fresh && fresh.state !== 'IDLE') {
    console.info(JSON.stringify({
      event: 'handleIdle_stale_dispatch',
      phoneNumber: session.phoneNumber,
      currentState: fresh.state,
    }));
    return;
  }

  const lang = user.language as Language;
  const displayName = (user as any).brandName ?? user.name ?? null;
  const isReturning = Boolean(displayName);

  logger.info('handleIdle called', { phoneNumber: session.phoneNumber, isReturning, lang });

  // ── Handle button replies (always checked first to prevent re-showing prompts) ──────
  if (message.messageType === 'interactive' && message.buttonReplyId) {
    const buttonId = message.buttonReplyId;

    // Profile confirmation: continue with saved profile → SETUP_STYLE (pick pack for this order)
    if (buttonId === ButtonIds.PROFILE_CONTINUE) {
      const claimed = await prisma.session.updateMany({
        where: { phoneNumber: session.phoneNumber, state: 'IDLE' },
        data: {
          state: 'SETUP_STYLE',
          stateEnteredAt: new Date(),
          styleSelection: null,
          styleSelections: [],
          stylePickStep: 0,
          imageMediaIds: [],
          imageStorageUrls: [],
          voiceInstructions: null,
          currentOrderId: null,
          earlyPhotoMediaId: null,
        },
      });
      if (claimed.count === 0) return;
      await sendStylePackList(session.phoneNumber, lang, wa, user.businessType ?? undefined);
      return;
    }

    // Profile update: change brand name → SETUP_NAME
    if (buttonId === ButtonIds.PROFILE_CHANGE_BRAND) {
      const claimed = await prisma.session.updateMany({
        where: { phoneNumber: session.phoneNumber, state: 'IDLE' },
        data: { state: 'SETUP_NAME', stateEnteredAt: new Date() },
      });
      if (claimed.count === 0) return;
      await wa.sendText(
        session.phoneNumber,
        isHindi(lang) ? 'Apna naya brand naam likhiye:' : 'Type your new brand name:',
      );
      return;
    }

    // Profile update: change category → SETUP_CATEGORY
    if (buttonId === ButtonIds.PROFILE_CHANGE_CATEGORY) {
      const claimed = await prisma.session.updateMany({
        where: { phoneNumber: session.phoneNumber, state: 'IDLE' },
        data: { state: 'SETUP_CATEGORY', stateEnteredAt: new Date() },
      });
      if (claimed.count === 0) return;
      await sendCategoryList(session.phoneNumber, lang, wa, displayName ?? undefined);
      return;
    }

    // Legacy: SAME_STYLE / NEW_STYLE (old sessions that still have these queued)
    if (buttonId === ButtonIds.SAME_STYLE || buttonId === ButtonIds.NEW_STYLE || buttonId === 'try_new_style') {
      const claimed = await prisma.session.updateMany({
        where: { phoneNumber: session.phoneNumber, state: 'IDLE' },
        data: {
          state: 'AWAITING_PHOTO',
          stateEnteredAt: new Date(),
          styleSelection: null,
          styleSelections: [],
          stylePickStep: 0,
          imageMediaIds: [],
          imageStorageUrls: [],
          voiceInstructions: null,
          currentOrderId: null,
          earlyPhotoMediaId: null,
        },
      });
      if (claimed.count === 0) return;
      await wa.sendText(session.phoneNumber, msgSendProductPhotos(lang));
      return;
    }
  }

  // ── Returning user ────────────────────────────────────────────────────────────────
  if (isReturning) {
    // If they sent a photo directly, accept it immediately
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
          styleSelections: [],
          voiceInstructions: message.caption?.trim() || null,
          currentOrderId: null,
        },
      });
      const photoAck = isHindi(lang)
        ? `Photo mil gayi, ${displayName}. Processing shuru ho raha hai.`
        : `Photo received, ${displayName}. Getting started.`;
      await wa.sendText(session.phoneNumber, photoAck);
      return;
    }

    // Show saved profile summary + options
    const categoryDisplay = displayCategoryName(user.businessType ?? null, lang);
    const profileBody = lang === 'hi'
      ? `वापस आने पर स्वागत है, ${displayName}। नए ऐड बनाने के लिए तैयार हैं?\n\nआपकी सेव की हुई प्रोफ़ाइल अभी भी एक्टिव है। सीधे फ़ोटो भेजना शुरू करें, या पहले कुछ बदलना है?`
      : isHindi(lang)
      ? `${displayName}. Aapka saved profile:\n• Category: ${categoryDisplay}\n\nContinue karein ya update karein.`
      : `${displayName}. Your saved profile:\n• Category: ${categoryDisplay}\n\nContinue or update your profile.`;

    try {
      await wa.sendButtons(
        session.phoneNumber,
        profileBody,
        [
          { id: ButtonIds.PROFILE_CONTINUE,         title: 'Continue' },
          { id: ButtonIds.PROFILE_CHANGE_BRAND,     title: isHindi(lang) ? 'Brand naam' : 'Change brand' },
          { id: ButtonIds.PROFILE_CHANGE_CATEGORY,  title: isHindi(lang) ? 'Category' : 'Change category' },
        ],
      );
    } catch (btnErr) {
      logger.error('sendButtons failed in handleIdle (returning user), falling back to sendText', {
        phoneNumber: session.phoneNumber,
        error: String(btnErr),
      });
      await wa.sendText(session.phoneNumber, profileBody);
    }
    return;
  }

  // ── New user: auto-detect language from first message, skip picker ───────────────
  const firstMessageText = message.text ?? message.caption ?? '';
  const detectedLang: Language = await detectLanguage(firstMessageText).catch(() => 'en' as Language);

  await updateUser(session.phoneNumber, { language: detectedLang });
  await transitionTo(session.phoneNumber, 'SETUP_NAME');

  const combinedQuestion = detectedLang === 'hi'
    ? 'नमस्ते! मैं Autmn हूँ — आपके प्रोडक्ट की फ़ोटो को प्रोफेशनल ऐड इमेज में बदलता हूँ, कुछ ही मिनटों में।\n\nशुरू करने से पहले — आपके ब्रांड का नाम क्या है और आप कौन सा प्रोडक्ट बेचते हैं?'
    : detectedLang === 'hinglish'
    ? 'Namaste! Autmn mein aapka swagat hai 🙏\n\nAapka brand naam aur aap kya bechte hain — jaise: Riya Boutique, Jewellery\n\nOptions: Jewellery · Food · Garments · Skincare · Candle · Bags · Other'
    : "Namaste! Welcome to Autmn 🙏\n\nYour brand name and what you sell — e.g. 'Riya Boutique, Jewellery'\n\nOptions: Jewellery · Food · Garments · Skincare · Candle · Bags · Other";

  await wa.sendText(session.phoneNumber, combinedQuestion);
}

function displayCategoryName(categoryId: string | null, lang: Language): string {
  const c = categoryId?.replace(/^cat_/, '') ?? '';
  const names: Record<string, { en: string; hinglish: string }> = {
    jewellery:  { en: 'Jewellery',           hinglish: 'Jewellery / Zewar' },
    food:       { en: 'Food',                hinglish: 'Food / Khaana' },
    garment:    { en: 'Garments',            hinglish: 'Kapde / Garments' },
    skincare:   { en: 'Skincare & Beauty',   hinglish: 'Skincare / Beauty' },
    candle:     { en: 'Candle & Home Decor', hinglish: 'Candle / Home Decor' },
    bag:        { en: 'Bags & Accessories',  hinglish: 'Bag / Purse' },
    electronics:{ en: 'Electronics',         hinglish: 'Electronics' },
    general:    { en: 'Other',               hinglish: 'Kuch Aur' },
  };
  const entry = names[c];
  if (!entry) return categoryId ?? 'Not set';
  return isHindi(lang) ? entry.hinglish : entry.en;
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
  let lang: Language = 'en';

  if (message.messageType === 'interactive' && message.buttonReplyId) {
    lang = message.buttonReplyId === ButtonIds.LANG_HINDI ? 'hi' : 'en';
  } else if (message.messageType === 'text' && message.text) {
    const text = message.text.toLowerCase().trim() ?? '';
    const isHinglish = text === 'hindi' || text === '1' || text === 'हिंदी' || text === 'हिन्दी' ||
                    text.includes('hindi') || text.includes('हिं');
    lang = isHinglish ? 'hinglish' : 'en';
  }

  await updateUser(session.phoneNumber, { language: lang });
  await transitionTo(session.phoneNumber, 'SETUP_NAME');

  const combinedQuestion = isHindi(lang)
    ? 'Aapka brand naam aur aap kya bechte hain — jaise: Riya Boutique, Jewellery\n\nOptions: Jewellery · Food · Garments · Skincare · Candle · Bags · Other'
    : "Your brand name and what you sell — e.g. 'Riya Boutique, Jewellery'\n\nOptions: Jewellery · Food · Garments · Skincare · Candle · Bags · Other";

  await wa.sendText(session.phoneNumber, combinedQuestion);
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
  const lang = user.language as Language;
  const raw = message.text?.trim();

  if (!raw || raw.length < 1) {
    await wa.sendText(
      session.phoneNumber,
      isHindi(lang)
        ? 'Brand naam aur category likhiye — jaise: Riya Boutique, Jewellery'
        : "Type your brand name and what you sell — e.g. 'Riya Boutique, Jewellery'",
    );
    return;
  }

  const { brandName, categoryId } = parseBrandAndCategory(raw);

  // Save brandName to both brandName and name (name is used by delivery messages for compat)
  await updateUser(session.phoneNumber, { brandName, name: brandName });

  if (categoryId) {
    await updateUser(session.phoneNumber, { businessType: categoryId });
    await transitionTo(session.phoneNumber, 'SETUP_STYLE', {
      currentOrderId: null,
      styleSelection: null,
      styleSelections: [],
      stylePickStep: 0,
      imageMediaIds: [],
      imageStorageUrls: [],
      voiceInstructions: null,
      earlyPhotoMediaId: null,
    });
    await sendStylePackList(session.phoneNumber, lang, wa, categoryId);
  } else if (user.businessType) {
    // Returning user updating brand name only — already has category, pick style pack for this order
    await transitionTo(session.phoneNumber, 'SETUP_STYLE', {
      currentOrderId: null,
      styleSelection: null,
      styleSelections: [],
      stylePickStep: 0,
      imageMediaIds: [],
      imageStorageUrls: [],
      voiceInstructions: null,
      earlyPhotoMediaId: null,
    });
    await sendStylePackList(session.phoneNumber, lang, wa, user.businessType ?? undefined);
  } else {
    await transitionTo(session.phoneNumber, 'SETUP_CATEGORY');
    await sendCategoryList(session.phoneNumber, lang, wa, brandName);
  }
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
  const lang = user.language as Language;

  if (message.messageType !== 'interactive' || !message.listReplyId) {
    await sendCategoryList(session.phoneNumber, lang, wa, (user as any).brandName ?? user.name ?? undefined);
    return;
  }

  const categoryId = message.listReplyId;
  if (!VALID_CATEGORY_IDS.has(categoryId)) {
    await sendCategoryList(session.phoneNumber, lang, wa, (user as any).brandName ?? user.name ?? undefined);
    return;
  }

  await updateUser(session.phoneNumber, { businessType: categoryId });

  await transitionTo(session.phoneNumber, 'SETUP_STYLE', {
    currentOrderId: null,
    styleSelection: null,
    styleSelections: [],
    stylePickStep: 0,
    imageMediaIds: [],
    imageStorageUrls: [],
    voiceInstructions: null,
    earlyPhotoMediaId: null,
  });
  await sendStylePackList(session.phoneNumber, lang, wa, categoryId);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export async function sendCategoryList(
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
  name?: string,
): Promise<void> {
  const greeting = name
    ? (isHindi(lang) ? `${name} — aap kaunsa product bechte hain?` : `${name} — what do you sell?`)
    : (isHindi(lang) ? 'Aap kaunsa product bechte hain?' : 'What do you sell?');

  await wa.sendList(
    phoneNumber,
    greeting,
    isHindi(lang) ? 'Chuniye' : 'Choose',
    [
      {
        title: isHindi(lang) ? 'Product type' : 'Product Type',
        rows: [
          { id: ListIds.CAT_JEWELLERY, title: isHindi(lang) ? 'Jewellery / Zewar' : 'Jewellery', description: 'Rings, necklaces, earrings...' },
          { id: ListIds.CAT_FOOD, title: isHindi(lang) ? 'Khaana / Food' : 'Food', description: 'Packaged food, sweets, snacks...' },
          { id: ListIds.CAT_GARMENT, title: isHindi(lang) ? 'Kapde / Garments' : 'Garments', description: 'Sarees, kurtas, shirts...' },
          { id: ListIds.CAT_SKINCARE, title: 'Skincare / Beauty', description: 'Creams, serums, cosmetics...' },
          { id: ListIds.CAT_CANDLE, title: 'Candle / Home Decor', description: 'Candles, diffusers, decor...' },
          { id: ListIds.CAT_BAG, title: 'Bag / Purse', description: 'Handbags, wallets, clutches...' },
          { id: ListIds.CAT_GENERAL, title: isHindi(lang) ? 'Kuch Aur' : 'Other', description: 'Electronics, toys, etc...' },
        ],
      },
    ],
  );
}

/**
 * Sends the style PACK picker — a single WhatsApp list where each row is a
 * pre-made 3-style bundle. Selecting one pack resolves all 3 styles at once.
 * "Custom" triggers the sequential 3-step individual style picker.
 *
 * Called from SETUP_STYLE state (after photos are already collected).
 */
export async function sendStylePackList(
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
  categoryId?: string,
): Promise<void> {
  if (lang === 'hi') {
    await wa.sendText(
      phoneNumber,
      'कितने ऐड वर्ज़न चाहिए?\n\n• 1 ऐड — ₹30\n• 2 ऐड — ₹60\n• 3 ऐड — ₹90\n\nहर वर्ज़न का स्टाइल अलग होगा ताकि आप टेस्ट कर सकें।',
    );
  }
  const headerText = msgPickStylePack(lang);

  const rows = [
    {
      id: ListIds.SMART_PACK,
      title: isHindi(lang) ? 'Smart Pack \u2728' : 'Smart Pack \u2728',
      description: isHindi(lang)
        ? 'AI aapke product ke liye 3 best styles chunega'
        : 'AI picks the best 3 styles for your product',
    },
    {
      id: ListIds.BESTSELLER_PACK,
      title: isHindi(lang) ? 'Best Seller Pack \ud83c\udfc6' : 'Best Seller Pack \ud83c\udfc6',
      description: isHindi(lang)
        ? 'Lifestyle + Studio + Dark Luxury'
        : 'Lifestyle + Studio + Dark Luxury',
    },
    {
      id: ListIds.FESTIVAL_PACK,
      title: isHindi(lang) ? 'Festival Pack \ud83c\udf89' : 'Festival Pack \ud83c\udf89',
      description: isHindi(lang)
        ? 'Tyohar + Lifestyle + Clean White'
        : 'Festive + Lifestyle + Clean White',
    },
    {
      id: ListIds.ACTION_PACK,
      title: isHindi(lang) ? 'Action Pack \ud83d\udcaa' : 'Action Pack \ud83d\udcaa',
      description: isHindi(lang)
        ? 'Model + Outdoor + Lifestyle'
        : 'With Model + Outdoor + Lifestyle',
    },
    {
      id: ListIds.CUSTOM_PACK,
      title: isHindi(lang) ? 'Custom \ud83c\udfa8' : 'Custom \ud83c\udfa8',
      description: isHindi(lang)
        ? 'Khud 3 styles chuniye'
        : 'Pick 3 styles yourself',
    },
  ];

  await wa.sendList(
    phoneNumber,
    headerText,
    isHindi(lang) ? 'Pack chuniye' : 'Choose pack',
    [{ title: isHindi(lang) ? 'Style Packs' : 'Style Packs', rows }],
  );
}

/**
 * Sends the individual style list for a specific step in the custom 3-step picker.
 * Only called when the user selects Custom pack.
 */
export async function sendStyleList(
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
  categoryId?: string,
  alreadyPicked: string[] = [],
): Promise<void> {
  const recStyleId = categoryId ? (CATEGORY_STYLE_RECOMMENDATION[categoryId] ?? null) : null;
  const pickNumber = alreadyPicked.length + 1; // 1, 2, or 3
  const isFirstPick = pickNumber === 1;

  const makeDesc = (id: string, desc: string) => {
    return id === recStyleId ? `${desc} -- Recommended` : desc;
  };

  // All individual style rows (excluding already-picked styles)
  const individualRows = [
    { id: ListIds.STYLE_AUTMN_SPECIAL, title: styleDisplayName(ListIds.STYLE_AUTMN_SPECIAL, lang), description: makeDesc(ListIds.STYLE_AUTMN_SPECIAL, 'AI picks the best creative direction') },
    { id: ListIds.STYLE_CLEAN_WHITE, title: styleDisplayName(ListIds.STYLE_CLEAN_WHITE, lang), description: makeDesc(ListIds.STYLE_CLEAN_WHITE, 'Pure white background') },
    { id: ListIds.STYLE_STUDIO, title: styleDisplayName(ListIds.STYLE_STUDIO, lang), description: makeDesc(ListIds.STYLE_STUDIO, 'Colored backdrop studio') },
    { id: ListIds.STYLE_LIFESTYLE, title: styleDisplayName(ListIds.STYLE_LIFESTYLE, lang), description: makeDesc(ListIds.STYLE_LIFESTYLE, 'Real-life setting') },
    { id: ListIds.STYLE_OUTDOOR, title: styleDisplayName(ListIds.STYLE_OUTDOOR, lang), description: makeDesc(ListIds.STYLE_OUTDOOR, 'Natural outdoor scene') },
    { id: ListIds.STYLE_GRADIENT, title: styleDisplayName(ListIds.STYLE_GRADIENT, lang), description: makeDesc(ListIds.STYLE_GRADIENT, isHindi(lang) ? 'Dramatic dark aur cinematic' : 'Dramatic dark & cinematic') },
    { id: ListIds.STYLE_FESTIVE, title: styleDisplayName(ListIds.STYLE_FESTIVE, lang), description: makeDesc(ListIds.STYLE_FESTIVE, isHindi(lang) ? 'Tyohar ka mahaul' : 'Indian festival celebration') },
    { id: ListIds.STYLE_WITH_MODEL, title: styleDisplayName(ListIds.STYLE_WITH_MODEL, lang), description: makeDesc(ListIds.STYLE_WITH_MODEL, 'AI person with product') },
  ].filter(row => !alreadyPicked.includes(row.id));

  // Smart Pack is shown as the first option on step 1 — tapping it picks all 3 at once
  const allStyleRows = isFirstPick
    ? [
        {
          id: ListIds.SMART_PACK,
          title: isHindi(lang) ? 'Smart Pack \u2728' : 'Smart Pack \u2728',
          description: isHindi(lang)
            ? 'AI aapke product ke liye 3 best styles chunega'
            : 'AI picks the best 3 styles for your product',
        },
        ...individualRows,
      ]
    : individualRows;

  const headerText = isHindi(lang)
    ? `Style ${pickNumber} of ${OUTPUT_STYLES_PER_ORDER} chuniye:`
    : `Pick style ${pickNumber} of ${OUTPUT_STYLES_PER_ORDER}:`;

  await wa.sendList(
    phoneNumber,
    headerText,
    isHindi(lang) ? 'Chuniye' : 'Choose',
    [{ title: 'Styles', rows: allStyleRows }],
  );
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

const VALID_CATEGORY_IDS = new Set<string>(Object.values(ListIds).filter(id => id.startsWith('cat_')));

// ---------------------------------------------------------------------------
// Brand + category parser — for combined "Riya Boutique, Jewellery" replies
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/jewel|jewl|zewar|gold|ring|necklace|earring|haar|kangan|zewarat/i, 'cat_jewellery'],
  [/food|khaana|khana|bakery|sweet|mithai|snack|namkeen|restaurant|cake|bake/i, 'cat_food'],
  [/garment|kapda|kapde|saree|sari|kurta|shirt|dress|cloth|fashion|apparel|lehenga/i, 'cat_garment'],
  [/skin|beauty|cream|serum|lotion|makeup|cosmetic|moisturizer|facewash/i, 'cat_skincare'],
  [/candle|diffuser|fragrance|decor|aroma/i, 'cat_candle'],
  [/bag|purse|wallet|handbag|clutch|backpack/i, 'cat_bag'],
];

function parseBrandAndCategory(raw: string): { brandName: string; categoryId: string | null } {
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\x00-\x1F\x7F]/g, '').trim();

  const sanitize = (s: string) => {
    const t = s.trim().slice(0, 50);
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  // Comma-separated: "Riya Boutique, Jewellery"
  const commaIdx = text.indexOf(',');
  if (commaIdx > 0) {
    const brandPart = text.slice(0, commaIdx).trim();
    const categoryPart = text.slice(commaIdx + 1).trim();
    if (brandPart.length >= 1) {
      let categoryId: string | null = null;
      for (const [pattern, id] of CATEGORY_PATTERNS) {
        if (pattern.test(categoryPart)) { categoryId = id; break; }
      }
      return { brandName: sanitize(brandPart), categoryId };
    }
  }

  // No comma: check if a category keyword is embedded
  for (const [pattern, id] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) {
      const stripped = text.replace(pattern, '').replace(/[,\s]+$/, '').trim();
      return { brandName: sanitize(stripped.length >= 1 ? stripped : text), categoryId: id };
    }
  }

  // Only brand name found — no category recognized
  return { brandName: sanitize(text), categoryId: null };
}

/**
 * Fills `existing` styles up to `target` count using the Smart Pack for the
 * given category. Never repeats a style.
 */
function fillWithSmartPack(existing: string[], category: string | null, target: number): string[] {
  if (existing.length >= target) return existing.slice(0, target);
  const smartPack = selectStylesForOrder(category, target);
  const result = [...existing];
  const usedSet = new Set(result);
  for (const style of smartPack) {
    if (result.length >= target) break;
    if (!usedSet.has(style)) { result.push(style); usedSet.add(style); }
  }
  return result.slice(0, target);
}

export { logger };

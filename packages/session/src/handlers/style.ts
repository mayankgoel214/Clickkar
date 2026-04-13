/**
 * SETUP_STYLE handler — styles-first flow.
 *
 * Styles are picked BEFORE photos are submitted.
 * After style pack pick (or completing custom 3-step) → go to AWAITING_PHOTO.
 * Style-change edit path (session.currentOrderId) is unchanged.
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import type { Session, User } from '@whatsads/db';
import { prisma } from '@whatsads/db';
import { getImageQueue } from '@whatsads/queue';
import { transitionTo } from '../db-helpers.js';
import { styleDisplayName, msgRevisionLimitReached, msgStylePicked, msgAllStylesReady, msgSendProductPhotos, msgStylePackReady } from '../messages.js';
import { ListIds, ButtonIds, FREE_REDOS_PER_STYLE, OUTPUT_STYLES_PER_ORDER } from '../types.js';
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
      await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined, []);
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
    const alreadyPicked = (session.styleSelections as string[]) ?? [];
    // Show style list for the current step (Smart Pack shown on step 1 automatically)
    const { sendStyleList } = await import('./onboarding.js');
    await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined, alreadyPicked);
    return;
  }

  // --- Pack selections: resolve to 3 concrete styles and go to AWAITING_PHOTO ---
  const packStyles = resolvePackStyles(styleId, user.businessType ?? null);
  if (packStyles) {
    // Custom pack: start the 3-step individual picker instead
    if (styleId === ListIds.CUSTOM_PACK) {
      await prisma.session.update({
        where: { phoneNumber },
        data: {
          styleSelections: [],
          stylePickStep: 0,
          styleSelection: null,
        },
      });
      logger.info(JSON.stringify({ event: 'custom_pack_selected', phoneNumber }));
      const { sendStyleList } = await import('./onboarding.js');
      await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined, []);
      return;
    }

    // Pre-made pack or Smart Pack: resolve all 3 styles, then go to AWAITING_PHOTO
    const packName = packDisplayName(styleId, lang);
    const styleNames = packStyles.map(s => styleDisplayName(s, lang));
    logger.info(JSON.stringify({ event: 'style_pack_selected', pack: styleId, category: user.businessType, styles: packStyles }));

    await wa.sendText(phoneNumber, msgStylePackReady(lang, packName, styleNames));

    // Save styles and transition to AWAITING_PHOTO — photos come after styles
    await transitionTo(phoneNumber, 'AWAITING_PHOTO', {
      styleSelection: packStyles[0],
      styleSelections: packStyles,
      stylePickStep: 0,
      imageMediaIds: [],
      imageStorageUrls: [],
      voiceInstructions: null,
      currentOrderId: null,
      earlyPhotoMediaId: null,
    });
    await wa.sendText(phoneNumber, msgSendProductPhotos(lang));
    return;
  }

  const styleName = styleDisplayName(styleId, lang);

  // Check if this is a style-change edit (currentOrderId preserved from edit.ts)
  if (session.currentOrderId) {
    const order = await prisma.order.findUnique({ where: { id: session.currentOrderId } });
    if (order && order.inputImageUrls.length > 0) {
      // Check revision limits: each output style gets FREE_REDOS_PER_STYLE free redo(s).
      // Total free redos for the order = outputStyleCount * FREE_REDOS_PER_STYLE.
      const totalFreeRedos = (order.outputStyleCount || (order.stylesOrdered as string[]).length || OUTPUT_STYLES_PER_ORDER) * FREE_REDOS_PER_STYLE;
      if (order.revisionsUsed >= totalFreeRedos) {
        await wa.sendText(phoneNumber, msgRevisionLimitReached(lang, order.imageCount));
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

      const inputImageUrls = (order.inputImageUrls as string[]) ?? [];
      const cutoutUrls = (order.cutoutUrls as string[]) ?? [];

      // A style-change reprocesses every image — each consumes one free redo,
      // so increment revisionsUsed by the number of images being reprocessed.
      await prisma.order.update({
        where: { id: order.id },
        data: {
          style: styleId,
          revisionsUsed: { increment: inputImageUrls.length },
          status: 'processing',
          processingStartedAt: new Date(),
          processingCompletedAt: null,
        },
      });

      // Create an ImageJob and enqueue a processing job for EVERY image in the order
      const queue = getImageQueue();
      let jobsEnqueued = 0;

      for (let i = 0; i < inputImageUrls.length; i++) {
        const inputUrl = cutoutUrls[i] || inputImageUrls[i] || '';
        if (!inputUrl) continue;

        const editJobId = crypto.randomUUID();
        await prisma.imageJob.create({
          data: {
            id: editJobId,
            orderId: order.id,
            inputImageUrl: inputUrl,
            style: styleId,
            status: 'queued',
          },
        });

        await queue.add('process_image', {
          orderId: order.id,
          imageJobId: editJobId,
          phoneNumber: phoneNumber,
          inputImageUrl: inputUrl,
          style: styleId,
          productCategory: order.productCategory ?? undefined,
          pipeline: cutoutUrls[i] ? 'fallback' : 'primary',
        });

        jobsEnqueued++;
      }

      await transitionTo(phoneNumber, 'EDIT_PROCESSING', {
        styleSelection: styleId,
      });

      logger.info('Style-change edit: reprocessing all images with new style', {
        phoneNumber,
        styleId,
        orderId: order.id,
        jobsEnqueued,
        imageCount: inputImageUrls.length,
      });
      return;
    }
  }

  // --- 3-step style picker flow ---
  const currentPicked = (session.styleSelections as string[]) ?? [];
  const currentStep = typeof session.stylePickStep === 'number' ? session.stylePickStep : 0;
  const updatedSelections = [...currentPicked, styleId];
  const cappedSelections = updatedSelections.slice(0, OUTPUT_STYLES_PER_ORDER);
  const newStep = Math.min(cappedSelections.length, OUTPUT_STYLES_PER_ORDER);

  logger.info('Style step picked', { phoneNumber, styleId, newStep, total: OUTPUT_STYLES_PER_ORDER });

  if (newStep < OUTPUT_STYLES_PER_ORDER) {
    // More styles to pick — save progress and show next list
    await prisma.session.update({
      where: { phoneNumber },
      data: {
        styleSelections: cappedSelections,
        stylePickStep: newStep,
        // Keep styleSelection as first pick for backward compat
        styleSelection: cappedSelections[0] ?? null,
      },
    });

    await wa.sendText(phoneNumber, msgStylePicked(lang, styleName, newStep));

    const { sendStyleList } = await import('./onboarding.js');
    await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined, cappedSelections);
    return;
  }

  // All 3 custom styles picked — now go to AWAITING_PHOTO (photos come after styles)
  const styleNames = cappedSelections.map(s => styleDisplayName(s, lang));
  await wa.sendText(phoneNumber, msgAllStylesReady(lang, styleNames));

  logger.info('Custom 3-step style pick complete, transitioning to AWAITING_PHOTO', { phoneNumber, styles: cappedSelections });

  await transitionTo(phoneNumber, 'AWAITING_PHOTO', {
    styleSelection: cappedSelections[0],
    styleSelections: cappedSelections,
    stylePickStep: 0,
    imageMediaIds: [],
    imageStorageUrls: [],
    voiceInstructions: null,
    currentOrderId: null,
    earlyPhotoMediaId: null,
  });
  await wa.sendText(phoneNumber, msgSendProductPhotos(lang));
}

// ---------------------------------------------------------------------------

// All pack IDs and individual style IDs that are valid list reply values.
// Pack IDs are resolved to concrete style arrays before being saved.
const PACK_IDS = new Set<string>([
  ListIds.SMART_PACK,
  ListIds.BESTSELLER_PACK,
  ListIds.FESTIVAL_PACK,
  ListIds.ACTION_PACK,
  ListIds.CUSTOM_PACK,
]);

const VALID_STYLE_IDS = new Set<string>([
  ...Object.values(ListIds).filter(id => id.startsWith('style_')),
  ...Array.from(PACK_IDS),
]);

/**
 * Returns the 3 concrete style IDs for a given pack, or null if the styleId is
 * not a pack (meaning it's an individual style ID for the custom 3-step flow).
 * Returns an empty array for CUSTOM_PACK (caller handles separately).
 */
function resolvePackStyles(styleId: string, category: string | null): string[] | null {
  if (styleId === ListIds.SMART_PACK) {
    return resolveSmartPack(category);
  }
  if (styleId === ListIds.BESTSELLER_PACK) {
    return ['style_lifestyle', 'style_studio', 'style_gradient'];
  }
  if (styleId === ListIds.FESTIVAL_PACK) {
    return ['style_festive', 'style_lifestyle', 'style_clean_white'];
  }
  if (styleId === ListIds.ACTION_PACK) {
    return ['style_with_model', 'style_outdoor', 'style_lifestyle'];
  }
  if (styleId === ListIds.CUSTOM_PACK) {
    return []; // signal caller to start 3-step picker
  }
  return null; // not a pack — individual style
}

/**
 * Human-readable display name for a pack.
 */
function packDisplayName(packId: string, lang: 'hi' | 'en'): string {
  const names: Record<string, { hi: string; en: string }> = {
    smart_pack: { hi: 'Smart Pack \u2728', en: 'Smart Pack \u2728' },
    bestseller_pack: { hi: 'Best Seller Pack \ud83c\udfc6', en: 'Best Seller Pack \ud83c\udfc6' },
    festival_pack: { hi: 'Festival Pack \ud83c\udf89', en: 'Festival Pack \ud83c\udf89' },
    action_pack: { hi: 'Action Pack \ud83d\udcaa', en: 'Action Pack \ud83d\udcaa' },
    custom_pack: { hi: 'Custom \ud83c\udfa8', en: 'Custom \ud83c\udfa8' },
  };
  return names[packId]?.[lang] ?? packId;
}

/**
 * Resolves Smart Pack to the 3 best concrete styles for the given product category.
 */
function resolveSmartPack(category: string | null): string[] {
  const mapping: Record<string, string[]> = {
    cat_jewellery: ['style_clickkar_special', 'style_gradient', 'style_lifestyle'],
    cat_food: ['style_clickkar_special', 'style_lifestyle', 'style_outdoor'],
    cat_garment: ['style_clickkar_special', 'style_lifestyle', 'style_with_model'],
    cat_skincare: ['style_clickkar_special', 'style_clean_white', 'style_lifestyle'],
    cat_candle: ['style_clickkar_special', 'style_lifestyle', 'style_festive'],
    cat_bag: ['style_clickkar_special', 'style_lifestyle', 'style_outdoor'],
  };
  return mapping[category ?? ''] ?? ['style_clickkar_special', 'style_lifestyle', 'style_studio'];
}

function resolveStyleFromText(text: string): string | null {
  if (text.includes('special') || text.includes('clickkar') || text.includes('best') || text.includes('creative')) return ListIds.STYLE_CLICKKAR_SPECIAL;
  if (text.includes('white') || text.includes('safed') || text.includes('clean')) return ListIds.STYLE_CLEAN_WHITE;
  if (text.includes('lifestyle') || text.includes('life')) return ListIds.STYLE_LIFESTYLE;
  if (text.includes('gradient') || text.includes('color') || text.includes('colour')) return ListIds.STYLE_GRADIENT;
  if (text.includes('outdoor') || text.includes('bahar') || text.includes('nature')) return ListIds.STYLE_OUTDOOR;
  if (text.includes('studio') || text.includes('professional')) return ListIds.STYLE_STUDIO;
  if (text.includes('festive') || text.includes('tyohar') || text.includes('festival')) return ListIds.STYLE_FESTIVE;
  if (text.includes('minimal') || text.includes('simple')) return 'style_minimal';
  if (text.includes('model') || text.includes('person') || text.includes('human')) return ListIds.STYLE_WITH_MODEL;
  if (text.includes('video') || text.includes('reel') || text.includes('clip')) return ListIds.STYLE_VIDEO_SHOOT;
  return null;
}

/**
 * SETUP_STYLE handler — V3 streamlined flow.
 *
 * After style pick → straight to AWAITING_PHOTO.
 * Instructions merged into photo step (caption).
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import type { Session, User } from '@whatsads/db';
import { transitionTo } from '../db-helpers.js';
import { styleDisplayName } from '../messages.js';
import { ListIds, ButtonIds } from '../types.js';
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

  if (!styleId) {
    const { sendStyleList } = await import('./onboarding.js');
    await sendStyleList(phoneNumber, lang, wa, user.businessType ?? undefined);
    return;
  }

  const styleName = styleDisplayName(styleId, lang);

  await transitionTo(phoneNumber, 'AWAITING_PHOTO', {
    styleSelection: styleId,
    imageMediaIds: [],
    imageStorageUrls: [],
    voiceInstructions: null,
    currentOrderId: null,
  });

  await wa.sendText(
    phoneNumber,
    lang === 'hi'
      ? `*${styleName}* style set!\nAb product ki photo bhejiye.`
      : `*${styleName}* style set!\nNow send your product photo.`,
  );

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

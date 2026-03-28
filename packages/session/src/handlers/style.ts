/**
 * AWAITING_STYLE handler.
 * Sends the style selection list and handles the reply.
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import type { Session, User } from '@whatsads/db';
import { transitionTo } from '../db-helpers.js';
import {
  msgAskStyle,
  msgAskVoice,
  msgUnknownMessage,
  styleDisplayName,
} from '../messages.js';
import { ButtonIds, ListIds } from '../types.js';
import type { MessageContext } from '../types.js';

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAwaitingStyle(
  session: Session,
  user: User,
  message: MessageContext,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;

  if (message.messageType !== 'interactive' || !message.listReplyId) {
    // Re-send the style list
    await waClient.sendText(phoneNumber, msgAskStyle(lang));
    await sendStyleList(phoneNumber, lang, waClient);
    return;
  }

  const styleId = message.listReplyId;
  if (!isValidStyleId(styleId)) {
    await waClient.sendText(phoneNumber, msgUnknownMessage(lang));
    await sendStyleList(phoneNumber, lang, waClient);
    return;
  }

  // Store style and advance to AWAITING_VOICE
  await transitionTo(phoneNumber, 'AWAITING_VOICE', {
    styleSelection: styleId,
  });

  // Confirm style selection
  const styleName = styleDisplayName(styleId, lang);
  await waClient.sendText(
    phoneNumber,
    lang === 'hi'
      ? `Style choose ho gaya: *${styleName}* ✅`
      : `Style selected: *${styleName}* ✅`,
  );

  // Ask for voice instructions with a skip button
  await waClient.sendButtons(
    phoneNumber,
    msgAskVoice(lang),
    [{ id: ButtonIds.SKIP_VOICE, title: lang === 'hi' ? 'Skip karein' : 'Skip' }],
  );
}

// ---------------------------------------------------------------------------
// Exported helper used by images.ts and confirmation.ts
// ---------------------------------------------------------------------------

export async function sendStyleList(
  phoneNumber: string,
  lang: 'hi' | 'en',
  waClient: WhatsAppClient,
): Promise<void> {
  await waClient.sendList(
    phoneNumber,
    lang === 'hi' ? 'Kaunsa style chahiye?' : 'Which style would you like?',
    lang === 'hi' ? 'Style chuniye' : 'Choose Style',
    [
      {
        title: lang === 'hi' ? 'Background style' : 'Background Style',
        rows: [
          {
            id: ListIds.STYLE_CLEAN_WHITE,
            title: styleDisplayName(ListIds.STYLE_CLEAN_WHITE, lang),
            description: lang === 'hi' ? 'Saaf safed — har product pe accha lagta hai' : 'Pure white — works for any product',
          },
          {
            id: ListIds.STYLE_LIFESTYLE,
            title: styleDisplayName(ListIds.STYLE_LIFESTYLE, lang),
            description: lang === 'hi' ? 'Real-life setting mein dikhaye' : 'Show in a real-life setting',
          },
          {
            id: ListIds.STYLE_GRADIENT,
            title: styleDisplayName(ListIds.STYLE_GRADIENT, lang),
            description: lang === 'hi' ? 'Smooth color gradient background' : 'Smooth colour gradient background',
          },
          {
            id: ListIds.STYLE_OUTDOOR,
            title: styleDisplayName(ListIds.STYLE_OUTDOOR, lang),
            description: lang === 'hi' ? 'Bahar ka natural setting' : 'Natural outdoor setting',
          },
          {
            id: ListIds.STYLE_STUDIO,
            title: styleDisplayName(ListIds.STYLE_STUDIO, lang),
            description: lang === 'hi' ? 'Professional studio look' : 'Professional studio look',
          },
          {
            id: ListIds.STYLE_FESTIVE,
            title: styleDisplayName(ListIds.STYLE_FESTIVE, lang),
            description: lang === 'hi' ? 'Tyohar ke liye special' : 'Special festive background',
          },
          {
            id: ListIds.STYLE_MINIMAL,
            title: styleDisplayName(ListIds.STYLE_MINIMAL, lang),
            description: lang === 'hi' ? 'Simple aur clean design' : 'Simple and clean design',
          },
        ],
      },
    ],
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STYLE_IDS = new Set<string>(Object.values(ListIds).filter(id => id.startsWith('style_')));

function isValidStyleId(id: string): boolean {
  return VALID_STYLE_IDS.has(id);
}

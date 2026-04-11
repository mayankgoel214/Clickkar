/**
 * AWAITING_EDIT and EDIT_PROCESSING handlers.
 *
 * Handles edit requests after image delivery:
 * - Background change (reuses stored cutout — fast, $0.003)
 * - Brightness/lighting adjustment
 * - Full style change
 * - Custom voice/text instruction
 *
 * Checks revision limits (2 free per order, Rs 29 after).
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { prisma } from '@whatsads/db';
import type { Session, User } from '@whatsads/db';
import { getImageQueue } from '@whatsads/queue';
import { downloadMedia } from '@whatsads/whatsapp';
import { uploadFile, Buckets } from '@whatsads/storage';
import { transcribeVoiceNote } from '@whatsads/ai';
import { parseEditInstructions } from '@whatsads/ai';
import { transitionTo } from '../db-helpers.js';
import {
  msgEditProcessing,
  msgRevisionLimitReached,
  msgGenericError,
} from '../messages.js';
import {
  FREE_REVISIONS_PER_ORDER,
} from '../types.js';
import type { MessageContext } from '../types.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// AWAITING_EDIT — user picked an edit option or sent free-form instructions
// ---------------------------------------------------------------------------

export async function handleAwaitingEdit(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as 'hi' | 'en') || 'hi';

  if (!session.currentOrderId) {
    logger.error('No current order in AWAITING_EDIT', { phoneNumber: session.phoneNumber });
    await wa.sendText(session.phoneNumber, msgGenericError(lang));
    await transitionTo(session.phoneNumber, 'IDLE');
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: session.currentOrderId } });
  if (!order) {
    await wa.sendText(session.phoneNumber, msgGenericError(lang));
    await transitionTo(session.phoneNumber, 'IDLE');
    return;
  }

  // Check revision limits
  if (order.revisionsUsed >= FREE_REVISIONS_PER_ORDER) {
    // TODO: send payment link for Rs 29 revision fee
    await wa.sendText(session.phoneNumber, msgRevisionLimitReached(lang));
    await transitionTo(session.phoneNumber, 'DELIVERED');
    return;
  }

  let editStyle: string | null = null;
  let editInstructions: string | null = null;

  // Handle list/button replies for edit type
  if (message.messageType === 'interactive') {
    const replyId = message.buttonReplyId || message.listReplyId;

    switch (replyId) {
      case 'edit_background':
        editInstructions = 'Change the background to something completely different while keeping the product exactly the same. Make the new background complement the product.';
        break;

      case 'edit_style':
        // Show style selection — keep currentOrderId so style.ts knows to reprocess
        await transitionTo(session.phoneNumber, 'SETUP_STYLE', {
          // Keep currentOrderId — signals style.ts this is a style-change edit
          voiceInstructions: null,
        });
        {
          const { sendStyleList } = await import('./onboarding.js');
          await sendStyleList(session.phoneNumber, lang, wa, user.businessType ?? undefined);
        }
        return;

      case 'edit_lighting':
        editInstructions = 'Make it brighter with better lighting';
        break;

      case 'edit_crop':
        editInstructions = 'Zoom in on the product, make it larger in frame';
        break;

      case 'edit_other':
        // Ask user to send text/voice — stay in DELIVERED, next text/voice will route back here
        await wa.sendText(
          session.phoneNumber,
          lang === 'hi'
            ? 'Batao kya chahiye — text ya voice note mein.'
            : 'Send text or voice note with what you want.',
        );
        return;

      default:
        if (replyId && replyId.startsWith('style_')) {
          editStyle = replyId.replace('style_', '');
        }
    }
  }

  // Handle voice note edit instructions
  if (message.messageType === 'audio' && message.mediaId) {
    try {
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? process.env['WHATSAPP_ACCESS_TOKEN'] ?? '';
      if (!accessToken) {
        console.error(JSON.stringify({ event: 'missing_whatsapp_access_token' }));
        throw new Error('WHATSAPP_ACCESS_TOKEN is not configured');
      }
      const { buffer, mimeType } = await downloadMedia(message.mediaId, accessToken);

      const storagePath = `${session.phoneNumber}/${Date.now()}-edit.ogg`;
      await uploadFile(Buckets.VOICE_NOTES, storagePath, buffer, mimeType);

      const transcription = await transcribeVoiceNote(buffer, mimeType);
      if (transcription.text) {
        const parsed = await parseEditInstructions(transcription.text);
        editInstructions = transcription.text.slice(0, 500);
        if (parsed.backgroundStyle) {
          editStyle = parsed.backgroundStyle;
        }
      }
    } catch (err) {
      logger.error('Failed to process edit voice note', { error: String(err), phoneNumber: session.phoneNumber });
    }
  }

  // Handle text edit instructions
  if (message.messageType === 'text' && message.text) {
    try {
      const parsed = await parseEditInstructions(message.text);
      editInstructions = message.text.slice(0, 500);
      if (parsed.backgroundStyle) {
        editStyle = parsed.backgroundStyle;
      }
    } catch {
      editInstructions = message.text.slice(0, 500);
    }
  }

  // If we have something to work with, enqueue the edit job
  if (editStyle || editInstructions) {
    await wa.sendText(session.phoneNumber, msgEditProcessing(lang));

    // Increment revision count and reset order status to 'processing'
    // so the worker's delivery logic (which checks for 'processing' status) works
    await prisma.order.update({
      where: { id: order.id },
      data: {
        revisionsUsed: { increment: 1 },
        status: 'processing',
        processingStartedAt: new Date(),
        processingCompletedAt: null,
      },
    });

    // Create ImageJob record for the edit
    const editJobId = crypto.randomUUID();
    await prisma.imageJob.create({
      data: {
        id: editJobId,
        orderId: order.id,
        inputImageUrl: order.cutoutUrls[0] || order.inputImageUrls[0] || '',
        style: editStyle || order.style || 'style_clean_white',
        status: 'queued',
      },
    });

    // Enqueue re-processing job
    const queue = getImageQueue();
    await queue.add('process_image', {
      orderId: order.id,
      imageJobId: editJobId,
      phoneNumber: session.phoneNumber,
      inputImageUrl: order.cutoutUrls[0] || order.inputImageUrls[0] || '',
      style: editStyle || order.style || 'style_clean_white',
      voiceInstructions: editInstructions ?? undefined,
      productCategory: order.productCategory ?? undefined,
      pipeline: order.cutoutUrls.length > 0 ? 'fallback' : 'primary',
    });

    await transitionTo(session.phoneNumber, 'EDIT_PROCESSING');
    return;
  }

  // No actionable instruction — ask again
  await wa.sendText(
    session.phoneNumber,
    lang === 'hi'
      ? 'Kya badlana hai? Background, roshni, ya kuch aur — batayein.'
      : 'What would you like to change? Background, lighting, or something else?',
  );
}

// ---------------------------------------------------------------------------
// EDIT_PROCESSING — image is being re-processed
// ---------------------------------------------------------------------------

export async function handleEditProcessing(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as 'hi' | 'en') || 'hi';

  // User sent a message while edit is processing — acknowledge
  await wa.sendText(
    session.phoneNumber,
    lang === 'hi'
      ? 'Aapka edit ho raha hai — bas thoda sa wait karein!'
      : 'Your edit is being processed — just a moment!',
  );
}

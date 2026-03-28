/**
 * AWAITING_IMAGES handler.
 *
 * - Receives images → download from WhatsApp (5-min expiry window!), upload to Storage.
 * - Accumulates image URLs on the session.
 * - Sets/resets a 60-second BullMQ delayed job to auto-advance to AWAITING_STYLE.
 * - Enforces MAX_IMAGES_PER_ORDER limit.
 * - If the user sends text/button while awaiting images, interprets "done" intent
 *   and advances immediately.
 */

import type { WhatsAppClient } from '@whatsads/whatsapp';
import { prisma } from '@whatsads/db';
import type { Session, User } from '@whatsads/db';
import { uploadFile } from '@whatsads/storage';
import { Buckets } from '@whatsads/storage';
import { getSessionTimeoutQueue } from '@whatsads/queue';
import {
  msgImageReceived,
  msgMultiImageReceived,
  msgAskStyle,
  msgGenericError,
  msgUnknownMessage,
} from '../messages.js';
import {
  IMAGE_BATCH_TIMEOUT_SECONDS,
  MAX_IMAGES_PER_ORDER,
} from '../types.js';
import { transitionTo } from '../db-helpers.js';
import { logger } from '../logger.js';
import type { MessageContext } from '../types.js';
import { sendStyleList } from './style.js';

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAwaitingImages(
  session: Session,
  user: User,
  message: MessageContext,
  waClient: WhatsAppClient,
): Promise<void> {
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  const phoneNumber = session.phoneNumber;

  // ---- IMAGE MESSAGE ----
  if (message.messageType === 'image' && message.mediaId) {
    const currentCount = session.imageStorageUrls.length;

    if (currentCount >= MAX_IMAGES_PER_ORDER) {
      await waClient.sendText(
        phoneNumber,
        lang === 'hi'
          ? `Maximum ${MAX_IMAGES_PER_ORDER} photos liya ja sakta hai. Style chuniye!`
          : `Maximum ${MAX_IMAGES_PER_ORDER} photos reached. Let's choose your style!`,
      );
      await advanceToStyle(session, user, waClient);
      return;
    }

    // Download from WhatsApp and immediately upload to Storage
    let storageUrl: string;
    try {
      storageUrl = await downloadAndStore(message.mediaId, phoneNumber, currentCount, waClient);
    } catch (err) {
      logger.error('Image download/upload failed', {
        phoneNumber,
        mediaId: message.mediaId,
        error: err instanceof Error ? err.message : String(err),
      });
      await waClient.sendText(phoneNumber, msgGenericError(lang));
      return;
    }

    // Append to session
    const newUrls = [...session.imageStorageUrls, storageUrl];
    const newMediaIds = [...session.imageMediaIds, message.mediaId];
    await prisma.session.update({
      where: { phoneNumber },
      data: {
        imageStorageUrls: newUrls,
        imageMediaIds: newMediaIds,
      },
    });

    const newCount = newUrls.length;

    // Acknowledge
    if (newCount === 1) {
      await waClient.sendText(phoneNumber, msgImageReceived(lang));
    } else {
      await waClient.sendText(phoneNumber, msgMultiImageReceived(lang, newCount));
    }

    // Schedule auto-advance (or reschedule if one is already pending)
    await scheduleImageTimeout(phoneNumber, newCount);

    // Auto-advance if at max capacity
    if (newCount >= MAX_IMAGES_PER_ORDER) {
      await advanceToStyle(session, user, waClient);
    }
    return;
  }

  // ---- TEXT / BUTTON — interpret as "done sending images" if we have at least one ----
  if (session.imageStorageUrls.length > 0) {
    const isDoneIntent =
      message.messageType === 'text' ||
      (message.messageType === 'interactive' && message.buttonReplyId);

    if (isDoneIntent) {
      await advanceToStyle(session, user, waClient);
      return;
    }
  }

  // ---- No images yet and non-image message ----
  await waClient.sendText(phoneNumber, msgUnknownMessage(lang));
}

// ---------------------------------------------------------------------------
// Called by the SessionTimeout worker when advance_images fires
// ---------------------------------------------------------------------------

export async function onImageBatchTimeout(
  phoneNumber: string,
  expectedImageCount: number,
  waClient: WhatsAppClient,
): Promise<void> {
  const session = await prisma.session.findUnique({ where: { phoneNumber } });
  if (!session) return;

  // Guard: only advance if still in AWAITING_IMAGES and count hasn't grown
  // (another job may have rescheduled and this is a stale fire)
  if (
    session.state !== 'AWAITING_IMAGES' ||
    session.imageStorageUrls.length < expectedImageCount
  ) {
    return;
  }

  const user = await prisma.user.findUnique({ where: { phoneNumber } });
  if (!user) return;

  await advanceToStyle(session, user, waClient);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function advanceToStyle(
  session: Session,
  user: User,
  waClient: WhatsAppClient,
): Promise<void> {
  if (session.imageStorageUrls.length === 0) {
    // Nothing to do
    return;
  }

  await transitionTo(session.phoneNumber, 'AWAITING_STYLE');
  const lang = (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en';
  await waClient.sendText(session.phoneNumber, msgAskStyle(lang));
  await sendStyleList(session.phoneNumber, lang, waClient);
}

/**
 * Download WhatsApp media and upload to Supabase Storage.
 * Returns the public storage URL.
 *
 * WhatsApp media URLs expire in ~5 minutes — this must be called immediately
 * after the webhook is received.
 */
async function downloadAndStore(
  mediaId: string,
  phoneNumber: string,
  index: number,
  waClient: WhatsAppClient,
): Promise<string> {
  // Step 1: Retrieve the download URL from the Graph API
  const accessToken = process.env['WHATSAPP_ACCESS_TOKEN'];
  const apiVersion = process.env['WHATSAPP_API_VERSION'] ?? 'v21.0';

  if (!accessToken) {
    throw new Error('WHATSAPP_ACCESS_TOKEN env var not set');
  }

  const mediaInfoRes = await fetch(
    `https://graph.facebook.com/${apiVersion}/${mediaId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!mediaInfoRes.ok) {
    throw new Error(
      `Failed to fetch media info for ${mediaId}: ${mediaInfoRes.status}`,
    );
  }

  const mediaInfo = (await mediaInfoRes.json()) as {
    url: string;
    mime_type: string;
  };

  // Step 2: Download the binary
  const downloadRes = await fetch(mediaInfo.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!downloadRes.ok) {
    throw new Error(`Failed to download media ${mediaId}: ${downloadRes.status}`);
  }

  const arrayBuffer = await downloadRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Derive extension from mime type
  const ext = mimeToExt(mediaInfo.mime_type);
  const path = `${phoneNumber}/${Date.now()}_${index}${ext}`;

  return uploadFile(Buckets.RAW_IMAGES, path, buffer, mediaInfo.mime_type);
}

/**
 * Enqueue a delayed BullMQ job to auto-advance to style selection.
 * Uses a deterministic job ID so scheduling again replaces the existing job.
 */
async function scheduleImageTimeout(
  phoneNumber: string,
  imageCount: number,
): Promise<void> {
  const queue = getSessionTimeoutQueue();
  const jobId = `img_timeout_${phoneNumber}`;

  try {
    // Remove any existing timeout job (reset the timer)
    const existing = await queue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }

    await queue.add(
      'advance_images',
      {
        phoneNumber,
        expectedState: 'AWAITING_IMAGES',
        action: 'advance_images',
      },
      {
        jobId,
        delay: IMAGE_BATCH_TIMEOUT_SECONDS * 1000,
        // Single attempt — worker checks state before acting
        attempts: 1,
      },
    );
  } catch (err) {
    // Non-fatal — worst case the user has to send a text to advance
    logger.warn('Failed to schedule image batch timeout', {
      phoneNumber,
      imageCount,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function mimeToExt(mimeType: string): string {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  return '.jpg';
}

/**
 * Session timeout handler.
 *
 * Handles:
 * - 'nudge': Gentle reminder after 10 min of inactivity
 * - 'expire': Reset session after 1 hour of inactivity
 * - 'advance_images': Legacy — auto-advance from AWAITING_IMAGES (V1)
 * - 'advance_photos': Auto-advance from AWAITING_PHOTO after 45s silence (V2)
 */

import type { Job } from 'bullmq';
import { prisma } from '@whatsads/db';
import { WhatsAppClient } from '@whatsads/whatsapp';
import { SessionTimeoutJobDataSchema } from '@whatsads/queue';
import { getConfig } from '../config.js';

export async function processSessionTimeout(job: Job): Promise<void> {
  const config = getConfig();
  const data = SessionTimeoutJobDataSchema.parse(job.data);

  const log = (msg: string) =>
    console.log(JSON.stringify({ job: job.id, phoneNumber: data.phoneNumber, action: data.action, msg }));

  // Get current session — check it's still in expected state
  const session = await prisma.session.findUnique({
    where: { phoneNumber: data.phoneNumber },
  });

  if (!session || session.state !== data.expectedState) {
    log('Session state changed, skipping timeout action');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { phoneNumber: data.phoneNumber },
  });
  const lang = (user?.language as 'hi' | 'en') || 'hi';

  const wa = new WhatsAppClient({
    accessToken: config.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
  });

  switch (data.action) {
    case 'nudge': {
      log('Sending nudge message');
      await wa.sendText(
        data.phoneNumber,
        lang === 'hi'
          ? 'Kya aap abhi busy hain? Koi baat nahi.\nJab time ho, sirf "Hi" bhejiye — main yahan hun.'
          : 'Are you busy right now? No problem.\nWhen ready, just send "Hi" — I\'m here.',
      );
      break;
    }

    case 'expire': {
      log('Expiring session');
      await prisma.session.update({
        where: { phoneNumber: data.phoneNumber },
        data: {
          state: 'IDLE',
          currentOrderId: null,
          styleSelection: null,
          voiceInstructions: null,
          imageMediaIds: [],
          imageStorageUrls: [],
          stateEnteredAt: new Date(),
        },
      });
      break;
    }

    case 'advance_images': {
      // V1 legacy — no-op in V2 flow; session state will not be AWAITING_IMAGES
      log('advance_images: legacy V1 job, skipping (state machine upgraded to V2)');
      break;
    }

    case 'advance_photos': {
      log('Auto-advancing from AWAITING_PHOTO to order creation');

      if (session.state !== 'AWAITING_PHOTO') {
        log('Session not in AWAITING_PHOTO, skipping');
        return;
      }

      if (session.imageStorageUrls.length === 0) {
        log('No photos collected, resetting to IDLE');
        await prisma.session.update({
          where: { phoneNumber: data.phoneNumber },
          data: { state: 'IDLE', stateEnteredAt: new Date() },
        });
        return;
      }

      // Delegate to the session package handler
      const { onPhotoBatchTimeout } = await import('@whatsads/session');
      await onPhotoBatchTimeout(
        data.phoneNumber,
        data.expectedImageCount ?? session.imageStorageUrls.length,
        wa,
      );
      break;
    }
  }
}

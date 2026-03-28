/**
 * Session timeout handler.
 *
 * Handles:
 * - 'nudge': Gentle reminder after 10 min of inactivity
 * - 'expire': Reset session after 1 hour of inactivity
 * - 'advance_images': Auto-advance from AWAITING_IMAGES after 60s silence
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
      log('Auto-advancing from image collection to style selection');

      // Check there are images to process
      if (session.imageStorageUrls.length === 0) {
        log('No images collected, resetting to IDLE');
        await prisma.session.update({
          where: { phoneNumber: data.phoneNumber },
          data: { state: 'IDLE', stateEnteredAt: new Date() },
        });
        return;
      }

      // Transition to style selection
      await prisma.session.update({
        where: { phoneNumber: data.phoneNumber },
        data: { state: 'AWAITING_STYLE', stateEnteredAt: new Date() },
      });

      // Send style selection prompt
      await wa.sendList(
        data.phoneNumber,
        lang === 'hi' ? 'Kaunsa style chahiye?' : 'Which style would you like?',
        lang === 'hi' ? 'Style chunein' : 'Choose style',
        [
          {
            title: 'Styles',
            rows: [
              { id: 'style_clean_white', title: lang === 'hi' ? 'Saaf White' : 'Clean White' },
              { id: 'style_lifestyle', title: lang === 'hi' ? 'Lifestyle' : 'Lifestyle' },
              { id: 'style_gradient', title: lang === 'hi' ? 'Gradient' : 'Gradient' },
              { id: 'style_festive', title: lang === 'hi' ? 'Festival' : 'Festival' },
              { id: 'style_minimal', title: lang === 'hi' ? 'Dark Minimal' : 'Dark Minimal' },
              { id: 'style_outdoor', title: lang === 'hi' ? 'Outdoor' : 'Outdoor' },
              { id: 'style_studio', title: lang === 'hi' ? 'Studio' : 'Studio' },
            ],
          },
        ],
      );
      break;
    }
  }
}

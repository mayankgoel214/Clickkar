/**
 * WhatsApp Cloud API webhook routes.
 *
 * GET  /webhooks/whatsapp — Meta verification challenge
 * POST /webhooks/whatsapp — Incoming messages and status updates
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WhatsAppClient, extractMessage, getMessageType, verifyWebhookSignature } from '@whatsads/whatsapp';
import type { WhatsAppWebhookBody } from '@whatsads/whatsapp';
import { handleIncomingMessage } from '@whatsads/session';
import type { MessageContext } from '@whatsads/session';
import { prisma } from '@whatsads/db';
import { getConfig } from '../../config.js';

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter: max 120 requests/minute per sender phone number
//
// NOTE: All WhatsApp webhooks originate from Meta's IP addresses, so using
// req.ip would bucket every user together. We key on the sender's phone number
// instead, extracted from the payload before rate-limiting.
// Status-only webhooks (no message) are skipped entirely.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, number[]>();

// Purge stale entries every 60 seconds to prevent unbounded memory growth.
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of rateLimitMap) {
    const fresh = timestamps.filter(t => t > cutoff);
    if (fresh.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, fresh);
    }
  }
  // Nuclear option: if the map is still enormous, clear it entirely.
  if (rateLimitMap.size > 10_000) {
    rateLimitMap.clear();
  }
}, 60_000).unref();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitMap.get(key) ?? []).filter(t => t > cutoff);
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

/**
 * Extract the sender's phone number from the raw webhook payload without
 * running the full extractMessage() logic. Returns null for status-only
 * payloads (delivery receipts etc.) that carry no message.
 */
function extractSenderPhone(body: unknown): string | null {
  try {
    const b = body as any;
    return b?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from ?? null;
  } catch {
    return null;
  }
}

export async function whatsappWebhookRoutes(app: FastifyInstance): Promise<void> {
  const config = getConfig();

  // -------------------------------------------------------------------------
  // GET — Meta verification challenge
  // -------------------------------------------------------------------------

  app.get('/webhooks/whatsapp', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN) {
      app.log.info('WhatsApp webhook verified');
      return reply.code(200).send(challenge);
    }

    return reply.code(403).send('Forbidden');
  });

  // -------------------------------------------------------------------------
  // POST — Incoming messages
  // -------------------------------------------------------------------------

  app.post('/webhooks/whatsapp', async (req: FastifyRequest, reply: FastifyReply) => {
    // Rate limiting: 120 req/min per sender phone number.
    // Status-only webhooks (no messages[0]) have no sender — skip rate limiting for those.
    const senderPhone = extractSenderPhone(req.body);
    if (senderPhone !== null && isRateLimited(senderPhone)) {
      app.log.warn({ phoneNumber: senderPhone }, 'WhatsApp webhook rate limit exceeded');
      return reply.code(429).send({ error: 'Too many requests', code: 'RATE_LIMITED' });
    }

    // Verify signature BEFORE responding — HMAC takes <1ms so this is safe.
    // Meta only requires the 200 within 20s; heavy processing still runs async below.
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (req as any).rawBody as string | undefined;

    if (config.NODE_ENV === 'production') {
      if (!signature || !rawBody) {
        app.log.warn('Missing signature or raw body');
        return reply.code(401).send({ error: 'Missing signature', code: 'UNAUTHORIZED' });
      }
      if (!verifyWebhookSignature(rawBody, signature, config.WHATSAPP_APP_SECRET)) {
        app.log.warn('Invalid WhatsApp webhook signature — rejecting request');
        return reply.code(401).send({ error: 'Invalid signature', code: 'UNAUTHORIZED' });
      }
    } else {
      // Development mode: skip verification when secret is the placeholder value.
      if (config.WHATSAPP_APP_SECRET === 'placeholder') {
        app.log.warn('WHATSAPP_APP_SECRET is placeholder — skipping signature verification in dev');
      } else if (!signature || !rawBody) {
        app.log.warn('Missing signature or raw body');
        return reply.code(401).send({ error: 'Missing signature', code: 'UNAUTHORIZED' });
      } else if (!verifyWebhookSignature(rawBody, signature, config.WHATSAPP_APP_SECRET)) {
        app.log.warn('Invalid WhatsApp webhook signature (dev mode — continuing anyway)');
      }
    }

    // Signature passed (or skipped in dev). Respond 200 immediately so Meta is
    // satisfied within its 20-second window. All DB writes and processing below
    // run asynchronously after the response is flushed.
    reply.code(200).send('OK');

    try {
      const body = req.body as WhatsAppWebhookBody;

      // Store raw event for debugging/audit
      await prisma.webhookEvent.create({
        data: {
          source: 'whatsapp',
          eventType: 'message',
          rawPayload: body as any,
        },
      }).catch((err: unknown) => app.log.error({ err }, 'Failed to store webhook event'));

      // Extract message
      const extracted = extractMessage(body);
      if (!extracted?.message) {
        // Status update or no message — skip
        return;
      }

      const { message } = extracted;
      const phoneNumber = message.from;
      const rawType = getMessageType(message);

      // Create WhatsApp client early so we can reply for unsupported message types
      const wa = new WhatsAppClient({
        accessToken: config.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
      });

      // Map to session-expected types
      const validTypes = ['text', 'image', 'audio', 'interactive', 'unknown'] as const;
      const messageType = validTypes.includes(rawType as any)
        ? (rawType as typeof validTypes[number])
        : 'unknown';

      // Unsupported message types (reactions, stickers, system messages, etc.) — tell the user
      if (!messageType || messageType === 'unknown') {
        app.log.debug('Ignoring unsupported message type: %s', rawType);
        // Don't leave the user hanging — tell them what we accept
        try {
          await wa.sendText(phoneNumber, '📸 I can only process photos and text messages. Please send a product photo to get started!');
        } catch { /* best effort */ }
        return;
      }

      // Build message context — access message fields via any cast since
      // the WhatsApp types use a union but we know the shape by type check
      const msg = message as any;
      const messageContext: MessageContext = {
        messageId: message.id,
        messageType,
        timestamp: parseInt(message.timestamp, 10),
        text: message.type === 'text' ? msg.text?.body : undefined,
        mediaId:
          message.type === 'image'
            ? msg.image?.id
            : message.type === 'audio'
              ? msg.audio?.id
              : undefined,
        caption: message.type === 'image' ? msg.image?.caption : undefined,
        isVoiceNote: message.type === 'audio' ? msg.audio?.voice === true : undefined,
        buttonReplyId:
          message.type === 'interactive' && msg.interactive?.type === 'button_reply'
            ? msg.interactive.button_reply?.id
            : undefined,
        listReplyId:
          message.type === 'interactive' && msg.interactive?.type === 'list_reply'
            ? msg.interactive.list_reply?.id
            : undefined,
      };

      // Mark as read
      wa.markAsRead(message.id).catch(() => {});

      // Route through session state machine
      await handleIncomingMessage(phoneNumber, messageContext, wa);
    } catch (err) {
      app.log.error({ err }, 'WhatsApp webhook processing error');
    }
  });
}

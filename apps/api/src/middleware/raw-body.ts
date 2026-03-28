/**
 * Fastify content type parser that preserves the raw request body
 * for webhook signature verification (WhatsApp + Razorpay).
 *
 * Both WhatsApp (X-Hub-Signature-256) and Razorpay (x-razorpay-signature)
 * require HMAC verification against the raw body bytes. If Fastify parses
 * JSON first and we re-serialize, the signature won't match.
 */

import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export function registerRawBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      const rawBody = typeof body === 'string' ? body : body.toString();
      // Attach raw body to request for signature verification
      (req as any).rawBody = rawBody;

      try {
        const json = JSON.parse(rawBody);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
}

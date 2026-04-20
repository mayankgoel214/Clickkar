/**
 * GET /admin/keypool            → health JSON for every provider pool
 * POST /admin/keypool/revive    → manually revive an auth-errored key
 *
 * Both routes require `x-admin-secret` in production.
 * Response NEVER includes the raw key — only masked hints.
 */

import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getConfig } from '../../config.js';
import { allHealth, hasKeyPool, reviveKey } from '@autmn/keypool';
import type { Provider } from '@autmn/keypool';

export async function adminKeypoolRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const config = getConfig();
    if (config.NODE_ENV === 'production') {
      const secret = req.headers['x-admin-secret'];
      const expected = config.ADMIN_SECRET ?? '';
      if (
        !secret ||
        !expected ||
        Buffer.byteLength(secret as string) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(secret as string), Buffer.from(expected))
      ) {
        return reply.code(403).send({ error: 'Forbidden', code: 'ADMIN_AUTH_REQUIRED' });
      }
    }
  });

  app.get('/admin/keypool', async (_req, reply) => {
    try {
      const health = allHealth();
      return reply.send(health);
    } catch (err) {
      app.log.error({ err }, 'Keypool health query failed');
      return reply.code(500).send({ error: 'keypool_health_failed' });
    }
  });

  app.post('/admin/keypool/revive', async (req, reply) => {
    const body = (req.body ?? {}) as { provider?: string; hint?: string };
    const provider = body.provider as Provider | undefined;
    const hint = body.hint;
    if (!provider || !hint) {
      return reply.code(400).send({ error: 'provider_and_hint_required' });
    }
    const allowed: Provider[] = ['gemini', 'fal', 'groq', 'sarvam'];
    if (!allowed.includes(provider)) {
      return reply.code(400).send({ error: 'unknown_provider', allowed });
    }
    if (!hasKeyPool(provider)) {
      return reply.code(404).send({ error: 'provider_not_configured', provider });
    }
    const revived = reviveKey(provider, hint);
    if (!revived) {
      return reply.code(404).send({ error: 'key_not_found', provider, hint });
    }
    app.log.info({ provider, hint }, 'Keypool: key manually revived');
    return reply.send({ ok: true, provider, hint });
  });
}

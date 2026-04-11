import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { getImageQueue, getPaymentCheckQueue, getSessionTimeoutQueue } from '@whatsads/queue';

export async function registerBullBoard(app: FastifyInstance): Promise<void> {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath('/admin/queues');

  // Auth guard: require x-admin-secret in production
  serverAdapter.setErrorHandler(undefined as any);
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith('/admin/queues')) return;
    if (process.env.NODE_ENV === 'production') {
      const secret = req.headers['x-admin-secret'];
      const expected = process.env.ADMIN_SECRET ?? '';
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

  createBullBoard({
    queues: [
      new BullMQAdapter(getImageQueue()),
      new BullMQAdapter(getPaymentCheckQueue()),
      new BullMQAdapter(getSessionTimeoutQueue()),
    ],
    serverAdapter,
  });

  await app.register(serverAdapter.registerPlugin(), {
    prefix: '/admin/queues',
  });
}

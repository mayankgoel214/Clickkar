/**
 * Admin routes for development/testing.
 * Reset test user data with: curl -X POST http://localhost:3001/admin/reset/PHONE_NUMBER
 */

import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from '../config.js';
import { prisma } from '@whatsads/db';
import { getRedisConnection } from '@whatsads/queue';
import { getStorageClient } from '@whatsads/storage';

/**
 * Parse a Supabase public storage URL into { bucket, path }.
 * URL format: {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
 * Returns null if the URL doesn't match the expected pattern.
 */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match || !match[1] || !match[2]) return null;
    return { bucket: match[1], path: match[2] };
  } catch {
    return null;
  }
}

/**
 * Delete a list of storage URLs from Supabase Storage.
 * Groups by bucket, deletes in bulk. Logs warnings on failure but does not throw.
 */
async function deleteStorageFiles(app: FastifyInstance, urls: string[]): Promise<void> {
  const storage = getStorageClient();
  const bucketMap = new Map<string, string[]>();

  for (const url of urls) {
    if (!url || url.startsWith('data:')) continue;
    const parsed = parseStorageUrl(url);
    if (!parsed) continue;
    const existing = bucketMap.get(parsed.bucket) ?? [];
    existing.push(parsed.path);
    bucketMap.set(parsed.bucket, existing);
  }

  for (const [bucket, paths] of bucketMap) {
    const { error } = await storage.storage.from(bucket).remove(paths);
    if (error) {
      app.log.warn({ bucket, paths, error: error.message }, 'Storage cleanup: failed to delete files (continuing)');
    } else {
      app.log.info({ bucket, count: paths.length }, 'Storage cleanup: deleted files');
    }
  }
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Auth guard: require x-admin-secret header in production
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


  // Flush stale bull queue keys
  app.post('/admin/flush-queue/:queueName', async (req: FastifyRequest, reply: FastifyReply) => {
    const { queueName } = req.params as { queueName: string };
    const redis = getRedisConnection();

    const ALLOWED_QUEUES = ['image-processing', 'payment-check', 'session-timeout'];
    if (!ALLOWED_QUEUES.includes(queueName)) {
      return reply.code(400).send({ error: 'Invalid queue name', allowed: ALLOWED_QUEUES });
    }

    try {
      const keys = await redis.keys(`bull:${queueName}:*`);
      app.log.info({ queueName, keyCount: keys.length }, 'Flushing queue keys');

      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of keys) { pipeline.del(key); }
        await pipeline.exec();
      }

      return reply.send({ ok: true, deleted: keys.length });
    } catch (err) {
      app.log.error({ err, queueName }, 'Flush failed');
      return reply.code(500).send({ ok: false, error: String(err) });
    }
  });

  app.post('/admin/reset/:phone', async (req: FastifyRequest, reply: FastifyReply) => {
    const { phone } = req.params as { phone: string };

    try {
      // Step 1: collect storage URLs from all orders before deleting DB records
      const orders = await prisma.order.findMany({
        where: { phoneNumber: phone },
        select: { inputImageUrls: true, outputImageUrls: true, cutoutUrls: true },
      });

      const allUrls: string[] = [];
      for (const order of orders) {
        allUrls.push(...order.inputImageUrls, ...order.outputImageUrls, ...order.cutoutUrls);
      }

      // Step 2: delete files from storage (non-fatal)
      if (allUrls.length > 0) {
        await deleteStorageFiles(app, allUrls);
      }

      // Step 3: delete DB records in dependency order
      const deleted = {
        imageJobs: (await prisma.imageJob.deleteMany({ where: { order: { phoneNumber: phone } } })).count,
        orders: (await prisma.order.deleteMany({ where: { phoneNumber: phone } })).count,
        sessions: (await prisma.session.deleteMany({ where: { phoneNumber: phone } })).count,
        users: (await prisma.user.deleteMany({ where: { phoneNumber: phone } })).count,
      };

      app.log.info({ phone, deleted, storageFilesDeleted: allUrls.length }, 'Test data reset');
      return reply.send({ ok: true, deleted });
    } catch (err) {
      app.log.error({ err, phone }, 'Reset failed');
      return reply.code(500).send({ ok: false, error: String(err) });
    }
  });
}

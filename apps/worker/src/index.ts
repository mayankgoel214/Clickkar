import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
loadEnv({ path: resolve(import.meta.dirname, '../../../.env'), override: true });

import { Worker } from 'bullmq';
import { getRedisConnection, QueueNames } from '@whatsads/queue';
import { prisma } from '@whatsads/db';
import { getConfig } from './config.js';
import { processImageJob } from './processors/image-processing.js';
import { processPaymentCheck } from './processors/payment-check.js';
import { processSessionTimeout } from './processors/session-timeout.js';

async function main() {
  const config = getConfig();

  if (config.NODE_ENV === 'production' && process.env.PAYMENT_BYPASS === 'true') {
    console.error('FATAL: PAYMENT_BYPASS must not be set in production');
    process.exit(1);
  }

  console.log(`Clickkar Worker starting (${config.NODE_ENV})`);

  // Each BullMQ Worker MUST have its own Redis connection
  const imageWorker = new Worker(
    QueueNames.IMAGE_PROCESSING,
    processImageJob,
    {
      connection: getRedisConnection().duplicate(),
      concurrency: 3,
      lockDuration: 600000, // 10 min — V2 pipeline with retries can take 7+ min
      limiter: { max: 10, duration: 60_000 },
    },
  );

  const paymentWorker = new Worker(
    QueueNames.PAYMENT_CHECK,
    processPaymentCheck,
    {
      connection: getRedisConnection().duplicate(),
      concurrency: 5,
    },
  );

  const sessionWorker = new Worker(
    QueueNames.SESSION_TIMEOUT,
    processSessionTimeout,
    {
      connection: getRedisConnection().duplicate(),
      concurrency: 10,
    },
  );

  // Error handlers
  const workers = [
    { name: 'image', worker: imageWorker },
    { name: 'payment', worker: paymentWorker },
    { name: 'session', worker: sessionWorker },
  ];

  for (const { name, worker } of workers) {
    worker.on('failed', (job, err) => {
      console.error(JSON.stringify({
        worker: name,
        jobId: job?.id,
        error: err.message,
        msg: 'Job failed',
      }));
    });

    worker.on('completed', (job) => {
      console.log(JSON.stringify({
        worker: name,
        jobId: job.id,
        msg: 'Job completed',
      }));
    });
  }

  console.log('All workers running');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down workers...`);

    await Promise.all(
      workers.map(({ name, worker }) =>
        worker.close().then(() => console.log(`${name} worker closed`)),
      ),
    );

    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});

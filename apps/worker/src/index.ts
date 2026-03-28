import { Worker } from 'bullmq';
import { getRedisConnection } from '@whatsads/queue';
import { QueueNames } from '@whatsads/queue';
import { getConfig } from './config.js';
import { processImageJob } from './processors/image-processing.js';
import { processPaymentCheck } from './processors/payment-check.js';
import { processSessionTimeout } from './processors/session-timeout.js';

async function main() {
  const config = getConfig();
  const connection = getRedisConnection();

  console.log(`WhatsAds Worker starting (${config.NODE_ENV})`);

  // Image processing worker — concurrency 3
  const imageWorker = new Worker(
    QueueNames.IMAGE_PROCESSING,
    processImageJob,
    {
      connection,
      concurrency: 3,
      limiter: { max: 10, duration: 60_000 }, // Max 10 jobs per minute
    },
  );

  // Payment check worker — concurrency 5
  const paymentWorker = new Worker(
    QueueNames.PAYMENT_CHECK,
    processPaymentCheck,
    {
      connection,
      concurrency: 5,
    },
  );

  // Session timeout worker — concurrency 10
  const sessionWorker = new Worker(
    QueueNames.SESSION_TIMEOUT,
    processSessionTimeout,
    {
      connection,
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

    connection.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});

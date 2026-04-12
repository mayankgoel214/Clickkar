import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const REDIS_URL = process.env['REDIS_URL'];

if (!REDIS_URL) {
  console.error(JSON.stringify({ event: 'clear_queue_error', error: 'REDIS_URL not set' }));
  process.exit(1);
}

const isTls = REDIS_URL.startsWith('rediss://');

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: isTls ? {} : undefined,
  retryStrategy(times: number) {
    return Math.min(times * 200, 3000);
  },
  enableReadyCheck: false,
  lazyConnect: false,
});

const QUEUE_NAMES = ['image-processing', 'payment-check', 'session-timeout'] as const;

async function main() {
  for (const name of QUEUE_NAMES) {
    const q = new Queue(name, { connection });
    try {
      const counts = await q.getJobCounts();
      console.log(JSON.stringify({ event: 'queue_before', queue: name, counts }));
      await q.obliterate({ force: true });
      console.log(JSON.stringify({ event: 'queue_cleared', queue: name }));
    } catch (err) {
      console.error(JSON.stringify({
        event: 'queue_clear_failed',
        queue: name,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      await q.close();
    }
  }

  await connection.quit();
  console.log(JSON.stringify({ event: 'all_queues_cleared' }));
  process.exit(0);
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'fatal_error', error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});

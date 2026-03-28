import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getConfig } from './config.js';
import { registerRawBodyParser } from './middleware/raw-body.js';
import { healthRoutes } from './routes/health.js';
import { whatsappWebhookRoutes } from './routes/webhooks/whatsapp.js';
import { razorpayWebhookRoutes } from './routes/webhooks/razorpay.js';
import { registerBullBoard } from './plugins/bull-board.js';

async function main() {
  const config = getConfig();

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Raw body parser must be registered BEFORE routes
  registerRawBodyParser(app);

  // Plugins
  await app.register(cors, { origin: true });

  // Routes
  await app.register(healthRoutes);
  await app.register(whatsappWebhookRoutes);
  await app.register(razorpayWebhookRoutes);

  // Bull Board (queue monitoring UI)
  try {
    await registerBullBoard(app);
    app.log.info('Bull Board mounted at /admin/queues');
  } catch (err) {
    app.log.warn({ err }, 'Failed to mount Bull Board — queue monitoring unavailable');
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info({ signal }, 'Shutting down...');
      await app.close();
      process.exit(0);
    });
  }

  // Start
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`WhatsAds API running on port ${config.PORT} (${config.NODE_ENV})`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

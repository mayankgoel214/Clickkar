import { z } from 'zod';

const isDev = process.env.NODE_ENV !== 'production';

const optionalInDev = (schema: z.ZodString) =>
  isDev ? schema.or(z.string().default('placeholder')) : schema;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // WhatsApp (for sending results back) — required in production, placeholder allowed in dev
  WHATSAPP_ACCESS_TOKEN: optionalInDev(z.string().min(1)),
  WHATSAPP_PHONE_NUMBER_ID: optionalInDev(z.string().min(1)),

  // AI services — required in production, placeholder allowed in dev
  FAL_KEY: optionalInDev(z.string().min(1)),
  GOOGLE_AI_API_KEY: optionalInDev(z.string().min(1)),
  GROQ_API_KEY: optionalInDev(z.string().min(1)),
  SARVAM_API_KEY: z.string().optional(),

  // Razorpay (for payment polling) — required in production, placeholder allowed in dev
  RAZORPAY_KEY_ID: optionalInDev(z.string().min(1)),
  RAZORPAY_KEY_SECRET: optionalInDev(z.string().min(1)),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),

  // Sentry — always optional
  SENTRY_DSN: z.string().optional(),
});

export type WorkerConfig = z.infer<typeof envSchema>;

let _config: WorkerConfig | null = null;

export function getConfig(): WorkerConfig {
  if (!_config) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid environment variables:');
      for (const issue of result.error.issues) {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`);
      }
      process.exit(1);
    }
    _config = result.data;
  }
  return _config;
}

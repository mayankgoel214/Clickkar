import { z } from 'zod';

const isDev = process.env.NODE_ENV !== 'production';

const optionalInDev = (schema: z.ZodString) =>
  isDev ? schema.or(z.string().default('placeholder')) : schema;

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // WhatsApp Cloud API — required in production, placeholder allowed in dev
  WHATSAPP_ACCESS_TOKEN: optionalInDev(z.string().min(1)),
  WHATSAPP_PHONE_NUMBER_ID: optionalInDev(z.string().min(1)),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).default('dev-verify-token'),
  WHATSAPP_APP_SECRET: optionalInDev(z.string().min(1)),

  // Razorpay — required in production, placeholder allowed in dev
  RAZORPAY_KEY_ID: optionalInDev(z.string().min(1)),
  RAZORPAY_KEY_SECRET: optionalInDev(z.string().min(1)),
  RAZORPAY_WEBHOOK_SECRET: optionalInDev(z.string().min(1)),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),

  // AI (validated in worker, optional here)
  FAL_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),

  // Sentry — always optional
  SENTRY_DSN: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
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

import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid PostgreSQL URL' }),
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid Redis URL' }),

  JWT_SECRET: z.string().min(32, { message: 'JWT_SECRET must be at least 32 characters' }),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_SECRET_PREVIOUS: z.string().optional(),

  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']),
  STELLAR_HORIZON_URL: z.string().url(),
  STELLAR_NETWORK_PASSPHRASE: z.string().min(1).optional(),

  PLATFORM_RECEIVING_ACCOUNT: z
    .string()
    .startsWith('G', { message: 'Must be a valid Stellar public key' }),

  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  CHECKOUT_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  REDIS_CURSOR_TTL_HOURS: z.coerce.number().int().positive().default(24),

  // Stellar auth secrets (network-dependent, at least one required in production)
  STELLAR_PLATFORM_SECRET_KEY: z.string().optional(),
  MAINNET_AUTH_SECRET_KEY: z.string().optional(),
  TESTNET_AUTH_SECRET_KEY: z.string().optional(),

  // Webhook worker
  WEBHOOK_POLL_MS: z.coerce.number().int().positive().default(250),
  WEBHOOK_MAX_CONCURRENCY: z.coerce.number().int().positive().default(100),
  WEBHOOK_WORKER_DISABLED: z.string().optional(),

  // Middleware
  PLATFORM_DOMAIN: z.string().url().default('http://localhost:3001'),
  CONTENT_SECURITY_POLICY: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

/** Keys that have Zod defaults — production must supply them explicitly. */
const DEFAULTED_KEYS: ReadonlyArray<keyof Config> = [
  'NODE_ENV',
  'PORT',
  'JWT_EXPIRES_IN',
  'FRONTEND_URL',
  'CHECKOUT_SESSION_TTL_MINUTES',
  'CHALLENGE_TTL_SECONDS',
  'REDIS_CURSOR_TTL_HOURS',
  'WEBHOOK_POLL_MS',
  'WEBHOOK_MAX_CONCURRENCY',
  'PLATFORM_DOMAIN',
  'CORS_ALLOWED_ORIGINS',
];

export function validate(rawEnv: Record<string, unknown>): Config {
  const result = configSchema.safeParse(rawEnv);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Config validation failed:\n${msg}`);
  }

  if (rawEnv.NODE_ENV === 'production') {
    const missing = DEFAULTED_KEYS.filter((k) => !(k in rawEnv));
    if (missing.length > 0) {
      throw new Error(
        `Production requires all config to be explicitly set. Missing: ${missing.join(', ')}`,
      );
    }
  } else if (rawEnv.NODE_ENV !== 'test') {
    const missing = DEFAULTED_KEYS.filter((k) => !(k in rawEnv));
    if (missing.length > 0) {
      console.warn(`[Config] Using defaults for: ${missing.join(', ')}`);
    }
  }

  return result.data;
}

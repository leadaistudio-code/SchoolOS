import { z } from 'zod'

/**
 * Single source of truth for configuration. Nothing in the codebase reads
 * process.env directly, so a missing or malformed variable fails loudly at
 * boot instead of at 2am in a payment webhook.
 */
const bool = z
  .string()
  .transform((v) => v === 'true' || v === '1')
  .pipe(z.boolean())

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('SchoolOS'),
  APP_ROOT_DOMAIN: z.string().default('lvh.me:3000'),
  APP_URL: z.string().default('http://lvh.me:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(720),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(10),

  REDIS_URL: z.string().optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.optional(),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(15),

  EMAIL_DRIVER: z.enum(['log', 'smtp', 'ses', 'resend']).default('log'),
  EMAIL_FROM: z.string().default('SchoolOS <no-reply@example.com>'),
  SMTP_URL: z.string().optional(),

  SMS_DRIVER: z.enum(['log', 'msg91', 'twilio']).default('log'),
  SMS_SENDER_ID: z.string().optional(),

  WHATSAPP_DRIVER: z.enum(['log', 'meta_cloud', 'gupshup']).default('log'),

  PAYMENT_DRIVER: z.enum(['mock', 'razorpay', 'stripe', 'cashfree']).default('mock'),
  PAYMENT_KEY_ID: z.string().optional(),
  PAYMENT_KEY_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),

  MAPS_DRIVER: z.enum(['none', 'google', 'mapbox']).default('none'),
  MAPS_API_KEY: z.string().optional(),

  AI_DRIVER: z.enum(['none', 'anthropic', 'openai']).default('none'),
  AI_API_KEY: z.string().optional(),

  RATE_LIMIT_DRIVER: z.enum(['memory', 'redis']).default('memory'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export type ServerEnv = z.infer<typeof serverSchema>

let cached: ServerEnv | null = null

/**
 * An env var set to the empty string means "not configured", not "configured
 * as an empty value". Without this, `FOO=` in a .env file parses as `''` — a
 * perfectly valid string — so `?? fallback` never fires and the empty value is
 * used. That bit us for real: an empty PAYMENT_WEBHOOK_SECRET silently became
 * the HMAC signing key, so every webhook signature verified against `''`.
 */
function withoutEmptyStrings(source: NodeJS.ProcessEnv): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== '') out[key] = value
  }
  return out
}

export function env(): ServerEnv {
  if (cached) return cached
  const parsed = serverSchema.safeParse(withoutEmptyStrings(process.env))
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  cached = parsed.data
  return cached
}

export const isProd = () => env().NODE_ENV === 'production'
export const isTest = () => env().NODE_ENV === 'test'

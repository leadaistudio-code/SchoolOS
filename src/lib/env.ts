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
  APP_NAME: z.string().default('MyCampusView'),
  APP_ROOT_DOMAIN: z.string().default('lvh.me:3000'),
  /**
   * Which half of the product this deployment serves. `both` is one service
   * answering for the website and every school; the other two exist so the two
   * halves can run as separate services off the same repository. Read by
   * middleware straight from process.env — the edge runtime has no zod parse.
   */
  APP_ROLE: z.enum(['both', 'app', 'marketing']).default('both'),
  APP_URL: z.string().default('http://lvh.me:3000'),
  /**
   * Where the website's "Sign in" should send people, when that cannot be
   * worked out from the address they are on.
   *
   * Normally it can: every school is a subdomain of `APP_ROOT_DOMAIN`, so the
   * website asks for the school's short name and builds the address. That
   * assumes the root domain has wildcard DNS, which a `*.up.railway.app`
   * hostname does not — no subdomain of it resolves, so the finder can only
   * produce dead addresses. Setting this replaces the finder with a redirect
   * to a single known sign-in page.
   *
   * Leave it unset once the real domain is attached and the finder works again.
   */
  APP_SIGN_IN_URL: z.string().url().optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /**
   * When true, tenant transactions issue `SET LOCAL app.tenant_id` so Postgres
   * RLS policies in prisma/rls.sql can see the current school. Leave false
   * unless you have applied rls.sql and connected as a non-owner role.
   */
  DATABASE_RLS: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),

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
  EMAIL_FROM: z.string().default('MyCampusView <no-reply@example.com>'),
  SMTP_URL: z.string().optional(),

  SMS_DRIVER: z.enum(['log', 'msg91', 'twilio']).default('log'),
  SMS_SENDER_ID: z.string().optional(),

  WHATSAPP_DRIVER: z.enum(['log', 'meta_cloud', 'gupshup']).default('log'),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  /** The sending number's id in the WhatsApp Business account, not the number. */
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  /**
   * Meta requires a pre-approved template in the Authentication category for
   * one-time codes; free-form text is rejected outside a 24-hour customer
   * window, which a password reset never has.
   */
  WHATSAPP_OTP_TEMPLATE: z.string().default('password_reset_otp'),
  WHATSAPP_OTP_TEMPLATE_LANG: z.string().default('en'),
  /** Authentication templates carry a copy-code button unless created without one. */
  WHATSAPP_OTP_COPY_BUTTON: bool.default('true'),

  /**
   * Applied when somebody types a local number. Parents enter ten digits, the
   * school record holds E.164, and the lookup has to reconcile the two.
   */
  DEFAULT_COUNTRY_CODE: z.string().default('+91'),

  PAYMENT_DRIVER: z.enum(['mock', 'razorpay', 'stripe', 'cashfree']).default('mock'),
  PAYMENT_KEY_ID: z.string().optional(),
  PAYMENT_KEY_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),

  MAPS_DRIVER: z.enum(['none', 'google', 'mapbox']).default('none'),
  MAPS_API_KEY: z.string().optional(),

  AI_DRIVER: z.enum(['none', 'anthropic', 'openai']).default('none'),
  AI_API_KEY: z.string().optional(),
  // The model the assistant runs on, pinned rather than latest-tracking: an
  // assistant that answers fee questions should not change behaviour because a
  // new model shipped on a Tuesday. Each driver has a default (see
  // server/assistant/providers); set this to whatever your key can reach.
  AI_MODEL: z.string().optional(),
  // For Azure OpenAI, a gateway, or a self-hosted OpenAI-compatible endpoint.
  AI_BASE_URL: z.string().url().optional(),
  // How hard the assistant is allowed to think per question. Answering "what is
  // outstanding in Class 9" from tool results does not need deep reasoning, and
  // a principal is waiting for the reply.
  AI_EFFORT: z.enum(['low', 'medium', 'high']).default('medium'),

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

/**
 * Railway "AWS SDK (Generic)" bucket connect injects AWS_* names. Map those
 * onto our S3_* keys when the latter are unset so either naming works.
 */
function withStorageAliases(source: Record<string, unknown>): Record<string, unknown> {
  return {
    ...source,
    S3_ENDPOINT:
      source.S3_ENDPOINT ?? source.AWS_ENDPOINT_URL ?? source.AWS_ENDPOINT_URL_S3,
    S3_REGION: source.S3_REGION ?? source.AWS_DEFAULT_REGION ?? source.AWS_REGION,
    S3_BUCKET: source.S3_BUCKET ?? source.AWS_S3_BUCKET_NAME ?? source.AWS_BUCKET_NAME,
    S3_ACCESS_KEY_ID: source.S3_ACCESS_KEY_ID ?? source.AWS_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: source.S3_SECRET_ACCESS_KEY ?? source.AWS_SECRET_ACCESS_KEY,
  }
}

export function env(): ServerEnv {
  if (cached) return cached
  const parsed = serverSchema.safeParse(
    withStorageAliases(withoutEmptyStrings(process.env)),
  )
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

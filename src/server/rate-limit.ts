import { env } from '@/lib/env'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitResult = {
  ok: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

/**
 * Fixed-window rate limiter.
 *
 * The in-memory driver is correct for a single instance and is the default in
 * development. Set RATE_LIMIT_DRIVER=redis in production behind more than one
 * instance; the interface is identical so call sites do not change.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  if (env().RATE_LIMIT_DRIVER === 'redis') {
    const redis = await getRedis()
    if (redis) return redisLimit(redis, key, limit, windowMs)
  }

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    sweep(now)
    return { ok: true, remaining: limit - 1, resetAt, retryAfterSeconds: 0 }
  }

  existing.count += 1
  const ok = existing.count <= limit
  return {
    ok,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: ok ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  }
}

function sweep(now: number) {
  if (buckets.size < 5000) return
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k)
}

// Redis is optional; the import is dynamic so the app runs without the client
// installed and simply falls back to the in-memory driver.
let redisClient: unknown | null | undefined
async function getRedis(): Promise<any | null> {
  if (redisClient !== undefined) return redisClient as any
  try {
    // Indirect specifier: ioredis is an optional peer, so it must not be a
    // static dependency of the type-check or the bundle.
    const specifier = 'ioredis'
    const mod: any = await import(/* webpackIgnore: true */ specifier).catch(() => null)
    redisClient = mod ? new (mod.default ?? mod)(env().REDIS_URL!) : null
  } catch {
    redisClient = null
  }
  return redisClient as any
}

async function redisLimit(
  redis: any,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redisKey = `rl:${key}`
  const count: number = await redis.incr(redisKey)
  if (count === 1) await redis.pexpire(redisKey, windowMs)
  const ttl: number = await redis.pttl(redisKey)
  const resetAt = Date.now() + Math.max(ttl, 0)
  const ok = count <= limit
  return {
    ok,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds: ok ? 0 : Math.ceil(Math.max(ttl, 0) / 1000),
  }
}

export const RATE_LIMITS = {
  login: { limit: 8, windowSeconds: 300 },
  passwordReset: { limit: 5, windowSeconds: 900 },
  api: { limit: 300, windowSeconds: 60 },
  mutation: { limit: 60, windowSeconds: 60 },
  webhook: { limit: 600, windowSeconds: 60 },
} as const

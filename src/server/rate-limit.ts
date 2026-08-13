import type Redis from 'ioredis'
import { env } from '@/lib/env'
import { getRedis } from '@/server/redis'

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
 * development. Set RATE_LIMIT_DRIVER=redis (and REDIS_URL) in production behind
 * more than one instance; the interface is identical so call sites do not change.
 *
 * If Redis is requested but unavailable, we fall back to memory and log once
 * so a Redis outage does not take sign-in offline.
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
    if (redis) {
      try {
        return await redisLimit(redis, key, limit, windowMs)
      } catch (err) {
        console.error('[rate-limit] redis failed; falling back to memory', err)
      }
    } else {
      warnRedisMissing()
    }
  }

  return memoryLimit(key, limit, windowMs, now)
}

function memoryLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitResult {
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

let warnedMissingRedis = false
function warnRedisMissing() {
  if (warnedMissingRedis) return
  warnedMissingRedis = true
  console.warn(
    '[rate-limit] RATE_LIMIT_DRIVER=redis but REDIS_URL is missing or unreachable; using in-memory buckets',
  )
}

/** Atomic INCR + PEXPIRE so the first hit always sets the window. */
const REDIS_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`

async function redisLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redisKey = `rl:${key}`
  const result = (await redis.eval(REDIS_LIMIT_LUA, 1, redisKey, String(windowMs))) as [
    number,
    number,
  ]
  const count = Number(result[0])
  const ttl = Number(result[1])
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
  passwordResetRequest: { limit: 3, windowSeconds: 3600 },
  api: { limit: 300, windowSeconds: 60 },
  mutation: { limit: 60, windowSeconds: 60 },
  webhook: { limit: 600, windowSeconds: 60 },
} as const

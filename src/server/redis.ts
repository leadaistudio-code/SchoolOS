import Redis from 'ioredis'
import { env } from '@/lib/env'

let client: Redis | null | undefined

/**
 * Shared Redis connection. Returns null when REDIS_URL is unset or the
 * driver is not redis — call sites must fall back to local behaviour.
 */
export async function getRedis(): Promise<Redis | null> {
  if (client !== undefined) return client

  const url = env().REDIS_URL
  if (!url) {
    client = null
    return null
  }

  try {
    const redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    })
    await redis.connect()
    client = redis
    return client
  } catch (err) {
    console.error('[redis] failed to connect; continuing without Redis', err)
    client = null
    return null
  }
}

/** Reset the singleton — used by tests. */
export function resetRedisForTests() {
  client = undefined
}

export function redisConfigured(): boolean {
  return Boolean(env().REDIS_URL)
}

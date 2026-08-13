import { getRedis } from '@/server/redis'

/**
 * Small JSON cache over Redis. No-ops when Redis is unavailable so call sites
 * can treat it as a best-effort speed-up, never a correctness dependency.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedis()
  if (!redis) return null
  try {
    const raw = await redis.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = await getRedis()
  if (!redis) return
  try {
    await redis.set(key, JSON.stringify(value), 'EX', Math.max(1, ttlSeconds))
  } catch (err) {
    console.error('[cache] set failed', key, err)
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const redis = await getRedis()
  if (!redis) return
  try {
    await redis.del(...keys)
  } catch (err) {
    console.error('[cache] del failed', keys, err)
  }
}

export function entitlementsCacheKey(tenantId: string) {
  return `entitlements:${tenantId}`
}

export function tenantHostCacheKey(host: string) {
  return `tenant:host:${host.toLowerCase()}`
}

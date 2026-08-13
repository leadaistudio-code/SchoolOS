import { describe, expect, it } from 'vitest'
import { rateLimit } from '../src/server/rate-limit'
import { entitlementsCacheKey, tenantHostCacheKey } from '../src/server/cache'

describe('rate limit memory driver', () => {
  it('allows up to the limit then blocks', async () => {
    const key = `test:memory:${Date.now()}:${Math.random()}`
    const first = await rateLimit(key, 2, 60)
    const second = await rateLimit(key, 2, 60)
    const third = await rateLimit(key, 2, 60)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(third.ok).toBe(false)
    expect(third.retryAfterSeconds).toBeGreaterThan(0)
  })
})

describe('cache key helpers', () => {
  it('namespaces entitlement and host keys', () => {
    expect(entitlementsCacheKey('tenant_1')).toBe('entitlements:tenant_1')
    expect(tenantHostCacheKey('Demo.School.com')).toBe('tenant:host:demo.school.com')
  })
})

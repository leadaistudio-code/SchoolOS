import { describe, expect, it } from 'vitest'
import { checkPasswordPolicy } from '../src/server/auth/password'
import { hostToSlug } from '../src/server/tenant'
import { listQuerySchema, orderByFrom, skipTake, MAX_PAGE_SIZE } from '../src/lib/query'
import { studentCreateSchema } from '../src/server/modules/students/schema'
import { contrastOn, formatMoney } from '../src/lib/utils'
import { decryptSecret, encryptSecret, hmacSha256, sha256 } from '../src/server/crypto'
import { rateLimit } from '../src/server/rate-limit'

describe('password policy', () => {
  it('accepts a strong password', () => {
    expect(checkPasswordPolicy('Password@123')).toEqual([])
  })

  it('rejects weak passwords with actionable messages', () => {
    expect(checkPasswordPolicy('short1A')).toContain('Must be at least 10 characters')
    expect(checkPasswordPolicy('alllowercase1')).toContain('Must contain an uppercase letter')
    expect(checkPasswordPolicy('ALLUPPERCASE1')).toContain('Must contain a lowercase letter')
    expect(checkPasswordPolicy('NoDigitsHere')).toContain('Must contain a number')
  })
})

describe('tenant host resolution', () => {
  it('maps a subdomain to a tenant slug', () => {
    expect(hostToSlug('demo.lvh.me:3000')).toBe('demo')
    expect(hostToSlug('greenwood.lvh.me')).toBe('greenwood')
  })

  it('returns null for the platform host itself', () => {
    expect(hostToSlug('lvh.me:3000')).toBeNull()
    expect(hostToSlug(null)).toBeNull()
  })

  it('refuses reserved subdomains so they cannot be claimed as tenants', () => {
    expect(hostToSlug('www.lvh.me')).toBeNull()
    expect(hostToSlug('api.lvh.me')).toBeNull()
    expect(hostToSlug('admin.lvh.me')).toBeNull()
  })

  it('does not resolve an unrelated host', () => {
    expect(hostToSlug('evil.example.com')).toBeNull()
  })
})

describe('list query contract', () => {
  it('applies safe defaults', () => {
    const q = listQuerySchema.parse({})
    expect(q.page).toBe(1)
    expect(q.pageSize).toBe(25)
    expect(q.dir).toBe('asc')
  })

  it('caps page size so a client cannot request the whole table', () => {
    expect(() => listQuerySchema.parse({ pageSize: MAX_PAGE_SIZE + 1 })).toThrow()
  })

  it('computes skip and take', () => {
    expect(skipTake({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 })
  })

  it('ignores a sort field that is not whitelisted', () => {
    const allowed = ['firstName', 'createdAt'] as const
    const fallback = { firstName: 'asc' as const }

    expect(orderByFrom('createdAt', 'desc', allowed, fallback)).toEqual({ createdAt: 'desc' })
    // An injection attempt falls back rather than reaching the query planner.
    expect(orderByFrom('password); DROP TABLE', 'desc', allowed, fallback)).toEqual(fallback)
  })
})

describe('student validation', () => {
  const valid = {
    admissionNo: 'DIS/2025/0001',
    firstName: 'Aarav',
    lastName: 'Sharma',
    classLevelId: 'cls_1',
    sectionId: 'sec_1',
  }

  it('accepts a minimal valid student', () => {
    expect(studentCreateSchema.parse(valid).firstName).toBe('Aarav')
  })

  it('requires a class placement', () => {
    expect(() => studentCreateSchema.parse({ ...valid, classLevelId: '' })).toThrow()
  })

  it('rejects an admission number with unsafe characters', () => {
    expect(() => studentCreateSchema.parse({ ...valid, admissionNo: 'DIS 2025;DROP' })).toThrow()
  })

  it('rejects a date of birth in the future', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(() => studentCreateSchema.parse({ ...valid, dateOfBirth: future })).toThrow()
  })

  it('rejects a malformed guardian email', () => {
    expect(() =>
      studentCreateSchema.parse({
        ...valid,
        guardian: { firstName: 'Manoj', lastName: 'Sharma', email: 'not-an-email' },
      }),
    ).toThrow()
  })
})

describe('crypto', () => {
  it('round-trips an encrypted secret', () => {
    const secret = 'rzp_live_super_secret_key'
    const sealed = encryptSecret(secret)

    expect(sealed).not.toContain(secret)
    expect(decryptSecret(sealed)).toBe(secret)
  })

  it('produces a different ciphertext each time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })

  it('fails loudly on a tampered payload', () => {
    const sealed = encryptSecret('value')
    const [iv, tag, data] = sealed.split('.')

    // Flip a real ciphertext byte; GCM authentication must reject it.
    const bytes = Buffer.from(data!, 'base64')
    bytes[0] = bytes[0]! ^ 0xff
    expect(() => decryptSecret(`${iv}.${tag}.${bytes.toString('base64')}`)).toThrow()

    // A forged authentication tag must be rejected too.
    const forgedTag = Buffer.alloc(16, 7).toString('base64')
    expect(() => decryptSecret(`${iv}.${forgedTag}.${data}`)).toThrow()
  })

  it('hashes deterministically for lookups', () => {
    expect(sha256('token')).toBe(sha256('token'))
    expect(sha256('token')).not.toBe(sha256('token2'))
  })

  it('signs webhook payloads reproducibly', () => {
    expect(hmacSha256('{"a":1}', 'secret')).toBe(hmacSha256('{"a":1}', 'secret'))
    expect(hmacSha256('{"a":1}', 'secret')).not.toBe(hmacSha256('{"a":2}', 'secret'))
  })
})

describe('rate limiting', () => {
  it('allows up to the limit then blocks', async () => {
    const key = `test-${Math.random()}`

    for (let i = 0; i < 3; i++) {
      expect((await rateLimit(key, 3, 60)).ok).toBe(true)
    }

    const blocked = await rateLimit(key, 3, 60)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('keeps buckets independent', async () => {
    const a = `a-${Math.random()}`
    const b = `b-${Math.random()}`

    await rateLimit(a, 1, 60)
    expect((await rateLimit(a, 1, 60)).ok).toBe(false)
    expect((await rateLimit(b, 1, 60)).ok).toBe(true)
  })
})

describe('presentation helpers', () => {
  it('formats money from minor units', () => {
    expect(formatMoney(1250000, 'INR')).toContain('12,500')
  })

  it('picks a readable text colour for any brand colour', () => {
    expect(contrastOn('#0f172a')).toBe('#ffffff')
    expect(contrastOn('#fde047')).toBe('#0b0f17')
  })
})

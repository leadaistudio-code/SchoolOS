import { describe, expect, it } from 'vitest'
import { generateTotpSecret, totpCode, verifyTotp, totpOtpauthUrl } from '../src/server/auth/totp'
import { tenantRlsSetLocalSql, TenantIsolationError } from '../src/server/db/tenant-client'

describe('TOTP helpers', () => {
  it('verifies a code generated for the same secret', () => {
    const secret = generateTotpSecret()
    const code = totpCode(secret)
    expect(verifyTotp(secret, code)).toBe(true)
    expect(verifyTotp(secret, '000000')).toBe(false)
  })

  it('builds an otpauth URL', () => {
    const url = totpOtpauthUrl({
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'admin@school.edu',
      issuer: 'MyCampusView',
    })
    expect(url).toContain('otpauth://totp/')
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP')
  })
})

describe('RLS SET LOCAL helper', () => {
  it('emits set_config for a cuid tenant id', () => {
    expect(tenantRlsSetLocalSql('clxxxxxxxxxxxxxxxxxxxx')).toContain("set_config('app.tenant_id'")
  })

  it('rejects unsafe tenant ids', () => {
    expect(() => tenantRlsSetLocalSql("';'; DROP TABLE")).toThrow(TenantIsolationError)
  })
})

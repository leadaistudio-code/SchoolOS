import { describe, expect, it } from 'vitest'
import { addDomainSchema } from '../src/server/modules/domains/schema'

describe('domain validation', () => {
  it('accepts a valid domain', () => {
    expect(addDomainSchema.parse({ host: 'erp.school.com' }).host).toBe('erp.school.com')
  })

  it('rejects an invalid domain', () => {
    expect(() => addDomainSchema.parse({ host: 'not-a-domain' })).toThrow()
    expect(() => addDomainSchema.parse({ host: 'http://school.com' })).toThrow()
    expect(() => addDomainSchema.parse({ host: 'school.com/path' })).toThrow()
  })

  it('lowercases the domain', () => {
    expect(addDomainSchema.parse({ host: 'ERP.School.com' }).host).toBe('erp.school.com')
  })
})

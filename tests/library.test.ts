import { describe, expect, it } from 'vitest'
import { FINE_PER_DAY_MINOR, issueLoanSchema } from '../src/server/modules/library/schema'

describe('library', () => {
  it('requires a borrower on issue', () => {
    expect(() =>
      issueLoanSchema.parse({
        bookId: 'clxxxxxxxxxxxxxxxxxxxxxxxx',
        dueOn: new Date().toISOString(),
      }),
    ).toThrow()
  })

  it('uses ₹5 per day fine in paise', () => {
    expect(FINE_PER_DAY_MINOR).toBe(500)
    expect((3 * FINE_PER_DAY_MINOR) / 100).toBe(15)
  })
})

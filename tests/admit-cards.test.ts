import { describe, expect, it } from 'vitest'
import { admitCardApproveSchema } from '../src/server/modules/exams/admit-cards'

describe('admit card fee exceptions', () => {
  it('allows a normal approval without an exception reason', () => {
    expect(admitCardApproveSchema.parse({ id: 'card-1' })).toEqual({ id: 'card-1' })
  })

  it('keeps a meaningful trimmed exception reason', () => {
    expect(admitCardApproveSchema.parse({
      id: 'card-1',
      feeOverrideReason: '  Principal-approved hardship case  ',
    }).feeOverrideReason).toBe('Principal-approved hardship case')
  })

  it('rejects an unusably short exception reason', () => {
    expect(admitCardApproveSchema.safeParse({
      id: 'card-1',
      feeOverrideReason: 'x',
    }).success).toBe(false)
  })
})

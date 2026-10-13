import { describe, expect, it } from 'vitest'
import {
  installmentDatesSchema,
  installmentIssueDate,
  invoiceDatesSchema,
  issueDateFor,
} from '@/server/modules/finance/simplicity'

const day = (value: string) => new Date(`${value}T00:00:00.000Z`)
const iso = (value: Date) => value.toISOString().slice(0, 10)

describe('invoice generation dates', () => {
  it('generates in the due month when the generation day is on or before the due day', () => {
    expect(iso(issueDateFor(day('2026-04-10'), 1))).toBe('2026-04-01')
    expect(iso(issueDateFor(day('2026-04-10'), 10))).toBe('2026-04-10')
  })

  it('generates in the month before when the generation day is after the due day', () => {
    expect(iso(issueDateFor(day('2026-04-10'), 25))).toBe('2026-03-25')
    expect(iso(issueDateFor(day('2027-01-05'), 20))).toBe('2026-12-20')
  })

  it('defaults to the 1st of the due month when no generation date is set', () => {
    expect(iso(installmentIssueDate({ issueOn: null, dueOn: day('2026-06-15') }))).toBe('2026-06-01')
    expect(iso(installmentIssueDate({ issueOn: day('2026-05-28'), dueOn: day('2026-06-15') }))).toBe('2026-05-28')
  })

  it('rejects a due date before the generation date', () => {
    expect(installmentDatesSchema.safeParse({
      structureId: 's1',
      rows: [{ installmentId: 'i1', issueOn: '2026-04-12', dueOn: '2026-04-10' }],
    }).success).toBe(false)
    expect(installmentDatesSchema.safeParse({
      structureId: 's1',
      rows: [{ installmentId: 'i1', issueOn: '2026-03-25', dueOn: '2026-04-10' }],
      applyToInvoices: true,
    }).success).toBe(true)
    expect(invoiceDatesSchema.safeParse({ invoiceId: 'x', issuedOn: '2026-04-11', dueOn: '2026-04-10' }).success).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  calculateAttendanceDeduction,
  payslipGenerateSchema,
} from '../src/server/modules/staff/payroll'

describe('payroll attendance deductions', () => {
  it('deducts absence, half-days, and one day per three late marks', () => {
    const result = calculateAttendanceDeduction(3_000_000, {
      present: 20,
      late: 6,
      halfDay: 2,
      leave: 1,
      absent: 1,
    })

    expect(result).toEqual({
      workingDays: 30,
      paidDays: 26,
      latePenaltyDays: 2,
      lossOfPayDays: 4,
      lopMinor: 400_000,
    })
  })

  it('does not deduct an incomplete group of late marks', () => {
    const result = calculateAttendanceDeduction(220_000, {
      present: 20,
      late: 2,
      halfDay: 0,
      leave: 0,
      absent: 0,
    })

    expect(result.latePenaltyDays).toBe(0)
    expect(result.lopMinor).toBe(0)
    expect(result.paidDays).toBe(22)
  })

  it('does not invent loss of pay when attendance was not marked', () => {
    expect(calculateAttendanceDeduction(500_000, {
      present: 0,
      late: 0,
      halfDay: 0,
      leave: 0,
      absent: 0,
    })).toMatchObject({
      workingDays: 0,
      paidDays: 0,
      lopMinor: 0,
    })
  })
})

describe('manual payslip deductions', () => {
  const base = {
    staffId: 'staff-1',
    periodYear: 2026,
    periodMonth: 9,
    bonus: 0,
  }

  it('requires a reason for a manual deduction', () => {
    const result = payslipGenerateSchema.safeParse({
      ...base,
      manualDeduction: 500,
    })

    expect(result.success).toBe(false)
  })

  it('stores form amounts in minor units', () => {
    const result = payslipGenerateSchema.parse({
      ...base,
      manualDeduction: 500,
      manualDeductionReason: 'Salary advance recovery',
    })

    expect(result.manualDeduction).toBe(50_000)
  })
})

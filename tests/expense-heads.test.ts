import { describe, expect, it } from 'vitest'
import { DEFAULT_EXPENSE_HEADS } from '@/server/modules/finance/expense-heads'
import { expenseFilterSchema } from '@/server/modules/finance/expenses'
import { EXPENSE_CATEGORIES as CHART_CATEGORIES } from '@/server/modules/accounts/chart'

describe('default expense heads', () => {
  it('has unique names', () => {
    const names = DEFAULT_EXPENSE_HEADS.map((h) => h.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it('has exactly one primary head per chart category, so older expenses have a home', () => {
    for (const category of CHART_CATEGORIES) {
      const primaries = DEFAULT_EXPENSE_HEADS.filter((h) => h.primary && h.category === category)
      expect(primaries, category).toHaveLength(1)
    }
  })

  it('offers both direct and indirect heads, splitting salaries by role', () => {
    expect(DEFAULT_EXPENSE_HEADS.some((h) => h.nature === 'DIRECT')).toBe(true)
    expect(DEFAULT_EXPENSE_HEADS.some((h) => h.nature === 'INDIRECT')).toBe(true)
    const salaries = DEFAULT_EXPENSE_HEADS.filter((h) => h.category === 'SALARY')
    expect(salaries.map((h) => h.nature).sort()).toEqual(['DIRECT', 'INDIRECT'])
  })
})

describe('expense filters', () => {
  it('ignores empty and invalid values instead of failing the page', () => {
    expect(expenseFilterSchema.parse({ nature: '', paymentMode: 'BITCOIN', from: 'yesterday', headId: '' })).toEqual({})
  })

  it('keeps valid filters', () => {
    expect(expenseFilterSchema.parse({ nature: 'DIRECT', preset: 'fy', from: '2026-04-01' })).toEqual({
      nature: 'DIRECT',
      preset: 'fy',
      from: '2026-04-01',
    })
  })
})

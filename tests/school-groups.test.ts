import { describe, expect, it } from 'vitest'
import { tenantDb, TenantIsolationError } from '../src/server/db/tenant-client'
import { combine, withTotals, type Figures } from '../src/server/modules/group/figures'
import { NAVIGATION, visibleNavigation } from '../src/lib/navigation'

const school = (over: Partial<Figures>): Figures => ({
  students: 0,
  admissions: 0,
  teachingStaff: 0,
  otherStaff: 0,
  monthlySalaryBillMinor: 0,
  attendanceMarked: 0,
  attendancePresent: 0,
  feesMinor: 0,
  refundsMinor: 0,
  otherIncomeMinor: 0,
  directExpenseMinor: 0,
  indirectExpenseMinor: 0,
  salariesMinor: 0,
  outstandingMinor: 0,
  overdueMinor: 0,
  ...over,
})

describe('group figures', () => {
  it('adds two schools together', () => {
    const total = combine([
      school({ students: 10, teachingStaff: 3, otherStaff: 1, feesMinor: 100_000 }),
      school({ students: 10, teachingStaff: 2, otherStaff: 2, feesMinor: 50_000 }),
    ])
    expect(total.students).toBe(20)
    expect(total.staff).toBe(8)
    expect(total.incomeMinor).toBe(150_000)
  })

  it('takes refunds off income and counts salaries as a cost', () => {
    const t = withTotals(
      school({ feesMinor: 100_000, refundsMinor: 10_000, otherIncomeMinor: 5_000, directExpenseMinor: 20_000, indirectExpenseMinor: 5_000, salariesMinor: 40_000 }),
    )
    expect(t.incomeMinor).toBe(95_000)
    expect(t.costMinor).toBe(65_000)
    expect(t.profitMinor).toBe(30_000)
    expect(t.marginPct).toBe(31.6)
  })

  it('reports a loss and no margin when there is no income', () => {
    const t = withTotals(school({ indirectExpenseMinor: 1_000 }))
    expect(t.profitMinor).toBe(-1_000)
    expect(t.marginPct).toBeNull()
    expect(t.attendancePct).toBeNull()
  })
})

describe('group overview access', () => {
  it('refuses group tables on the school-bound client', async () => {
    const db = tenantDb('tenant_should_not_see_groups')
    await expect(db.schoolGroup.findMany()).rejects.toBeInstanceOf(TenantIsolationError)
    await expect(db.schoolGroupOwner.findMany()).rejects.toBeInstanceOf(TenantIsolationError)
  })

  it('shows the sidebar entry only to a group owner, whatever their permissions', () => {
    const everything = { can: () => true, hasFeature: () => true }
    const has = (items: ReturnType<typeof visibleNavigation>) => items.some((i) => i.href === '/group')
    expect(has(visibleNavigation(NAVIGATION, everything))).toBe(false)
    expect(has(visibleNavigation(NAVIGATION, { ...everything, isGroupOwner: true }))).toBe(true)
  })
})

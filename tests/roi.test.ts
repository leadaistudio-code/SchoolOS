import { describe, expect, it } from 'vitest'
import { ASSUMPTIONS, defaultInputs, leakageRate } from '../src/lib/roi/assumptions'
import { calculateRoi, headline, hourlyCost, monthlyTechnologySpend } from '../src/lib/roi/calculator'
import { formatInr, formatInrCompact, formatPercent } from '../src/lib/roi/format'
import { roiInputsSchema } from '../src/lib/roi/validation'
import type { RoiInputs } from '../src/lib/roi/types'

/** A blank school: nothing entered, so nothing may be claimed. */
function emptyInputs(): RoiInputs {
  const base = defaultInputs()
  return {
    ...base,
    profile: { ...base.profile, teachers: 0, adminStaff: 0, admissionStaff: 0 },
    attendance: { ...base.attendance, minutesPerDay: 0, dailyUsers: 0 },
    admissions: { ...base.admissions, enquiriesPerMonth: 0, admissionsPerMonth: 0, staffHoursPerDay: 0 },
    fees: { ...base.fees, staffHoursPerMonth: 0, overdueAmount: 0 },
    reporting: { reportsPerMonth: 0, minutesPerReport: 0 },
    questionPapers: { papersPerTeacherPerMonth: 0, minutesPerPaper: 0 },
    communication: { staffHoursPerWeek: 0 },
  }
}

const expected = ASSUMPTIONS.EXPECTED
const conservative = ASSUMPTIONS.CONSERVATIVE

describe('hourly cost', () => {
  it('divides salary by contracted hours', () => {
    // 26,000 over 26 days of 8 hours is exactly 125/hr.
    expect(hourlyCost(26_000, 26, 8)).toBe(125)
  })

  it('never divides by zero days or hours', () => {
    expect(hourlyCost(26_000, 0, 8)).toBeGreaterThan(0)
    expect(Number.isFinite(hourlyCost(26_000, 26, 0))).toBe(true)
  })

  it('treats a missing salary as no cost rather than NaN', () => {
    expect(hourlyCost(Number.NaN, 26, 8)).toBe(0)
  })
})

describe('technology spend', () => {
  it('normalises an annual licence to a monthly figure', () => {
    const inputs = defaultInputs()
    inputs.technology.currentErpCost = 120_000
    inputs.technology.currentErpBilling = 'ANNUAL'
    inputs.technology.tools = []
    expect(monthlyTechnologySpend(inputs)).toBe(10_000)
  })

  it('leaves a monthly licence alone', () => {
    const inputs = defaultInputs()
    inputs.technology.currentErpCost = 10_000
    inputs.technology.currentErpBilling = 'MONTHLY'
    inputs.technology.tools = []
    expect(monthlyTechnologySpend(inputs)).toBe(10_000)
  })

  it('adds every additional tool', () => {
    const inputs = defaultInputs()
    inputs.technology.currentErpCost = 0
    inputs.technology.tools = [
      { key: 'crm', label: 'CRM', monthlyCost: 4000 },
      { key: 'sms', label: 'SMS', monthlyCost: 1500 },
    ]
    expect(monthlyTechnologySpend(inputs)).toBe(5500)
  })
})

describe('attendance saving', () => {
  it('follows minutes × classes × school days ÷ 60, reduced by the factor', () => {
    const inputs = emptyInputs()
    inputs.attendance = { method: 'PAPER', minutesPerDay: 6, dailyUsers: 30 }
    inputs.working = { daysPerMonth: 26, hoursPerDay: 8, schoolDaysPerMonth: 22 }
    inputs.profile.teacherSalary = 26_000

    const result = calculateRoi(inputs, expected)
    const line = result.lines.find((l) => l.id === 'attendance')!

    // 6 × 30 × 22 / 60 = 66 hrs, × 0.62 = 40.92 hrs, × ₹125 = ₹5,115.
    expect(line.hours).toBeCloseTo(40.92, 2)
    expect(line.amount).toBeCloseTo(5115, 0)
  })

  it('saves far less when the school already runs an ERP', () => {
    const inputs = emptyInputs()
    inputs.attendance = { method: 'PAPER', minutesPerDay: 6, dailyUsers: 30 }
    const onPaper = calculateRoi(inputs, expected).hoursSavedPerMonth

    inputs.attendance.method = 'EXISTING_ERP'
    const onErp = calculateRoi(inputs, expected).hoursSavedPerMonth

    expect(onErp).toBeLessThan(onPaper)
  })

  it('never claims the whole task disappears', () => {
    for (const scenario of Object.values(ASSUMPTIONS)) {
      for (const factor of Object.values(scenario.attendanceEfficiency)) {
        expect(factor).toBeLessThan(1)
      }
    }
  })
})

describe('reporting saving', () => {
  it('follows reports × minutes ÷ 60, reduced by the factor', () => {
    const inputs = emptyInputs()
    inputs.reporting = { reportsPerMonth: 10, minutesPerReport: 60 }
    inputs.profile.adminSalary = 26_000

    const result = calculateRoi(inputs, expected)
    const line = result.lines.find((l) => l.id === 'reporting')!

    // 10 hrs × 0.7 = 7 hrs × ₹125 = ₹875.
    expect(line.hours).toBeCloseTo(7, 5)
    expect(line.amount).toBeCloseTo(875, 5)
  })
})

describe('question papers', () => {
  it('is priced at the teacher rate and labelled as productivity, not salary', () => {
    const inputs = emptyInputs()
    inputs.profile.teachers = 10
    inputs.profile.teacherSalary = 26_000
    inputs.questionPapers = { papersPerTeacherPerMonth: 2, minutesPerPaper: 90 }

    const result = calculateRoi(inputs, expected)
    const line = result.lines.find((l) => l.id === 'question-papers')!

    // 10 × 2 × 90 / 60 = 30 hrs, × 0.5 = 15 hrs × ₹125 = ₹1,875.
    expect(line.hours).toBeCloseTo(15, 5)
    expect(line.amount).toBeCloseTo(1875, 5)
    expect(line.category).toBe('PRODUCTIVITY')
  })
})

describe('software consolidation', () => {
  it('claims only the share the school says is replaced', () => {
    const inputs = emptyInputs()
    inputs.technology.currentErpCost = 20_000
    inputs.technology.currentErpBilling = 'MONTHLY'
    inputs.technology.tools = []
    inputs.technology.replacedShare = 0.5

    const result = calculateRoi(inputs, expected)
    expect(result.monthlyHardSavings).toBe(10_000)
  })

  it('is the only category counted as a hard saving', () => {
    const result = calculateRoi(defaultInputs(), expected)
    const hard = result.lines.filter((l) => l.category === 'HARD')
    expect(hard.every((l) => l.id === 'software')).toBe(true)
  })

  it('says so when there is no software spend to remove', () => {
    const inputs = emptyInputs()
    inputs.technology.currentErpCost = 0
    inputs.technology.tools = []
    const result = calculateRoi(inputs, expected)
    expect(result.monthlyHardSavings).toBe(0)
    expect(result.notes.join(' ')).toMatch(/no hard cost saving is claimed/i)
  })
})

describe('admissions opportunity', () => {
  it('is enquiries × leakage × recovery × fee, spread over the year', () => {
    const inputs = emptyInputs()
    inputs.admissions = {
      enquiriesPerMonth: 300,
      admissionsPerMonth: 90,
      annualFeePerStudent: 60_000,
      leakageBand: 'B10_20', // midpoint 15%
      staffHoursPerDay: 0,
    }

    const result = calculateRoi(inputs, expected)
    // 300 × 0.15 = 45 at risk, × 0.08 = 3.6 admissions × ₹60,000 = ₹216,000/yr.
    expect(result.revenue.leadsAtRisk).toBeCloseTo(45, 5)
    expect(result.revenue.recoverableAdmissions).toBeCloseTo(3.6, 5)
    expect(result.revenue.annualEnrolmentValue).toBeCloseTo(216_000, 5)
    expect(result.revenue.monthlyEquivalent).toBeCloseTo(18_000, 5)
  })

  it('derives the current conversion rate from the two counts', () => {
    const inputs = emptyInputs()
    inputs.admissions.enquiriesPerMonth = 300
    inputs.admissions.admissionsPerMonth = 90
    expect(calculateRoi(inputs, expected).revenue.currentConversionRate).toBeCloseTo(0.3, 5)
  })

  it('caps conversion at 100% and says why', () => {
    const inputs = emptyInputs()
    inputs.admissions.enquiriesPerMonth = 50
    inputs.admissions.admissionsPerMonth = 80
    const result = calculateRoi(inputs, expected)
    expect(result.revenue.currentConversionRate).toBe(1)
    expect(result.notes.join(' ')).toMatch(/capped at 100%/i)
  })

  it('has no conversion rate at all when there are no enquiries', () => {
    expect(calculateRoi(emptyInputs(), expected).revenue.currentConversionRate).toBeNull()
  })

  it('keeps the recovery rate conservative in every scenario', () => {
    // The number this calculator would be most tempted to inflate.
    for (const scenario of Object.values(ASSUMPTIONS)) {
      expect(scenario.leadRecoveryRate).toBeLessThanOrEqual(0.15)
    }
  })

  it('flags the assumed leakage when the school does not know it', () => {
    const inputs = emptyInputs()
    inputs.admissions.enquiriesPerMonth = 100
    inputs.admissions.leakageBand = 'UNKNOWN'
    expect(calculateRoi(inputs, expected).notes.join(' ')).toMatch(/default estimate/i)
  })
})

describe('leakage bands', () => {
  it('reads each band as its midpoint', () => {
    expect(leakageRate('LT5', expected)).toBeCloseTo(0.03, 5)
    expect(leakageRate('B5_10', expected)).toBeCloseTo(0.075, 5)
    expect(leakageRate('B10_20', expected)).toBeCloseTo(0.15, 5)
    expect(leakageRate('B20_30', expected)).toBeCloseTo(0.25, 5)
  })

  it('falls back to the assumption when unknown', () => {
    expect(leakageRate('UNKNOWN', expected)).toBe(expected.unknownLeakage)
    expect(leakageRate('UNKNOWN', conservative)).toBe(conservative.unknownLeakage)
  })
})

describe('the headline is kept clean', () => {
  it('excludes the revenue scenario from the default ROI', () => {
    const inputs = defaultInputs()
    inputs.platform.monthlySubscription = 20_000
    const result = calculateRoi(inputs, expected)

    expect(result.revenue.monthlyOpportunity).toBeGreaterThan(0)
    expect(result.netMonthlyBenefit).toBe(
      result.monthlyOperationalValue - result.monthlyPlatformCost,
    )
    expect(result.withRevenue.netMonthlyBenefit).toBeGreaterThan(result.netMonthlyBenefit)
  })

  it('defaults the revenue toggle to off', () => {
    expect(defaultInputs().includeRevenueInRoi).toBe(false)
  })

  it('switches which figures the headline reports', () => {
    const inputs = defaultInputs()
    inputs.platform.monthlySubscription = 20_000
    const result = calculateRoi(inputs, expected)

    expect(headline(result, false).net).toBe(result.netMonthlyBenefit)
    expect(headline(result, true).net).toBe(result.withRevenue.netMonthlyBenefit)
  })

  it('never folds revenue into the operational total', () => {
    const result = calculateRoi(defaultInputs(), expected)
    expect(result.monthlyOperationalValue).toBe(
      result.monthlyHardSavings + result.monthlyProductivityValue,
    )
  })
})

describe('ROI, annual benefit and payback', () => {
  it('is net over cost as a percentage', () => {
    const inputs = emptyInputs()
    inputs.technology.currentErpCost = 30_000
    inputs.technology.currentErpBilling = 'MONTHLY'
    inputs.technology.tools = []
    inputs.technology.replacedShare = 1
    inputs.platform.monthlySubscription = 10_000

    const result = calculateRoi(inputs, expected)
    // ₹30,000 saved − ₹10,000 cost = ₹20,000, which is 200% of the cost.
    expect(result.netMonthlyBenefit).toBe(20_000)
    expect(result.roiPercent).toBeCloseTo(200, 5)
    expect(result.annualNetBenefit).toBe(240_000)
  })

  it('subtracts implementation from the first year only', () => {
    const inputs = emptyInputs()
    inputs.technology.currentErpCost = 30_000
    inputs.technology.currentErpBilling = 'MONTHLY'
    inputs.technology.tools = []
    inputs.technology.replacedShare = 1
    inputs.platform.monthlySubscription = 10_000
    inputs.platform.implementationCost = 60_000

    const result = calculateRoi(inputs, expected)
    expect(result.annualNetBenefit).toBe(240_000)
    expect(result.firstYearNetBenefit).toBe(180_000)
    expect(result.paybackMonths).toBeCloseTo(3, 5)
  })

  it('has no payback when there is nothing to pay back', () => {
    const inputs = emptyInputs()
    inputs.platform.monthlySubscription = 10_000
    inputs.platform.implementationCost = 0
    expect(calculateRoi(inputs, expected).paybackMonths).toBeNull()
  })

  it('has no payback when the benefit is negative', () => {
    const inputs = emptyInputs()
    inputs.platform.monthlySubscription = 50_000
    inputs.platform.implementationCost = 100_000
    const result = calculateRoi(inputs, expected)
    expect(result.netMonthlyBenefit).toBeLessThan(0)
    expect(result.paybackMonths).toBeNull()
  })

  it('reports no ROI percentage rather than infinity when the platform is free', () => {
    const inputs = emptyInputs()
    inputs.technology.currentErpCost = 5000
    inputs.technology.currentErpBilling = 'MONTHLY'
    inputs.technology.tools = []
    inputs.platform.monthlySubscription = 0
    inputs.platform.addOnsMonthly = 0

    const result = calculateRoi(inputs, expected)
    expect(result.roiPercent).toBeNull()
    expect(result.notes.join(' ')).toMatch(/cannot be calculated/i)
  })

  it('reports a negative return honestly instead of flooring it at zero', () => {
    const inputs = emptyInputs()
    inputs.platform.monthlySubscription = 25_000

    const result = calculateRoi(inputs, expected)
    expect(result.netMonthlyBenefit).toBe(-25_000)
    expect(result.roiPercent).toBeCloseTo(-100, 5)
    expect(result.notes.join(' ')).toMatch(/costs more than the operational value/i)
  })

  it('adds add-ons to the monthly platform cost', () => {
    const inputs = emptyInputs()
    inputs.platform.monthlySubscription = 10_000
    inputs.platform.addOnsMonthly = 2_500
    expect(calculateRoi(inputs, expected).monthlyPlatformCost).toBe(12_500)
  })
})

describe('a school with nothing entered', () => {
  it('claims no value at all', () => {
    const inputs = emptyInputs()
    inputs.technology.currentErpCost = 0
    inputs.technology.tools = []
    inputs.platform.monthlySubscription = 0

    const result = calculateRoi(inputs, expected)
    expect(result.hoursSavedPerMonth).toBe(0)
    expect(result.monthlyOperationalValue).toBe(0)
    expect(result.netMonthlyBenefit).toBe(0)
    expect(result.lines).toHaveLength(0)
  })
})

describe('scenarios', () => {
  it('rank conservative below expected below optimistic', () => {
    const inputs = defaultInputs()
    const low = calculateRoi(inputs, ASSUMPTIONS.CONSERVATIVE).monthlyOperationalValue
    const mid = calculateRoi(inputs, ASSUMPTIONS.EXPECTED).monthlyOperationalValue
    const high = calculateRoi(inputs, ASSUMPTIONS.OPTIMISTIC).monthlyOperationalValue

    expect(low).toBeLessThan(mid)
    expect(mid).toBeLessThan(high)
  })

  it('keeps even the optimistic case bounded below total elimination', () => {
    const o = ASSUMPTIONS.OPTIMISTIC
    for (const factor of [
      o.crmAdminEfficiency,
      o.feeAdminEfficiency,
      o.reportingEfficiency,
      o.questionPaperEfficiency,
      o.communicationEfficiency,
    ]) {
      expect(factor).toBeLessThanOrEqual(0.8)
    }
  })
})

describe('traceability', () => {
  it('gives every line a formula containing real numbers', () => {
    const result = calculateRoi(defaultInputs(), expected)
    expect(result.lines.length).toBeGreaterThan(0)
    for (const line of result.lines) {
      expect(line.formula.length).toBeGreaterThan(0)
      expect(line.basis.length).toBeGreaterThan(0)
      expect(line.module.length).toBeGreaterThan(0)
    }
  })

  it('has productivity lines that add up to the productivity total', () => {
    const result = calculateRoi(defaultInputs(), expected)
    const summed = result.lines
      .filter((l) => l.category === 'PRODUCTIVITY')
      .reduce((total, l) => total + l.amount, 0)
    expect(summed).toBeCloseTo(result.monthlyProductivityValue, 6)
  })

  it('has hours that add up to the headline hours', () => {
    const result = calculateRoi(defaultInputs(), expected)
    const summed = result.lines.reduce((total, l) => total + (l.hours ?? 0), 0)
    expect(summed).toBeCloseTo(result.hoursSavedPerMonth, 6)
  })

  it('converts hours into working days using the school’s own day length', () => {
    const inputs = emptyInputs()
    inputs.working.hoursPerDay = 8
    inputs.reporting = { reportsPerMonth: 100, minutesPerReport: 60 }
    // 100 hrs × 0.7 = 70 hrs ÷ 8 = 8.75 days.
    expect(calculateRoi(inputs, expected).workingDaysReturned).toBeCloseTo(8.75, 5)
  })
})

describe('validation', () => {
  it('accepts the shipped defaults', () => {
    expect(roiInputsSchema.safeParse(defaultInputs()).success).toBe(true)
  })

  it('rejects a negative salary', () => {
    const inputs = defaultInputs()
    inputs.profile.teacherSalary = -1
    expect(roiInputsSchema.safeParse(inputs).success).toBe(false)
  })

  it('rejects a negative student count', () => {
    const inputs = defaultInputs()
    inputs.profile.students = -5
    expect(roiInputsSchema.safeParse(inputs).success).toBe(false)
  })

  it('rejects zero working days, which would divide by nothing', () => {
    const inputs = defaultInputs()
    inputs.working.daysPerMonth = 0
    expect(roiInputsSchema.safeParse(inputs).success).toBe(false)
  })

  it('rejects a replaced share above 100%', () => {
    const inputs = defaultInputs()
    inputs.technology.replacedShare = 1.5
    expect(roiInputsSchema.safeParse(inputs).success).toBe(false)
  })

  it('rejects a negative software cost', () => {
    const inputs = defaultInputs()
    inputs.technology.currentErpCost = -100
    expect(roiInputsSchema.safeParse(inputs).success).toBe(false)
  })

  it('flags admissions exceeding enquiries', () => {
    const inputs = defaultInputs()
    inputs.admissions.enquiriesPerMonth = 10
    inputs.admissions.admissionsPerMonth = 50
    const parsed = roiInputsSchema.safeParse(inputs)
    expect(parsed.success).toBe(false)
    expect(!parsed.success && parsed.error.issues[0]?.message).toMatch(/cannot exceed enquiries/i)
  })

  it('still allows a large university', () => {
    const inputs = defaultInputs()
    inputs.profile.students = 180_000
    inputs.profile.teachers = 9_000
    expect(roiInputsSchema.safeParse(inputs).success).toBe(true)
  })

  it('allows a school that spends nothing today and is quoted nothing', () => {
    const inputs = defaultInputs()
    inputs.technology.currentErpCost = 0
    inputs.platform.monthlySubscription = 0
    expect(roiInputsSchema.safeParse(inputs).success).toBe(true)
  })
})

describe('never producing NaN or Infinity', () => {
  it('survives garbage in every numeric field', () => {
    const inputs = defaultInputs()
    const broken = Number.NaN
    inputs.profile.teacherSalary = broken
    inputs.attendance.minutesPerDay = broken
    inputs.reporting.reportsPerMonth = broken
    inputs.admissions.enquiriesPerMonth = broken
    inputs.platform.monthlySubscription = broken

    const result = calculateRoi(inputs, expected)
    for (const value of [
      result.hoursSavedPerMonth,
      result.monthlyOperationalValue,
      result.netMonthlyBenefit,
      result.annualNetBenefit,
      result.workingDaysReturned,
      result.revenue.monthlyOpportunity,
    ]) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })
})

describe('Indian formatting', () => {
  it('groups rupees the Indian way', () => {
    expect(formatInr(125_000)).toContain('1,25,000')
  })

  it('uses lakh and crore for headline figures', () => {
    expect(formatInrCompact(1_250_000)).toBe('₹12.5L')
    expect(formatInrCompact(25_000_000)).toBe('₹2.5Cr')
  })

  it('shows a dash rather than NaN for an absent percentage', () => {
    expect(formatPercent(null)).toBe('—')
  })

  it('never prints NaN', () => {
    expect(formatInr(Number.NaN)).not.toContain('NaN')
    expect(formatInrCompact(Number.POSITIVE_INFINITY)).not.toContain('Infinity')
  })
})

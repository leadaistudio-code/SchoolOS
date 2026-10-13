import { describe, expect, it } from 'vitest'
import { ageOn, classInWords, dateToWords, numberToWords, ordinalWords } from '@/lib/words'
import { nextClassName, tcCancelSchema, tcIssueSchema } from '@/server/modules/students/transfer-certificates'
import { incrementTrailingNumber } from '@/server/modules/students/service'
import { studentCreateSchema, studentUpdateSchema } from '@/server/modules/students/schema'
import { NAVIGATION, QUICK_ACTIONS, visibleNavigation, visibleQuickActions } from '@/lib/navigation'
import { ID_CARD_CATEGORIES, ID_CARD_DESIGNS, defaultIdCardSettings, idCardDesign, idCardRows } from '@/lib/id-cards/designs'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('words', () => {
  it('spells numbers in Indian grouping', () => {
    expect(numberToWords(0)).toBe('Zero')
    expect(numberToWords(15)).toBe('Fifteen')
    expect(numberToWords(2012)).toBe('Two Thousand Twelve')
    expect(numberToWords(1234567)).toBe('Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven')
  })

  it('spells ordinals and dates', () => {
    expect(ordinalWords(1)).toBe('First')
    expect(ordinalWords(20)).toBe('Twentieth')
    expect(ordinalWords(31)).toBe('Thirty First')
    expect(dateToWords(d('2012-03-15'))).toBe('Fifteenth March Two Thousand Twelve')
    expect(dateToWords(null)).toBe('')
  })

  it('turns class names into words', () => {
    expect(classInWords('Class 5')).toBe('Fifth')
    expect(classInWords('V')).toBe('Fifth')
    expect(classInWords('XII Science')).toBe('Twelfth Science')
    expect(classInWords('10')).toBe('Tenth')
    expect(classInWords('Nursery')).toBe('Nursery')
    expect(classInWords('UKG')).toBe('UKG')
  })

  it('computes age in years, months and days', () => {
    expect(ageOn(d('2016-03-14'), d('2026-10-02'))).toEqual({ years: 10, months: 6, days: 18 })
    expect(ageOn(d('2016-10-05'), d('2026-10-02'))).toEqual({ years: 9, months: 11, days: 27 })
    expect(ageOn(d('2030-01-01'), d('2026-10-02'))).toBeNull()
  })
})

describe('transfer certificate', () => {
  it('suggests the next class', () => {
    expect(nextClassName('Class 5')).toBe('Class 6')
    expect(nextClassName('9')).toBe('10')
    expect(nextClassName('VIII')).toBe('IX')
    expect(nextClassName('XII')).toBe('')
    expect(nextClassName('Class 12')).toBe('')
    expect(nextClassName('Nursery')).toBe('')
  })

  it('validates an issue request', () => {
    const ok = tcIssueSchema.parse({
      studentId: 's1',
      issuedOn: '2026-10-02',
      applicationDate: '',
      details: { studentName: 'Aarav Sharma' },
    })
    expect(ok.applicationDate).toBeNull()
    expect(ok.disableLogin).toBe(true)
    expect(ok.details.motherName).toBe('')
    expect(() => tcIssueSchema.parse({ studentId: 's1', issuedOn: '02/10/2026', details: { studentName: 'Aarav' } })).toThrow()
    expect(() => tcIssueSchema.parse({ studentId: 's1', issuedOn: '2026-10-02', details: { studentName: '' } })).toThrow()
  })

  it('requires a reason to cancel', () => {
    expect(() => tcCancelSchema.parse({ id: 't1', reason: '' })).toThrow()
    expect(tcCancelSchema.parse({ id: 't1', reason: 'Issued by mistake' }).reason).toBe('Issued by mistake')
  })
})

describe('admission', () => {
  it('increments admission numbers keeping the padding', () => {
    expect(incrementTrailingNumber('ADM-2026-0041')).toBe('ADM-2026-0042')
    expect(incrementTrailingNumber('ADM-2026-0999')).toBe('ADM-2026-1000')
    expect(incrementTrailingNumber('1450')).toBe('1451')
    expect(incrementTrailingNumber('A/09')).toBe('A/10')
    expect(incrementTrailingNumber('NEW')).toBe('NEW1')
  })

  const base = { admissionNo: 'ADM-1', firstName: 'Aarav', classLevelId: 'c', sectionId: 's' }

  it('accepts the new admission particulars', () => {
    const parsed = studentCreateSchema.parse({
      ...base,
      aadhaarNo: '1234 5678 9012',
      caste: 'Brahmin',
      house: 'Blue',
      whatsappPhone: '98765 43210',
      guardian: { firstName: 'Rakesh', relation: 'FATHER', phone: '9876543210' },
      secondGuardian: { firstName: 'Sunita', relation: 'MOTHER' },
    })
    expect(parsed.aadhaarNo).toBe('123456789012')
    expect(parsed.secondGuardian?.relation).toBe('MOTHER')
  })

  it('rejects a malformed Aadhaar number and drops a blank one', () => {
    expect(() => studentCreateSchema.parse({ ...base, aadhaarNo: '1234' })).toThrow()
    expect(studentCreateSchema.parse({ ...base, aadhaarNo: '' }).aadhaarNo).toBeUndefined()
  })

  it('never lets an edit add guardians', () => {
    const parsed = studentUpdateSchema.parse({ firstName: 'A', secondGuardian: { firstName: 'X' } }) as Record<string, unknown>
    expect(parsed.secondGuardian).toBeUndefined()
  })
})

describe('header quick actions', () => {
  const nav = (perms: string[]) =>
    visibleNavigation(NAVIGATION, { can: (p) => perms.includes(p), hasFeature: () => true, isPortal: false })

  it('shows only what the role can reach', () => {
    const accountant = visibleQuickActions(nav(['fees.collect', 'fees.view']))
    expect(accountant.map((a) => a.href)).toEqual(['/finance/collect'])

    const admin = visibleQuickActions(nav(['fees.collect', 'fees.view', 'students.view', 'students.create', 'attendance.view', 'attendance.mark']))
    expect(admin).toHaveLength(QUICK_ACTIONS.length)
  })

  it('shows nothing when a plan feature hides the module', () => {
    const v = visibleNavigation(NAVIGATION, { can: () => true, hasFeature: () => false, isPortal: false })
    const hrefs = visibleQuickActions(v).map((a) => a.href)
    expect(hrefs.every((h) => QUICK_ACTIONS.some((a) => a.href === h))).toBe(true)
  })
})

describe('id card designs', () => {
  it('has unique keys and every design in a known category', () => {
    const keys = ID_CARD_DESIGNS.map((x) => x.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const design of ID_CARD_DESIGNS) expect(ID_CARD_CATEGORIES).toContain(design.category)
    for (const c of ID_CARD_CATEGORIES) expect(ID_CARD_DESIGNS.some((x) => x.category === c)).toBe(true)
  })

  it('falls back to the classic design', () => {
    expect(idCardDesign('nope').key).toBe('classic-navy')
  })

  it('prints only the chosen fields, in catalogue order', () => {
    const rows = idCardRows('student', ['phone', 'class'], { class: '5 - A', phone: '999', dob: 'x' })
    expect(rows).toEqual([
      { label: 'Class / section', value: '5 - A' },
      { label: 'Contact no.', value: '999' },
    ])
    expect(defaultIdCardSettings('staff').fields).toContain('designation')
  })
})

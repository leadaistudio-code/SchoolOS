import { describe, expect, it } from 'vitest'
import {
  addExamPaperSchema,
  examPaperUpdateSchema,
  gradeBandRows,
  gradeForPercent,
  gradingScaleSchema,
  resolveMarkParts,
  writtenMax,
} from '@/server/modules/exams/service'
import { feeHeadSchema } from '@/server/modules/finance/service'
import { feeHeadActiveOn } from '@/server/modules/finance/fee-head-window'
import { pageHits, searchTokens } from '@/server/modules/search/global-search'
import { NAVIGATION, visibleNavigation } from '@/lib/navigation'

describe('fee head billing window', () => {
  it('accepts blank or ISO dates', () => {
    const head = feeHeadSchema.parse({ code: 'BUS', name: 'Bus fee', startsOn: '2026-07-01', endsOn: '' })
    expect(head.startsOn).toBe('2026-07-01')
    expect(head.endsOn).toBeNull()
    expect(() => feeHeadSchema.parse({ code: 'BUS', name: 'Bus fee', startsOn: '01/07/2026' })).toThrow()
  })

  it('bills only inside the window', () => {
    const head = { startsOn: new Date('2026-07-01'), endsOn: new Date('2027-03-31') }
    expect(feeHeadActiveOn(head, new Date('2026-06-10'))).toBe(false)
    expect(feeHeadActiveOn(head, new Date('2026-07-01'))).toBe(true)
    expect(feeHeadActiveOn(head, new Date('2027-03-31'))).toBe(true)
    expect(feeHeadActiveOn(head, new Date('2027-04-10'))).toBe(false)
    expect(feeHeadActiveOn({ startsOn: null, endsOn: null }, new Date())).toBe(true)
  })
})

describe('custom marking systems', () => {
  it('stores marks-based bands as percentages too', () => {
    const input = gradingScaleSchema.parse({
      name: 'Out of 50',
      system: 'GRADES',
      basis: 'MARKS',
      outOf: 50,
      bands: [
        { grade: 'A', min: 41, max: 50, isPass: true },
        { grade: 'B', min: 17, max: 40, isPass: true },
        { grade: 'E', min: 0, max: 16, isPass: false },
      ],
    })
    const rows = gradeBandRows(input)
    expect(rows[0]).toMatchObject({ grade: 'A', minPercent: 82, maxPercent: 100, minMarks: 41, maxMarks: 50 })
    expect(rows[2]).toMatchObject({ minPercent: 0, maxPercent: 32, isPass: false })
    // 16.5 / 50 = 33% sits in the gap between E (≤32%) and B (≥34%): it takes the band below.
    expect(gradeForPercent(33, rows)?.grade).toBe('E')
    expect(gradeForPercent(90, rows)?.grade).toBe('A')
  })

  it('keeps accepting the old minPercent / maxPercent payload', () => {
    const input = gradingScaleSchema.parse({ name: 'Legacy', bands: [{ grade: 'P', minPercent: 33, maxPercent: 100, isPass: true }] })
    expect(gradeBandRows(input)[0]).toMatchObject({ minPercent: 33, maxPercent: 100, minMarks: null })
  })

  it('rejects overlaps, duplicates, out-of-range bands and missing totals', () => {
    const overlap = gradingScaleSchema.safeParse({ name: 'Bad', bands: [{ grade: 'A', min: 50, max: 100 }, { grade: 'B', min: 0, max: 60 }] })
    expect(overlap.success).toBe(false)
    const dup = gradingScaleSchema.safeParse({ name: 'Bad', bands: [{ grade: 'A', min: 50, max: 100 }, { grade: 'a', min: 0, max: 49 }] })
    expect(dup.success).toBe(false)
    const ceiling = gradingScaleSchema.safeParse({ name: 'Bad', basis: 'MARKS', outOf: 20, bands: [{ grade: 'A', min: 0, max: 25 }] })
    expect(ceiling.success).toBe(false)
    const noTotal = gradingScaleSchema.safeParse({ name: 'Bad', basis: 'MARKS', bands: [{ grade: 'A', min: 0, max: 25 }] })
    expect(noTotal.success).toBe(false)
  })

  it('drops points for descriptive and marks-only systems', () => {
    const input = gradingScaleSchema.parse({ name: 'Desc', system: 'DESCRIPTIVE', bands: [{ grade: 'Excellent', min: 0, max: 100, points: 9 }] })
    expect(gradeBandRows(input)[0]!.points).toBeNull()
  })
})

describe('internal and oral marks on a paper', () => {
  it('treats both parts as optional', () => {
    const plain = addExamPaperSchema.parse({ classSubjectId: 'cs1', maxMarks: 100, passMarks: 33 })
    expect(plain).toMatchObject({ internalMaxMarks: null, oralMaxMarks: null })
    const withParts = addExamPaperSchema.parse({ classSubjectId: 'cs1', maxMarks: 100, passMarks: 33, internalMaxMarks: '20', oralMaxMarks: '' })
    expect(withParts).toMatchObject({ internalMaxMarks: 20, oralMaxMarks: null })
    expect(writtenMax(withParts)).toBe(80)
  })

  it('needs room for a written part', () => {
    expect(addExamPaperSchema.safeParse({ classSubjectId: 'cs1', maxMarks: 30, internalMaxMarks: 20, oralMaxMarks: 10 }).success).toBe(false)
  })

  it('leaves parts untouched when a spreadsheet update omits them', () => {
    const parsed = examPaperUpdateSchema.parse({ papers: [{ id: 'p1', maxMarks: 100, passMarks: 33 }] })
    expect(parsed.papers[0]!.internalMaxMarks).toBeUndefined()
  })

  it('sums the parts and checks each against its own maximum', () => {
    const paper = { maxMarks: 100, internalMaxMarks: 20, oralMaxMarks: 10 }
    const row = resolveMarkParts({ studentId: 's', marksObtained: null, writtenMarks: 55, internalMarks: 18, oralMarks: 7.5, isAbsent: false }, paper)
    expect(row).toMatchObject({ marksObtained: 80.5, internalMarks: 18, oralMarks: 7.5 })
    expect(() => resolveMarkParts({ studentId: 's', marksObtained: null, writtenMarks: 71, isAbsent: false }, paper)).toThrow(/Written/)
    expect(() => resolveMarkParts({ studentId: 's', marksObtained: null, writtenMarks: 50, internalMarks: 25, isAbsent: false }, paper)).toThrow(/Internal/)
  })

  it('keeps a plain total from imports and clears parts when absent', () => {
    const paper = { maxMarks: 100, internalMaxMarks: 20, oralMaxMarks: null }
    expect(resolveMarkParts({ studentId: 's', marksObtained: 64, isAbsent: false }, paper)).toMatchObject({ marksObtained: 64, internalMarks: null })
    expect(resolveMarkParts({ studentId: 's', marksObtained: null, writtenMarks: 50, internalMarks: 10, isAbsent: true }, paper)).toMatchObject({ internalMarks: null, oralMarks: null })
  })
})

describe('global search', () => {
  const admin = visibleNavigation(NAVIGATION, { can: () => true, hasFeature: () => true, isPortal: false })

  it('finds pages by label and by everyday words', () => {
    expect(pageHits(admin, 'tc').map((h) => h.href)).toContain('/students/transfer-certificates')
    expect(pageHits(admin, 'collect').map((h) => h.href)[0]).toBe('/finance/collect')
    expect(pageHits(admin, 'grading').map((h) => h.href)).toContain('/exams/grades')
  })

  it('never offers pages the user cannot open', () => {
    const teacher = visibleNavigation(NAVIGATION, { can: (p) => p.startsWith('attendance.') || p === 'dashboard.view', hasFeature: () => true, isPortal: false })
    expect(pageHits(teacher, 'collect')).toEqual([])
  })

  it('splits multi-word queries into tokens', () => {
    expect(searchTokens('  rahul   sharma 8B ')).toEqual(['rahul', 'sharma', '8B'])
    expect(searchTokens('a b c d e f')).toHaveLength(4)
  })
})

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REPORT_CARD_CONFIG,
  behaviourLabel,
  linesToList,
  masteryLabel,
  parseHolistic,
  parseReportCardConfig,
} from '@/lib/exams/report-card-config'
import { computeCgpa, sampleReportCard } from '@/lib/exams/report-card-data'
import { completionPercent, marksHubFilterSchema } from '@/server/modules/exams/marks-hub'
import { holisticSaveSchema } from '@/server/modules/exams/holistic'

describe('report card config', () => {
  it('falls back to defaults for missing or malformed config', () => {
    expect(parseReportCardConfig(null)).toEqual(DEFAULT_REPORT_CARD_CONFIG)
    expect(parseReportCardConfig('nope')).toEqual(DEFAULT_REPORT_CARD_CONFIG)
    expect(parseReportCardConfig([1, 2])).toEqual(DEFAULT_REPORT_CARD_CONFIG)
  })

  it('keeps valid values and rejects bad ones', () => {
    const config = parseReportCardConfig({
      layout: 'CLASSIC',
      accent: 'red',
      title: '',
      competencies: ['A', ' A ', '', 3, 'B'],
      signatories: ['Teacher', '', 'Head'],
      showPart2: false,
    })
    expect(config.layout).toBe('CLASSIC')
    expect(config.accent).toBe(DEFAULT_REPORT_CARD_CONFIG.accent)
    expect(config.title).toBe(DEFAULT_REPORT_CARD_CONFIG.title)
    expect(config.competencies).toEqual(['A', 'B'])
    expect(config.signatories).toEqual(['Teacher', 'Exam Controller', 'Head'])
    expect(config.showPart2).toBe(false)
  })

  it('splits textarea lines', () => {
    expect(linesToList(' Art \r\n\nMusic\n')).toEqual(['Art', 'Music'])
  })
})

describe('holistic data', () => {
  it('drops out-of-range scores and non-object payloads', () => {
    expect(parseHolistic(null)).toEqual({ competencies: {}, coScholastic: {} })
    const data = parseHolistic({ competencies: { X: { score: 9 }, Y: { score: 4, note: 'ok' } }, coScholastic: { Art: { grade: 'A' } } })
    expect(data.competencies.X!.score).toBeNull()
    expect(data.competencies.Y).toEqual({ score: 4, note: 'ok' })
    expect(data.coScholastic.Art!.grade).toBe('A')
  })

  it('labels mastery and behaviour', () => {
    expect(masteryLabel(5)).toBe('Advanced mastery')
    expect(masteryLabel(3)).toBe('Developing')
    expect(masteryLabel(null)).toBe('—')
    expect(behaviourLabel('A+')).toBe('Outstanding')
    expect(behaviourLabel(null)).toBe('—')
  })

  it('validates the save payload', () => {
    const ok = holisticSaveSchema.safeParse({
      examId: 'e1',
      rows: [{ resultId: 'r1', competencies: { X: { score: 4, note: null } }, coScholastic: { Art: { grade: 'A+', note: null } }, teacherRemark: '  ', promotionStatus: '' }],
    })
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(ok.data.rows[0]!.teacherRemark).toBeNull()
      expect(ok.data.rows[0]!.promotionStatus).toBeNull()
    }
    expect(holisticSaveSchema.safeParse({ examId: 'e1', rows: [{ resultId: 'r1', competencies: { X: { score: 6 } } }] }).success).toBe(false)
    expect(holisticSaveSchema.safeParse({ examId: 'e1', rows: [{ resultId: 'r1', coScholastic: { Art: { grade: 'Z' } } }] }).success).toBe(false)
  })
})

describe('marks hub helpers', () => {
  it('never rounds an unfinished sheet up to 100%', () => {
    expect(completionPercent(0, 0)).toBe(0)
    expect(completionPercent(199, 200)).toBe(99)
    expect(completionPercent(200, 200)).toBe(100)
  })

  it('tolerates empty and unknown filter values', () => {
    const parsed = marksHubFilterSchema.parse({ tab: 'bogus', status: '', source: 'CSV_IMPORT', exam: '' })
    expect(parsed.tab).toBeUndefined()
    expect(parsed.status).toBeUndefined()
    expect(parsed.exam).toBeUndefined()
    expect(parsed.source).toBe('CSV_IMPORT')
  })
})

describe('report card data', () => {
  it('averages grade points, ignoring ungraded subjects', () => {
    expect(computeCgpa([{ points: 10 }, { points: 9 }, { points: null }])).toBe(9.5)
    expect(computeCgpa([{ points: null }])).toBeNull()
  })

  it('builds a sample that follows the template sections', () => {
    const config = parseReportCardConfig({ competencies: ['One', 'Two'], coScholastic: ['Art'] })
    const sample = sampleReportCard({ name: 'Demo School', code: 'D1', logoUrl: null, signatureUrl: null }, config)
    expect(Object.keys(sample.holistic.competencies)).toEqual(['One', 'Two'])
    expect(Object.keys(sample.holistic.coScholastic)).toEqual(['Art'])
    expect(sample.totals.max).toBe(sample.subjects.length * 100)
    expect(sample.totals.cgpa).not.toBeNull()
  })
})

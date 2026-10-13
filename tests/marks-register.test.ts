import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildRow, cellText, marksRegisterFilterSchema, pct, rankRows, sectionCompletion, type MarksRegister } from '@/server/modules/exams/marks-register'
import { marksRegisterWorkbook } from '@/server/modules/exams/marks-register-xlsx'

const bands = [
  { grade: 'A', minPercent: 80, maxPercent: 100, isPass: true },
  { grade: 'B', minPercent: 50, maxPercent: 79.99, isPass: true },
  { grade: 'E', minPercent: 0, maxPercent: 32.99, isPass: false },
  { grade: 'C', minPercent: 33, maxPercent: 49.99, isPass: true },
]
const subjects = [
  { sheetId: 'en', name: 'English', code: 'ENG', maxMarks: 100, passMarks: 33, status: 'LOCKED' as const, teacher: '', sections: [] },
  { sheetId: 'ma', name: 'Maths', code: 'MAT', maxMarks: 100, passMarks: 33, status: 'SUBMITTED' as const, teacher: '', sections: [] },
  { sheetId: 'sk', name: 'Sanskrit', code: 'SKT', maxMarks: 50, passMarks: 17, status: 'OPEN' as const, teacher: '', sections: ['sec-b'] },
]
const student = (id: string, sectionId = 'sec-a') => ({ studentId: id, rollNumber: 1, name: id, admissionNo: id, sectionId, sectionName: sectionId === 'sec-a' ? 'A' : 'B' })
const marks = (entries: Record<string, number | 'AB'>) =>
  new Map(Object.entries(entries).map(([k, v]) => [k, v === 'AB' ? { marksObtained: null, isAbsent: true } : { marksObtained: v, isAbsent: false }]))

describe('marks register rows', () => {
  it('totals, grades and passes a complete student; section-only subjects are N/A', () => {
    const row = buildRow(student('s1'), subjects, marks({ 'en:s1': 90, 'ma:s1': 75 }), bands)
    expect(row.cells.sk).toEqual({ kind: 'na' })
    expect(row).toMatchObject({ obtained: 165, max: 200, percent: 82.5, grade: 'A', result: 'PASS', complete: true, expected: 2, entered: 2 })
  })

  it('leaves grade and result blank until every mark is in', () => {
    const row = buildRow(student('s2', 'sec-b'), subjects, marks({ 'en:s2': 60, 'ma:s2': 70 }), bands)
    expect(row.cells.sk).toEqual({ kind: 'missing' })
    expect(row).toMatchObject({ complete: false, grade: null, result: null, entered: 2, expected: 3, percent: 65 })
  })

  it('fails on an absent paper or a mark below the pass mark', () => {
    const absent = buildRow(student('s3'), subjects, marks({ 'en:s3': 95, 'ma:s3': 'AB' }), bands)
    expect(absent.cells.ma).toEqual({ kind: 'absent' })
    expect(absent.result).toBe('FAIL')
    expect(absent.max).toBe(200)
    const low = buildRow(student('s4'), subjects, marks({ 'en:s4': 99, 'ma:s4': 20 }), bands)
    expect(low.cells.ma).toEqual({ kind: 'mark', value: 20, fail: true })
    expect(low.result).toBe('FAIL')
  })

  it('passes on overall percentage alone under the OVERALL rule', () => {
    const overall = { passRule: 'OVERALL', passPercent: 33 }
    const row = buildRow(student('s5'), subjects, marks({ 'en:s5': 60, 'ma:s5': 20 }), bands, overall)
    expect(row).toMatchObject({ percent: 40, grade: 'C', result: 'PASS' })
    const below = buildRow(student('s6'), subjects, marks({ 'en:s6': 30, 'ma:s6': 30 }), bands, overall)
    expect(below.result).toBe('FAIL')
  })

  it('counts an elective paper only for students who have a mark in it', () => {
    const withElective = [...subjects, { sheetId: 'cs', name: 'Computer Science', code: 'CS', maxMarks: 100, passMarks: 33, status: 'LOCKED' as const, teacher: '', sections: [], elective: true }]
    const without = buildRow(student('s7'), withElective, marks({ 'en:s7': 60, 'ma:s7': 60 }), bands)
    expect(without.cells.cs).toEqual({ kind: 'na' })
    expect(without).toMatchObject({ complete: true, expected: 2, max: 200 })
    const taken = buildRow(student('s8'), withElective, marks({ 'en:s8': 60, 'ma:s8': 60, 'cs:s8': 90 }), bands)
    expect(taken).toMatchObject({ complete: true, expected: 3, max: 300, obtained: 210 })
  })

  it('leaves a paper marked not applicable out of the student result', () => {
    const map = marks({ 'en:s9': 60 })
    map.set('ma:s9', { marksObtained: null, isAbsent: false, notApplicable: true } as never)
    const row = buildRow(student('s9'), subjects, map, bands)
    expect(row.cells.ma).toEqual({ kind: 'na' })
    expect(row).toMatchObject({ complete: true, expected: 1, max: 100, obtained: 60, result: 'PASS' })
  })

  it('dense-ranks complete students only, ties sharing a rank', () => {
    const rows = [
      buildRow(student('a'), subjects, marks({ 'en:a': 80, 'ma:a': 80 }), bands),
      buildRow(student('b'), subjects, marks({ 'en:b': 90, 'ma:b': 70 }), bands),
      buildRow(student('c'), subjects, marks({ 'en:c': 95, 'ma:c': 95 }), bands),
      buildRow(student('d'), subjects, marks({ 'en:d': 99 }), bands),
      buildRow(student('e'), subjects, marks({ 'en:e': 50, 'ma:e': 50 }), bands),
    ]
    rankRows(rows)
    expect(rows.map((r) => r.rank)).toEqual([2, 2, 1, null, 4])
  })

  it('section status and helpers', () => {
    expect(sectionCompletion(10, 10)).toBe('COMPLETED')
    expect(sectionCompletion(3, 10)).toBe('IN_PROGRESS')
    expect(sectionCompletion(0, 10)).toBe('NOT_STARTED')
    expect(sectionCompletion(0, 0)).toBe('NOT_STARTED')
    expect(pct(1, 3)).toBe(33.3)
    expect(cellText({ kind: 'absent' })).toBe('AB')
    expect(cellText({ kind: 'na' })).toBe('—')
    expect(cellText({ kind: 'mark', value: 42.5, fail: false })).toBe('42.5')
    expect(marksRegisterFilterSchema.parse({ status: 'nope', exam: '' })).toEqual({ status: undefined, exam: undefined })
  })
})

describe('marks register Excel export', () => {
  it('builds a summary sheet and one styled sheet per section', async () => {
    const rows = [buildRow(student('s1'), subjects, marks({ 'en:s1': 90, 'ma:s1': 'AB' }), bands)]
    const data = {
      exam: { id: 'x', name: 'Half Yearly', session: { name: '2026-27' } },
      school: { name: 'Apni Pathshala', address: 'Main Road, Jaipur', contact: 'Ph: 99', logoUrl: null, signatureUrl: null },
      sections: [
        { key: 'c:a', classLevelId: 'c', className: 'Class 5', numeric: 5, sectionId: 'sec-a', sectionName: 'A', students: 1, completeStudents: 1, subjects: 2, sheetsLocked: 1, sheetsSubmitted: 1, entered: 2, expected: 2, percent: 100, status: 'COMPLETED', passed: 0, failed: 1, average: 45 },
      ],
      sectionRegisters: [{ className: 'Class 5', sectionName: 'A', subjects: subjects.slice(0, 2).map(({ sections: _s, ...s }) => s), rows }],
      register: null,
      totals: { sections: 1, completed: 1, inProgress: 0, notStarted: 0, students: 1, completeStudents: 1 },
    } as unknown as MarksRegister
    const buffer = await marksRegisterWorkbook(data)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as ArrayBuffer)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Class 5 A'])
    const sheet = wb.getWorksheet('Class 5 A')!
    expect(sheet.getCell('A1').value).toBe('APNI PATHSHALA')
    const values = sheet.getSheetValues().flat().filter((v) => v !== undefined && v !== null)
    expect(values).toContain('AB')
    expect(values).toContain('Fail')
  })
})

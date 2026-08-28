import { describe, expect, it } from 'vitest'
import {
  inferClassSection,
  normalizeImportGender,
  parseImportDate,
  readImportDate,
  readMappedCell,
} from '../src/lib/import-values'

describe('import value parsing', () => {
  it('parses Indian and ISO dates', () => {
    expect(parseImportDate('2026-04-01')?.toISOString().slice(0, 10)).toBe('2026-04-01')
    expect(parseImportDate('01/04/2026')?.toISOString().slice(0, 10)).toBe('2026-04-01')
    expect(parseImportDate('01-04-2026')?.toISOString().slice(0, 10)).toBe('2026-04-01')
    expect(parseImportDate('01.04.2026')?.toISOString().slice(0, 10)).toBe('2026-04-01')
  })

  it('parses Excel serial dates', () => {
    const d = parseImportDate('45321')
    expect(d).toBeInstanceOf(Date)
    expect(d!.getUTCFullYear()).toBeGreaterThan(2020)
  })

  it('parses two-digit year dates', () => {
    expect(parseImportDate('12/08/14')?.toISOString().slice(0, 10)).toBe('2014-08-12')
  })

  it('reads DOB from alternate column headers', () => {
    const raw = { 'Date of Birth': '15/04/2012', 'Admission number': 'ADM-1' }
    expect(readImportDate(raw, null, 'date of birth', 'dob')?.toISOString().slice(0, 10)).toBe(
      '2012-04-15',
    )
    expect(readMappedCell(raw, 'DOB', 'date of birth')).toBe('15/04/2012')
  })

  it('normalises common gender values', () => {
    expect(normalizeImportGender('M')).toBe('MALE')
    expect(normalizeImportGender('Girl')).toBe('FEMALE')
    expect(normalizeImportGender('1')).toBe('MALE')
  })

  it('splits class and section from one cell', () => {
    expect(inferClassSection('Class 10 A', '')).toEqual({
      className: 'Class 10',
      sectionName: 'A',
    })
    expect(inferClassSection('10-A', '')).toEqual({ className: '10', sectionName: 'A' })
  })
})

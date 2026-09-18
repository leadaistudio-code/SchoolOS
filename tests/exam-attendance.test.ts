import { describe, expect, it } from 'vitest'
import {
  examAttendanceMarkSchema,
  examAttendanceScanSchema,
  normalizeAdmitBarcode,
} from '../src/server/modules/exams/attendance'

describe('exam attendance barcodes', () => {
  it('extracts the private admit-card token from a scanner value', () => {
    expect(normalizeAdmitBarcode('  MCV-ADMIT:abc_123  ')).toBe('abc_123')
  })

  it('also accepts a manually entered admit-card number', () => {
    expect(normalizeAdmitBarcode('AC-2026-0042')).toBe('AC-2026-0042')
  })

  it('rejects an empty scan', () => {
    expect(examAttendanceScanSchema.safeParse({
      examId: 'exam-1',
      examDate: '2026-09-15',
      barcode: ' ',
    }).success).toBe(false)
  })

  it('requires an exam date for day check-in', () => {
    expect(examAttendanceScanSchema.safeParse({
      examId: 'exam-1',
      examDate: '2026-09-15',
      barcode: 'MCV-ADMIT:token',
    }).success).toBe(true)
    expect(examAttendanceScanSchema.safeParse({
      examId: 'exam-1',
      barcode: 'MCV-ADMIT:token',
    }).success).toBe(false)
  })

  it('allows only present or absent manual marks', () => {
    expect(examAttendanceMarkSchema.safeParse({
      examId: 'exam-1',
      examDate: '2026-09-15',
      studentId: 'student-1',
      status: 'PRESENT',
    }).success).toBe(true)
    expect(examAttendanceMarkSchema.safeParse({
      examId: 'exam-1',
      examDate: '2026-09-15',
      studentId: 'student-1',
      status: 'LATE',
    }).success).toBe(false)
  })
})

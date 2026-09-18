import type { AppContext } from '@/server/context'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { toCsv } from '@/lib/csv'
import { gridToTable, parseSpreadsheet } from '@/lib/spreadsheet'
import { examMarksSetup, marksRoster, saveMarks } from './service'

type SaveRow = {
  studentId: string
  marksObtained: number | null
  isAbsent: boolean
  remarks: string | null
}

const HEADER_ALIASES = {
  admissionNo: ['admission no', 'admission number', 'admissionno', 'adm no', 'adm', 'admission'],
  rollNumber: ['roll', 'roll no', 'roll number', 'rollno'],
  marks: ['marks', 'mark', 'marks obtained', 'score', 'obtained'],
  absent: ['absent', 'is absent', 'abs'],
  remarks: ['remark', 'remarks', 'note', 'notes'],
  subject: ['subject', 'paper', 'exam subject'],
  className: ['class', 'class name', 'class level'],
} as const

export type MarksImportIssue = {
  row: number
  admissionNo?: string
  message: string
}

export type MarksImportResult = {
  saved: number
  skipped: number
  issues: MarksImportIssue[]
  papers?: number
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeAdmission(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function findHeader(headers: string[], aliases: readonly string[]) {
  const wanted = new Set(aliases.map(normalizeKey))
  return headers.find((header) => wanted.has(normalizeKey(header))) ?? null
}

function parseAbsent(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return ['y', 'yes', 'true', '1', 'absent', 'abs', 'a'].includes(normalized)
}

function parseMarksValue(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const number = Number(trimmed)
  if (!Number.isFinite(number)) throw new Error('Marks must be a number')
  return number
}

function pickHeaderRow(grid: string[][]) {
  const limit = Math.min(grid.length, 12)
  for (let index = 0; index < limit; index++) {
    const headers = (grid[index] ?? []).map((cell) => cell.trim()).filter(Boolean)
    if (headers.length < 2) continue
    const admission = findHeader(headers, HEADER_ALIASES.admissionNo)
    const marks = findHeader(headers, HEADER_ALIASES.marks)
    if (admission && marks) return index
  }
  return 0
}

type ParsedImportRow = {
  line: number
  admissionNo: string
  rollNumber: string | null
  marksObtained: number | null
  isAbsent: boolean
  remarks: string | null
  subject: string | null
  className: string | null
}

function parseImportRows(buffer: Buffer, fileName: string, mimeType: string): ParsedImportRow[] {
  const spreadsheet = parseSpreadsheet(buffer, fileName, mimeType)
  if (spreadsheet.grid.length === 0) throw badRequest('The spreadsheet is empty')
  const headerRowIndex = pickHeaderRow(spreadsheet.grid)
  const table = gridToTable(spreadsheet.grid, headerRowIndex)
  const admissionHeader = findHeader(table.headers, HEADER_ALIASES.admissionNo)
  const marksHeader = findHeader(table.headers, HEADER_ALIASES.marks)
  if (!admissionHeader || !marksHeader) {
    throw badRequest('The file needs “Admission No” and “Marks” columns')
  }
  const rollHeader = findHeader(table.headers, HEADER_ALIASES.rollNumber)
  const absentHeader = findHeader(table.headers, HEADER_ALIASES.absent)
  const remarksHeader = findHeader(table.headers, HEADER_ALIASES.remarks)
  const subjectHeader = findHeader(table.headers, HEADER_ALIASES.subject)
  const classHeader = findHeader(table.headers, HEADER_ALIASES.className)

  const rows: ParsedImportRow[] = []
  for (let index = 0; index < table.rows.length; index++) {
    const row = table.rows[index]!
    const admissionNo = (row[admissionHeader] ?? '').trim()
    if (!admissionNo) continue
    let marksObtained: number | null = null
    try {
      marksObtained = parseMarksValue(row[marksHeader] ?? '')
    } catch {
      throw badRequest(`Row ${headerRowIndex + index + 2}: marks must be a number`)
    }
    const isAbsent = absentHeader ? parseAbsent(row[absentHeader] ?? '') : false
    const remarks = remarksHeader ? (row[remarksHeader] ?? '').trim() || null : null
    if (!isAbsent && marksObtained === null && !remarks) continue
    rows.push({
      line: headerRowIndex + index + 2,
      admissionNo,
      rollNumber: rollHeader ? (row[rollHeader] ?? '').trim() || null : null,
      marksObtained: isAbsent ? null : marksObtained,
      isAbsent,
      remarks,
      subject: subjectHeader ? (row[subjectHeader] ?? '').trim() || null : null,
      className: classHeader ? (row[classHeader] ?? '').trim() || null : null,
    })
  }
  if (rows.length === 0) throw badRequest('No mark rows found in the file')
  return rows
}

function matchStudentId(
  row: ParsedImportRow,
  byAdmission: Map<string, string>,
  byRoll: Map<string, string>,
): string | null {
  const admissionKey = normalizeAdmission(row.admissionNo)
  const byAdm = byAdmission.get(admissionKey)
  if (byAdm) return byAdm
  if (row.rollNumber) {
    const byR = byRoll.get(row.rollNumber.trim())
    if (byR) return byR
  }
  return null
}

export async function importPaperMarksFromSpreadsheet(
  ctx: AppContext,
  examId: string,
  examSubjectId: string,
  file: { buffer: Buffer; fileName: string; mimeType: string },
): Promise<MarksImportResult> {
  ctx.require('exams.marks')
  const parsed = parseImportRows(file.buffer, file.fileName, file.mimeType)
  const roster = await marksRoster(ctx, examId, examSubjectId)
  const byAdmission = new Map<string, string>()
  const byRoll = new Map<string, string>()
  for (const row of roster.rows) {
    byAdmission.set(normalizeAdmission(row.student.admissionNo), row.studentId)
    if (row.rollNumber != null) byRoll.set(String(row.rollNumber), row.studentId)
  }

  const issues: MarksImportIssue[] = []
  const saveRows: SaveRow[] = []
  const seen = new Set<string>()

  for (const row of parsed) {
    const studentId = matchStudentId(row, byAdmission, byRoll)
    if (!studentId) {
      issues.push({
        row: row.line,
        admissionNo: row.admissionNo,
        message: 'No matching student in this paper’s class',
      })
      continue
    }
    if (seen.has(studentId)) {
      issues.push({
        row: row.line,
        admissionNo: row.admissionNo,
        message: 'Duplicate student in the file — later row ignored',
      })
      continue
    }
    if (!row.isAbsent && row.marksObtained === null) {
      issues.push({
        row: row.line,
        admissionNo: row.admissionNo,
        message: 'Enter marks or mark the student absent',
      })
      continue
    }
    if (!row.isAbsent && row.marksObtained! > roster.maxMarks) {
      issues.push({
        row: row.line,
        admissionNo: row.admissionNo,
        message: `Marks cannot exceed ${roster.maxMarks}`,
      })
      continue
    }
    seen.add(studentId)
    saveRows.push({
      studentId,
      marksObtained: row.isAbsent ? null : row.marksObtained,
      isAbsent: row.isAbsent,
      remarks: row.remarks,
    })
  }

  if (saveRows.length === 0) {
    throw conflict(
      issues[0]?.message
        ? `No marks could be imported. ${issues[0].message}`
        : 'No marks could be imported from this file',
    )
  }

  const result = await saveMarks(ctx, examId, examSubjectId, { rows: saveRows })
  return {
    saved: result.saved,
    skipped: issues.length,
    issues: issues.slice(0, 40),
  }
}

export async function importExamMarksFromSpreadsheet(
  ctx: AppContext,
  examId: string,
  file: { buffer: Buffer; fileName: string; mimeType: string },
): Promise<MarksImportResult> {
  ctx.require('exams.marks')
  const parsed = parseImportRows(file.buffer, file.fileName, file.mimeType)
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId },
    select: {
      id: true,
      name: true,
      subjects: {
        select: {
          id: true,
          maxMarks: true,
          classSubject: {
            select: {
              classLevel: { select: { name: true } },
              subject: { select: { name: true } },
              teacherId: true,
            },
          },
        },
      },
    },
  })
  if (!exam) throw notFound('Exam')

  let subjects = exam.subjects
  if (!ctx.can('exams.manage')) {
    const staff = await ctx.db.staff.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } })
    subjects = subjects.filter((subject) => subject.classSubject.teacherId === staff?.id)
  }

  const paperKey = (className: string, subjectName: string) =>
    `${normalizeKey(className)}::${normalizeKey(subjectName)}`

  const papers = new Map<string, (typeof subjects)[number]>()
  const subjectNameCounts = new Map<string, number>()
  for (const subject of subjects) {
    const subjectOnly = normalizeKey(subject.classSubject.subject.name)
    subjectNameCounts.set(subjectOnly, (subjectNameCounts.get(subjectOnly) ?? 0) + 1)
  }
  for (const subject of subjects) {
    papers.set(
      paperKey(subject.classSubject.classLevel.name, subject.classSubject.subject.name),
      subject,
    )
    const subjectOnly = normalizeKey(subject.classSubject.subject.name)
    if ((subjectNameCounts.get(subjectOnly) ?? 0) === 1) {
      papers.set(subjectOnly, subject)
    }
  }

  const grouped = new Map<string, ParsedImportRow[]>()
  const issues: MarksImportIssue[] = []

  for (const row of parsed) {
    const subjectName = row.subject?.trim()
    if (!subjectName) {
      issues.push({
        row: row.line,
        admissionNo: row.admissionNo,
        message: 'Subject / Paper column is required for whole-exam upload',
      })
      continue
    }
    const key = row.className
      ? paperKey(row.className, subjectName)
      : normalizeKey(subjectName)
    const paper = papers.get(key)
    if (!paper) {
      issues.push({
        row: row.line,
        admissionNo: row.admissionNo,
        message: `Unknown paper “${row.className ? `${row.className} · ` : ''}${subjectName}”`,
      })
      continue
    }
    const list = grouped.get(paper.id) ?? []
    list.push(row)
    grouped.set(paper.id, list)
  }

  let saved = 0
  let papersTouched = 0
  for (const [examSubjectId, rows] of grouped) {
    const roster = await marksRoster(ctx, examId, examSubjectId)
    const byAdmission = new Map<string, string>()
    const byRoll = new Map<string, string>()
    for (const row of roster.rows) {
      byAdmission.set(normalizeAdmission(row.student.admissionNo), row.studentId)
      if (row.rollNumber != null) byRoll.set(String(row.rollNumber), row.studentId)
    }

    const saveRows: SaveRow[] = []
    const seen = new Set<string>()

    for (const row of rows) {
      const studentId = matchStudentId(row, byAdmission, byRoll)
      if (!studentId) {
        issues.push({
          row: row.line,
          admissionNo: row.admissionNo,
          message: 'No matching student in this paper’s class',
        })
        continue
      }
      if (seen.has(studentId)) {
        issues.push({
          row: row.line,
          admissionNo: row.admissionNo,
          message: 'Duplicate student for the same paper — later row ignored',
        })
        continue
      }
      if (!row.isAbsent && row.marksObtained === null) {
        issues.push({
          row: row.line,
          admissionNo: row.admissionNo,
          message: 'Enter marks or mark the student absent',
        })
        continue
      }
      if (!row.isAbsent && row.marksObtained! > roster.maxMarks) {
        issues.push({
          row: row.line,
          admissionNo: row.admissionNo,
          message: `Marks cannot exceed ${roster.maxMarks}`,
        })
        continue
      }
      seen.add(studentId)
      saveRows.push({
        studentId,
        marksObtained: row.isAbsent ? null : row.marksObtained,
        isAbsent: row.isAbsent,
        remarks: row.remarks,
      })
    }

    if (saveRows.length === 0) continue
    const result = await saveMarks(ctx, examId, examSubjectId, { rows: saveRows })
    saved += result.saved
    papersTouched += 1
  }

  if (saved === 0) {
    throw conflict(
      issues[0]?.message
        ? `No marks could be imported. ${issues[0].message}`
        : 'No marks could be imported from this file',
    )
  }

  return {
    saved,
    skipped: issues.length,
    issues: issues.slice(0, 40),
    papers: papersTouched,
  }
}

export async function buildExamMarksTemplateCsv(ctx: AppContext, examId: string) {
  ctx.require('exams.marks')
  const setup = await examMarksSetup(ctx, examId)
  const rows: Array<Array<string | number | null>> = []
  for (const subject of setup.subjects) {
    const roster = await marksRoster(ctx, examId, subject.id)
    for (const row of roster.rows) {
      rows.push([
        row.student.admissionNo,
        subject.classSubject.classLevel.name,
        subject.classSubject.subject.name,
        row.mark?.isAbsent ? '' : (row.mark?.marksObtained ?? ''),
        row.mark?.isAbsent ? 'Y' : '',
        row.mark?.remarks ?? '',
      ])
    }
  }
  return {
    filename: `${setup.name.replace(/[^\w]+/g, '-')}-all-papers-marks.csv`,
    csv: toCsv(['Admission No', 'Class', 'Subject', 'Marks', 'Absent', 'Remarks'], rows),
  }
}

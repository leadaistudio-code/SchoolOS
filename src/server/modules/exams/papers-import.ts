import type { AppContext } from '@/server/context'
import { badRequest, conflict } from '@/server/api/response'
import { toCsv } from '@/lib/csv'
import { gridToTable, parseSpreadsheet } from '@/lib/spreadsheet'
import { createExam, examSetup, getExamDetail, updateExamPapers } from './service'

type Issue = { row: number; message: string }

const HEADER_ALIASES = {
  examName: ['exam name', 'exam', 'examination', 'name'],
  kind: ['kind', 'type', 'exam type', 'exam kind'],
  className: ['class', 'class name', 'class level'],
  subject: ['subject', 'paper', 'subject name'],
  subjectCode: ['subject code', 'code'],
  maxMarks: ['max marks', 'maximum marks', 'max', 'total marks'],
  passMarks: ['pass marks', 'pass', 'passing marks'],
  examDate: ['exam date', 'date', 'paper date'],
  startTime: ['start time', 'starts', 'from'],
  endTime: ['end time', 'ends', 'to'],
  roomName: ['room', 'room name', 'venue', 'hall'],
  startsOn: ['starts on', 'exam starts', 'window start'],
  endsOn: ['ends on', 'exam ends', 'window end'],
  gradingScale: ['grading scale', 'scale', 'grade scale'],
} as const

const KIND_ALIASES: Record<string, 'WEEKLY' | 'MONTHLY' | 'UNIT_TEST' | 'MID_TERM' | 'FINAL' | 'PRACTICAL' | 'CUSTOM'> = {
  weekly: 'WEEKLY',
  month: 'MONTHLY',
  monthly: 'MONTHLY',
  unit: 'UNIT_TEST',
  'unit test': 'UNIT_TEST',
  unittest: 'UNIT_TEST',
  mid: 'MID_TERM',
  'mid term': 'MID_TERM',
  midterm: 'MID_TERM',
  final: 'FINAL',
  practical: 'PRACTICAL',
  custom: 'CUSTOM',
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function findHeader(headers: string[], aliases: readonly string[]) {
  const wanted = new Set(aliases.map(normalizeKey))
  return headers.find((header) => wanted.has(normalizeKey(header))) ?? null
}

function pickHeaderRow(grid: string[][], required: readonly (readonly string[])[]) {
  const limit = Math.min(grid.length, 12)
  for (let index = 0; index < limit; index++) {
    const headers = (grid[index] ?? []).map((cell) => cell.trim()).filter(Boolean)
    if (headers.length < 2) continue
    if (required.every((aliases) => findHeader(headers, aliases))) return index
  }
  return 0
}

function parseTime(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i)
  if (!match) throw new Error('Use HH:MM time, e.g. 09:30 or 2:00 PM')
  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridian = match[3]?.toLowerCase()
  if (meridian === 'pm' && hours < 12) hours += 12
  if (meridian === 'am' && hours === 12) hours = 0
  if (hours > 23 || minutes > 59) throw new Error('Use HH:MM time, e.g. 09:30')
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function parseDate(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const slash = trimmed.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/)
  if (slash) {
    const day = Number(slash[1])
    const month = Number(slash[2])
    const year = Number(slash[3])
    // Prefer DMY for Indian schools when day > 12; otherwise still treat as DMY.
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  throw new Error('Use YYYY-MM-DD or DD/MM/YYYY for dates')
}

function parseKind(value: string) {
  const key = normalizeKey(value)
  if (!key) return 'CUSTOM' as const
  const mapped = KIND_ALIASES[key]
  if (mapped) return mapped
  const upper = value.trim().toUpperCase().replace(/\s+/g, '_')
  if (upper in KIND_ALIASES || ['WEEKLY', 'MONTHLY', 'UNIT_TEST', 'MID_TERM', 'FINAL', 'PRACTICAL', 'CUSTOM'].includes(upper)) {
    return upper as 'WEEKLY' | 'MONTHLY' | 'UNIT_TEST' | 'MID_TERM' | 'FINAL' | 'PRACTICAL' | 'CUSTOM'
  }
  throw new Error(`Unknown exam kind “${value}”`)
}

function parseNumber(value: string, label: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const number = Number(trimmed)
  if (!Number.isFinite(number)) throw new Error(`${label} must be a number`)
  return number
}

function paperKey(className: string, subjectName: string, subjectCode?: string | null) {
  if (subjectCode?.trim()) return `${normalizeKey(className)}::code:${normalizeKey(subjectCode)}`
  return `${normalizeKey(className)}::${normalizeKey(subjectName)}`
}

type ScheduleRow = {
  line: number
  className: string
  subjectName: string
  subjectCode: string | null
  maxMarks: number | null
  passMarks: number | null
  examDate?: string
  startTime?: string
  endTime?: string
  roomName?: string
}

function parseScheduleTable(buffer: Buffer, fileName: string, mimeType: string) {
  const spreadsheet = parseSpreadsheet(buffer, fileName, mimeType)
  if (spreadsheet.grid.length === 0) throw badRequest('The spreadsheet is empty')
  const headerRowIndex = pickHeaderRow(spreadsheet.grid, [HEADER_ALIASES.className, HEADER_ALIASES.subject])
  const table = gridToTable(spreadsheet.grid, headerRowIndex)
  const classHeader = findHeader(table.headers, HEADER_ALIASES.className)
  const subjectHeader = findHeader(table.headers, HEADER_ALIASES.subject)
  if (!classHeader || !subjectHeader) {
    throw badRequest('The file needs “Class” and “Subject” columns')
  }
  return {
    headerRowIndex,
    table,
    classHeader,
    subjectHeader,
    subjectCodeHeader: findHeader(table.headers, HEADER_ALIASES.subjectCode),
    maxHeader: findHeader(table.headers, HEADER_ALIASES.maxMarks),
    passHeader: findHeader(table.headers, HEADER_ALIASES.passMarks),
    dateHeader: findHeader(table.headers, HEADER_ALIASES.examDate),
    startHeader: findHeader(table.headers, HEADER_ALIASES.startTime),
    endHeader: findHeader(table.headers, HEADER_ALIASES.endTime),
    roomHeader: findHeader(table.headers, HEADER_ALIASES.roomName),
    examNameHeader: findHeader(table.headers, HEADER_ALIASES.examName),
    kindHeader: findHeader(table.headers, HEADER_ALIASES.kind),
    startsOnHeader: findHeader(table.headers, HEADER_ALIASES.startsOn),
    endsOnHeader: findHeader(table.headers, HEADER_ALIASES.endsOn),
    scaleHeader: findHeader(table.headers, HEADER_ALIASES.gradingScale),
  }
}

function readScheduleRow(
  row: Record<string, string>,
  line: number,
  headers: ReturnType<typeof parseScheduleTable>,
): ScheduleRow {
  const className = (row[headers.classHeader] ?? '').trim()
  const subjectName = (row[headers.subjectHeader] ?? '').trim()
  if (!className || !subjectName) throw new Error('Class and Subject are required')
  return {
    line,
    className,
    subjectName,
    subjectCode: headers.subjectCodeHeader ? (row[headers.subjectCodeHeader] ?? '').trim() || null : null,
    maxMarks: headers.maxHeader ? parseNumber(row[headers.maxHeader] ?? '', 'Max marks') : null,
    passMarks: headers.passHeader ? parseNumber(row[headers.passHeader] ?? '', 'Pass marks') : null,
    examDate: headers.dateHeader ? parseDate(row[headers.dateHeader] ?? '') : undefined,
    startTime: headers.startHeader ? parseTime(row[headers.startHeader] ?? '') : undefined,
    endTime: headers.endHeader ? parseTime(row[headers.endHeader] ?? '') : undefined,
    roomName: headers.roomHeader ? (row[headers.roomHeader] ?? '').trim() || undefined : undefined,
  }
}

function formatDateCell(value: Date | string | null) {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export async function buildExamPapersTemplateCsv(ctx: AppContext, examId: string) {
  ctx.require('exams.manage')
  const exam = await getExamDetail(ctx, examId)
  const rows = exam.subjects.map((paper) => [
    paper.classSubject.classLevel.name,
    paper.classSubject.subject.name,
    paper.classSubject.subject.code,
    paper.maxMarks,
    paper.passMarks,
    formatDateCell(paper.examDate),
    paper.startTime ?? '',
    paper.endTime ?? '',
    paper.roomName ?? '',
  ])
  return {
    filename: `${exam.name.replace(/[^\w]+/g, '-')}-papers-schedule.csv`,
    csv: toCsv(
      ['Class', 'Subject', 'Subject Code', 'Max Marks', 'Pass Marks', 'Exam Date', 'Start Time', 'End Time', 'Room'],
      rows,
    ),
  }
}

export async function buildNewExamTemplateCsv(ctx: AppContext) {
  ctx.require('exams.manage')
  const setup = await examSetup(ctx)
  const rows = setup.classes.flatMap((classLevel) =>
    classLevel.subjects.map((subject) => [
      'Mid Term 2026',
      'MID_TERM',
      classLevel.name,
      subject.subject.name,
      subject.subject.code,
      100,
      33,
      '',
      '',
      '',
      '',
      '',
      '',
      setup.scales.find((scale) => scale.isDefault)?.name ?? setup.scales[0]?.name ?? '',
    ]),
  )
  return {
    filename: `new-exam-setup-${setup.session.name.replace(/[^\w]+/g, '-')}.csv`,
    csv: toCsv(
      [
        'Exam Name',
        'Kind',
        'Class',
        'Subject',
        'Subject Code',
        'Max Marks',
        'Pass Marks',
        'Exam Date',
        'Start Time',
        'End Time',
        'Room',
        'Starts On',
        'Ends On',
        'Grading Scale',
      ],
      rows,
    ),
  }
}

export async function importExamPapersFromSpreadsheet(
  ctx: AppContext,
  examId: string,
  file: { buffer: Buffer; fileName: string; mimeType: string },
) {
  ctx.require('exams.manage')
  const headers = parseScheduleTable(file.buffer, file.fileName, file.mimeType)
  const exam = await getExamDetail(ctx, examId)
  if (exam.status === 'PUBLISHED') throw conflict('Papers cannot be changed after publishing')

  const byKey = new Map<string, (typeof exam.subjects)[number]>()
  for (const paper of exam.subjects) {
    byKey.set(
      paperKey(paper.classSubject.classLevel.name, paper.classSubject.subject.name),
      paper,
    )
    byKey.set(
      paperKey(paper.classSubject.classLevel.name, paper.classSubject.subject.name, paper.classSubject.subject.code),
      paper,
    )
  }

  const issues: Issue[] = []
  const updates: {
    id: string
    maxMarks: number
    passMarks: number
    examDate?: string
    startTime?: string
    endTime?: string
    roomName?: string
  }[] = []
  const seen = new Set<string>()

  for (let index = 0; index < headers.table.rows.length; index++) {
    const line = headers.headerRowIndex + index + 2
    const raw = headers.table.rows[index]!
    try {
      const row = readScheduleRow(raw, line, headers)
      const paper =
        byKey.get(paperKey(row.className, row.subjectName, row.subjectCode)) ??
        byKey.get(paperKey(row.className, row.subjectName))
      if (!paper) {
        issues.push({ row: line, message: `No paper “${row.className} · ${row.subjectName}” on this exam` })
        continue
      }
      if (seen.has(paper.id)) {
        issues.push({ row: line, message: `Duplicate paper “${row.className} · ${row.subjectName}” — later row ignored` })
        continue
      }
      const maxMarks = row.maxMarks ?? paper.maxMarks
      const passMarks = row.passMarks ?? paper.passMarks
      if (passMarks > maxMarks) {
        issues.push({ row: line, message: 'Pass marks cannot exceed maximum marks' })
        continue
      }
      seen.add(paper.id)
      updates.push({
        id: paper.id,
        maxMarks,
        passMarks,
        examDate: row.examDate ?? (formatDateCell(paper.examDate) || undefined),
        startTime: row.startTime ?? paper.startTime ?? undefined,
        endTime: row.endTime ?? paper.endTime ?? undefined,
        roomName: row.roomName ?? paper.roomName ?? undefined,
      })
    } catch (error) {
      issues.push({
        row: line,
        message: error instanceof Error ? error.message : 'Invalid row',
      })
    }
  }

  if (updates.length === 0) {
    throw conflict(issues[0]?.message ? `No papers updated. ${issues[0].message}` : 'No papers updated')
  }

  const result = await updateExamPapers(ctx, examId, { papers: updates })
  return { updated: result.updated, skipped: issues.length, issues: issues.slice(0, 40) }
}

export async function createExamsFromSpreadsheet(
  ctx: AppContext,
  file: { buffer: Buffer; fileName: string; mimeType: string },
) {
  ctx.require('exams.manage')
  const headers = parseScheduleTable(file.buffer, file.fileName, file.mimeType)
  if (!headers.examNameHeader) {
    throw badRequest('The file needs an “Exam Name” column to create examinations')
  }

  const setup = await examSetup(ctx)
  const classSubjects = new Map<string, { classLevelId: string; classSubjectId: string }>()
  for (const classLevel of setup.classes) {
    for (const subject of classLevel.subjects) {
      classSubjects.set(paperKey(classLevel.name, subject.subject.name), {
        classLevelId: classLevel.id,
        classSubjectId: subject.id,
      })
      classSubjects.set(paperKey(classLevel.name, subject.subject.name, subject.subject.code), {
        classLevelId: classLevel.id,
        classSubjectId: subject.id,
      })
    }
  }
  const scalesByName = new Map(setup.scales.map((scale) => [normalizeKey(scale.name), scale.id]))

  type Group = {
    name: string
    kind: ReturnType<typeof parseKind>
    startsOn?: string
    endsOn?: string
    gradingScaleId?: string
    rows: ScheduleRow[]
    firstLine: number
  }

  const groups = new Map<string, Group>()
  const issues: Issue[] = []

  for (let index = 0; index < headers.table.rows.length; index++) {
    const line = headers.headerRowIndex + index + 2
    const raw = headers.table.rows[index]!
    const examName = (raw[headers.examNameHeader] ?? '').trim()
    if (!examName) {
      issues.push({ row: line, message: 'Exam Name is required' })
      continue
    }
    try {
      const row = readScheduleRow(raw, line, headers)
      const kind = parseKind(headers.kindHeader ? (raw[headers.kindHeader] ?? '') : 'CUSTOM')
      const startsOn = headers.startsOnHeader ? parseDate(raw[headers.startsOnHeader] ?? '') : undefined
      const endsOn = headers.endsOnHeader ? parseDate(raw[headers.endsOnHeader] ?? '') : undefined
      const scaleName = headers.scaleHeader ? (raw[headers.scaleHeader] ?? '').trim() : ''
      const gradingScaleId = scaleName ? scalesByName.get(normalizeKey(scaleName)) : undefined
      if (scaleName && !gradingScaleId) {
        issues.push({ row: line, message: `Unknown grading scale “${scaleName}”` })
        continue
      }
      const match =
        classSubjects.get(paperKey(row.className, row.subjectName, row.subjectCode)) ??
        classSubjects.get(paperKey(row.className, row.subjectName))
      if (!match) {
        issues.push({
          row: line,
          message: `No timetable subject “${row.className} · ${row.subjectName}” in ${setup.session.name}`,
        })
        continue
      }
      const key = normalizeKey(examName)
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, {
          name: examName,
          kind,
          startsOn,
          endsOn,
          gradingScaleId,
          rows: [row],
          firstLine: line,
        })
      } else {
        existing.rows.push(row)
        if (!existing.startsOn && startsOn) existing.startsOn = startsOn
        if (!existing.endsOn && endsOn) existing.endsOn = endsOn
        if (!existing.gradingScaleId && gradingScaleId) existing.gradingScaleId = gradingScaleId
      }
    } catch (error) {
      issues.push({
        row: line,
        message: error instanceof Error ? error.message : 'Invalid row',
      })
    }
  }

  if (groups.size === 0) {
    throw conflict(issues[0]?.message ? `No exams created. ${issues[0].message}` : 'No exams created')
  }

  const created: { id: string; name: string; papers: number }[] = []

  for (const group of groups.values()) {
    const classLevelIds = [...new Set(
      group.rows
        .map((row) => {
          const match =
            classSubjects.get(paperKey(row.className, row.subjectName, row.subjectCode)) ??
            classSubjects.get(paperKey(row.className, row.subjectName))
          return match?.classLevelId
        })
        .filter((id): id is string => Boolean(id)),
    )]
    const classSubjectIds = [...new Set(
      group.rows
        .map((row) => {
          const match =
            classSubjects.get(paperKey(row.className, row.subjectName, row.subjectCode)) ??
            classSubjects.get(paperKey(row.className, row.subjectName))
          return match?.classSubjectId
        })
        .filter((id): id is string => Boolean(id)),
    )]

    if (classSubjectIds.length === 0) {
      issues.push({ row: group.firstLine, message: `Exam “${group.name}” has no valid subjects` })
      continue
    }

    try {
      const exam = await createExam(ctx, {
        name: group.name,
        kind: group.kind,
        startsOn: group.startsOn,
        endsOn: group.endsOn,
        gradingScaleId: group.gradingScaleId,
        classLevelIds,
        classSubjectIds,
      })

      const detail = await getExamDetail(ctx, exam.id)
      const byKey = new Map<string, string>()
      for (const paper of detail.subjects) {
        byKey.set(paperKey(paper.classSubject.classLevel.name, paper.classSubject.subject.name), paper.id)
        byKey.set(
          paperKey(paper.classSubject.classLevel.name, paper.classSubject.subject.name, paper.classSubject.subject.code),
          paper.id,
        )
      }

      const papers = group.rows
        .map((row) => {
          const id =
            byKey.get(paperKey(row.className, row.subjectName, row.subjectCode)) ??
            byKey.get(paperKey(row.className, row.subjectName))
          if (!id) return null
          const maxMarks = row.maxMarks ?? 100
          const passMarks = row.passMarks ?? Math.min(33, maxMarks)
          if (passMarks > maxMarks) {
            issues.push({
              row: row.line,
              message: `Pass marks cannot exceed maximum marks for ${row.className} · ${row.subjectName}`,
            })
            return null
          }
          return {
            id,
            maxMarks,
            passMarks,
            examDate: row.examDate,
            startTime: row.startTime,
            endTime: row.endTime,
            roomName: row.roomName,
          }
        })
        .filter((paper): paper is NonNullable<typeof paper> => Boolean(paper))

      // Deduplicate paper ids (same subject listed twice) — keep first
      const unique = new Map<string, (typeof papers)[number]>()
      for (const paper of papers) {
        if (!unique.has(paper.id)) unique.set(paper.id, paper)
      }
      const uniquePapers = [...unique.values()]
      if (uniquePapers.length > 0) {
        await updateExamPapers(ctx, exam.id, { papers: uniquePapers })
      }
      created.push({ id: exam.id, name: exam.name, papers: uniquePapers.length })
    } catch (error) {
      issues.push({
        row: group.firstLine,
        message: error instanceof Error ? error.message : `Could not create exam “${group.name}”`,
      })
    }
  }

  if (created.length === 0) {
    throw conflict(issues[0]?.message ? `No exams created. ${issues[0].message}` : 'No exams created')
  }

  return {
    created: created.length,
    exams: created,
    skipped: issues.length,
    issues: issues.slice(0, 40),
  }
}

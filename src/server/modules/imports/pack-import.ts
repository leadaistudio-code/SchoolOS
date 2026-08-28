import * as XLSX from 'xlsx'
import type { Prisma } from '@prisma/client'
import { splitPersonName } from '@/lib/person-name'
import { gridToTable } from '@/lib/spreadsheet'
import { attendanceDate } from '@/lib/dates'
import type { AppContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { findOrRestore } from '@/server/db/soft-delete'
import { assignSubjectToClass } from '@/server/modules/academics/service'
import { createSession } from '@/server/modules/settings/sessions'
import { isOnboardingPack } from './onboarding-pack'

const SKIP_SHEETS = new Set(['read me', 'allowed values'])

export type PackSheetTable = { headers: string[]; rows: Record<string, string>[] }

export type PackWorkbook = {
  sheetNames: string[]
  sheets: Record<string, PackSheetTable>
}

export type PackClassLookup = {
  id: string
  name: string
  numeric: number
  sections: Array<{ id: string; name: string; capacity: number; enrolled: number }>
}

export type PackSheetStat = {
  sheet: string
  rows: number
  valid: number
  errors: number
}

export type PackRowError = {
  sheet: string
  row: number
  message: string
}

export type PackValidation = {
  isPack: boolean
  sheetStats: PackSheetStat[]
  packErrors: PackRowError[]
  projectedClasses: PackClassLookup[]
  hasParentsSheet: boolean
}

export type PackCommitStats = {
  sessions: number
  classes: number
  sections: number
  staff: number
  subjects: number
  classSubjects: number
  parents: number
  parentLinks: number
}

function formatCell(value: string | number | boolean | Date | null | undefined): string {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return value.toISOString().slice(0, 10)
  }
  return String(value).trim()
}

function sheetTable(name: string, grid: string[][]): PackSheetTable | null {
  if (grid.length === 0) return null
  const table = gridToTable(grid, 0)
  if (table.rows.length === 0) return null
  return table
}

/** Parse every data sheet in an onboarding workbook. */
export function parsePackWorkbook(buffer: Buffer): PackWorkbook {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false })
  const sheets: Record<string, PackSheetTable> = {}

  for (const name of workbook.SheetNames) {
    if (SKIP_SHEETS.has(name.toLowerCase())) continue
    const sheet = workbook.Sheets[name]!
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    })
    const grid = rows.map((row) => row.map((cell) => formatCell(cell)))
    const table = sheetTable(name, grid)
    if (table) sheets[name] = table
  }

  return { sheetNames: workbook.SheetNames, sheets }
}

function cell(row: Record<string, string>, header: string): string {
  return (row[header] ?? '').trim()
}

function readStaffName(row: Record<string, string>): { firstName: string; lastName: string } {
  const full =
    cell(row, 'Name') ||
    cell(row, 'Staff name') ||
    cell(row, 'Employee name') ||
    ''
  if (full) return splitPersonName(full)

  const first = cell(row, 'First name')
  const last = cell(row, 'Last name')
  if (first && !last) return splitPersonName(first)
  if (first || last) return splitPersonName([first, last].filter(Boolean).join(' '))
  return { firstName: '', lastName: '' }
}

function readParentName(row: Record<string, string>): { firstName: string; lastName: string } {
  const full =
    cell(row, 'Parent name') ||
    cell(row, 'Guardian name') ||
    [cell(row, 'First name'), cell(row, 'Last name')].filter(Boolean).join(' ')
  return splitPersonName(full)
}

function parseYesNo(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v === 'yes' || v === 'y' || v === 'true' || v === '1'
}

function parseGender(value: string): 'MALE' | 'FEMALE' | 'OTHER' | undefined {
  if (!value) return undefined
  const v = value.trim().toLowerCase()
  if (['m', 'male', 'boy', 'b'].includes(v)) return 'MALE'
  if (['f', 'female', 'girl', 'g'].includes(v)) return 'FEMALE'
  if (['o', 'other', 'others'].includes(v)) return 'OTHER'
  return undefined
}

function parseRelation(value: string): 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER' | undefined {
  if (!value) return undefined
  const v = value.trim().toLowerCase()
  if (['father', 'dad', 'papa', 'f'].includes(v)) return 'FATHER'
  if (['mother', 'mom', 'mum', 'mama', 'm'].includes(v)) return 'MOTHER'
  if (['guardian', 'g'].includes(v)) return 'GUARDIAN'
  if (['other', 'o'].includes(v)) return 'OTHER'
  return undefined
}

function parseIsoDate(value: string): string | undefined {
  if (!value) return undefined
  const v = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!m) return undefined
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function findSheet(workbook: PackWorkbook, ...names: string[]): PackSheetTable | undefined {
  for (const name of names) {
    const hit = workbook.sheets[name]
    if (hit) return hit
    const ci = Object.entries(workbook.sheets).find(
      ([k]) => k.toLowerCase() === name.toLowerCase(),
    )
    if (ci) return ci[1]
  }
  return undefined
}

function stat(sheet: string, rows: number, errors: PackRowError[]): PackSheetStat {
  const sheetErrors = errors.filter((e) => e.sheet === sheet)
  return {
    sheet,
    rows,
    valid: Math.max(0, rows - sheetErrors.length),
    errors: sheetErrors.length,
  }
}

/**
 * Dry-run validation for every sheet in the pack.
 * Builds a projected class/section tree so student rows can be checked before commit.
 */
export function validatePack(workbook: PackWorkbook): PackValidation {
  const isPack = isOnboardingPack(workbook.sheetNames)
  if (!isPack) {
    return {
      isPack: false,
      sheetStats: [],
      packErrors: [],
      projectedClasses: [],
      hasParentsSheet: false,
    }
  }

  const errors: PackRowError[] = []
  const classMap = new Map<string, PackClassLookup>()
  const staffCodes = new Set<string>()
  const subjectCodes = new Set<string>()
  const admissionNos = new Set<string>()

  const classesSheet = findSheet(workbook, 'Classes')
  if (classesSheet) {
    for (let i = 0; i < classesSheet.rows.length; i++) {
      const row = classesSheet.rows[i]!
      const name = cell(row, 'Class')
      const numericRaw = cell(row, 'Numeric')
      if (!name) {
        errors.push({ sheet: 'Classes', row: i + 2, message: 'Class name is missing' })
        continue
      }
      const numeric = numericRaw ? Number(numericRaw) : NaN
      if (!Number.isInteger(numeric) || numeric < 0) {
        errors.push({ sheet: 'Classes', row: i + 2, message: 'Numeric must be a whole number' })
        continue
      }
      if (!classMap.has(name.toLowerCase())) {
        classMap.set(name.toLowerCase(), {
          id: `pack:class:${name}`,
          name,
          numeric,
          sections: [],
        })
      }
    }
  }

  const sectionsSheet = findSheet(workbook, 'Sections')
  if (sectionsSheet) {
    for (let i = 0; i < sectionsSheet.rows.length; i++) {
      const row = sectionsSheet.rows[i]!
      const className = cell(row, 'Class')
      const sectionName = cell(row, 'Section')
      const capacityRaw = cell(row, 'Capacity') || '40'
      const teacherCode = cell(row, 'Class teacher employee code')
      if (!className || !sectionName) {
        errors.push({ sheet: 'Sections', row: i + 2, message: 'Class and Section are required' })
        continue
      }
      const capacity = Number(capacityRaw)
      if (!Number.isInteger(capacity) || capacity < 1) {
        errors.push({ sheet: 'Sections', row: i + 2, message: 'Capacity must be at least 1' })
        continue
      }
      if (teacherCode && !staffCodes.has(teacherCode)) {
        // Will be validated when Staff sheet is processed; defer cross-ref
      }
      let cls = classMap.get(className.toLowerCase())
      if (!cls) {
        cls = {
          id: `pack:class:${className}`,
          name: className,
          numeric: 0,
          sections: [],
        }
        classMap.set(className.toLowerCase(), cls)
      }
      if (cls.sections.some((s) => s.name.toLowerCase() === sectionName.toLowerCase())) {
        errors.push({
          sheet: 'Sections',
          row: i + 2,
          message: `Section ${sectionName} is duplicated for ${className}`,
        })
        continue
      }
      cls.sections.push({
        id: `pack:section:${className}:${sectionName}`,
        name: sectionName,
        capacity,
        enrolled: 0,
      })
    }
  }

  const staffSheet = findSheet(workbook, 'Staff')
  const staffCodesOnSheet = new Set<string>()
  if (staffSheet) {
    for (const row of staffSheet.rows) {
      const code = cell(row, 'Employee code')
      if (code) staffCodesOnSheet.add(code.toLowerCase())
    }
  }

  if (staffSheet) {
    for (let i = 0; i < staffSheet.rows.length; i++) {
      const row = staffSheet.rows[i]!
      const code = cell(row, 'Employee code')
      const { firstName } = readStaffName(row)
      if (!code) {
        errors.push({ sheet: 'Staff', row: i + 2, message: 'Employee code is missing' })
        continue
      }
      if (staffCodes.has(code.toLowerCase())) {
        errors.push({ sheet: 'Staff', row: i + 2, message: `Employee code ${code} is duplicated` })
        continue
      }
      if (!firstName) {
        errors.push({ sheet: 'Staff', row: i + 2, message: 'Name is required' })
        continue
      }
      staffCodes.add(code.toLowerCase())
    }
    // Cross-check section class teachers against codes listed on the Staff sheet.
    if (sectionsSheet) {
      for (let i = 0; i < sectionsSheet.rows.length; i++) {
        const code = cell(sectionsSheet.rows[i]!, 'Class teacher employee code')
        if (code && !staffCodesOnSheet.has(code.toLowerCase())) {
          errors.push({
            sheet: 'Sections',
            row: i + 2,
            message: `Unknown employee code ${code} for class teacher`,
          })
        }
      }
    }
  }

  const subjectsSheet = findSheet(workbook, 'Subjects')
  if (subjectsSheet) {
    for (let i = 0; i < subjectsSheet.rows.length; i++) {
      const row = subjectsSheet.rows[i]!
      const code = cell(row, 'Subject code').toUpperCase()
      const name = cell(row, 'Subject name')
      if (!code || !name) {
        errors.push({ sheet: 'Subjects', row: i + 2, message: 'Subject code and name are required' })
        continue
      }
      if (subjectCodes.has(code)) {
        errors.push({ sheet: 'Subjects', row: i + 2, message: `Subject code ${code} is duplicated` })
        continue
      }
      subjectCodes.add(code)
    }
  }

  const classSubjectsSheet = findSheet(workbook, 'Class subjects')
  if (classSubjectsSheet) {
    for (let i = 0; i < classSubjectsSheet.rows.length; i++) {
      const row = classSubjectsSheet.rows[i]!
      const className = cell(row, 'Class')
      const code = cell(row, 'Subject code').toUpperCase()
      const teacherCode = cell(row, 'Teacher employee code')
      if (!className || !code) {
        errors.push({
          sheet: 'Class subjects',
          row: i + 2,
          message: 'Class and Subject code are required',
        })
        continue
      }
      if (!classMap.has(className.toLowerCase())) {
        errors.push({
          sheet: 'Class subjects',
          row: i + 2,
          message: `Unknown class ${className}`,
        })
      }
      if (subjectsSheet && !subjectCodes.has(code)) {
        errors.push({
          sheet: 'Class subjects',
          row: i + 2,
          message: `Unknown subject code ${code}`,
        })
      }
      if (teacherCode && staffSheet && !staffCodesOnSheet.has(teacherCode.toLowerCase())) {
        errors.push({
          sheet: 'Class subjects',
          row: i + 2,
          message: `Unknown employee code ${teacherCode}`,
        })
      }
    }
  }

  const studentsSheet = findSheet(workbook, 'Students')
  if (studentsSheet) {
    for (let i = 0; i < studentsSheet.rows.length; i++) {
      const row = studentsSheet.rows[i]!
      const admission =
        cell(row, 'Admission number') || cell(row, 'Admission No') || cell(row, 'Admission no')
      const className = cell(row, 'Class')
      const sectionName = cell(row, 'Section')
      if (!admission) {
        errors.push({ sheet: 'Students', row: i + 2, message: 'Admission number is missing' })
        continue
      }
      if (admissionNos.has(admission.toLowerCase())) {
        errors.push({
          sheet: 'Students',
          row: i + 2,
          message: `Admission number ${admission} is duplicated`,
        })
        continue
      }
      admissionNos.add(admission.toLowerCase())
      if (className) {
        const cls = classMap.get(className.toLowerCase())
        if (!cls) {
          errors.push({ sheet: 'Students', row: i + 2, message: `Unknown class ${className}` })
        } else if (sectionName) {
          const sec = cls.sections.find(
            (s) => s.name.localeCompare(sectionName, undefined, { sensitivity: 'accent' }) === 0,
          )
          if (!sec) {
            errors.push({
              sheet: 'Students',
              row: i + 2,
              message: `Unknown section ${sectionName} for ${className}`,
            })
          }
        }
      }
    }
  }

  const parentsSheet = findSheet(workbook, 'Parents')
  const hasParentsSheet = Boolean(parentsSheet && parentsSheet.rows.length > 0)
  if (parentsSheet) {
    for (let i = 0; i < parentsSheet.rows.length; i++) {
      const row = parentsSheet.rows[i]!
      const admission =
        cell(row, 'Student admission no') || cell(row, 'Student admission number')
      const parentName = readParentName(row)
      if (!admission) {
        errors.push({ sheet: 'Parents', row: i + 2, message: 'Student admission no is missing' })
        continue
      }
      if (studentsSheet && !admissionNos.has(admission.toLowerCase())) {
        errors.push({
          sheet: 'Parents',
          row: i + 2,
          message: `No student with admission ${admission} on the Students sheet`,
        })
      }
      if (!parentName.firstName) {
        errors.push({ sheet: 'Parents', row: i + 2, message: 'Parent name is required' })
      }
    }
  }

  const sheetStats: PackSheetStat[] = []
  for (const [name, table] of Object.entries(workbook.sheets)) {
    if (name === 'School') continue
    sheetStats.push(stat(name, table.rows.length, errors))
  }

  return {
    isPack: true,
    sheetStats,
    packErrors: errors.slice(0, 200),
    projectedClasses: [...classMap.values()],
    hasParentsSheet,
  }
}

/** Merge pack-projected classes with what is already in the database. */
export function mergeClassLookups(
  dbClasses: PackClassLookup[],
  projected: PackClassLookup[],
): PackClassLookup[] {
  const byName = new Map<string, PackClassLookup>()
  for (const cls of projected) {
    byName.set(cls.name.toLowerCase(), { ...cls, sections: [...cls.sections] })
  }
  for (const cls of dbClasses) {
    const key = cls.name.toLowerCase()
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, cls)
      continue
    }
    existing.id = cls.id
    existing.numeric = cls.numeric
    for (const sec of cls.sections) {
      const hit = existing.sections.find(
        (s) => s.name.localeCompare(sec.name, undefined, { sensitivity: 'accent' }) === 0,
      )
      if (hit) {
        hit.id = sec.id
        hit.capacity = sec.capacity
        hit.enrolled = sec.enrolled
      } else {
        existing.sections.push(sec)
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.numeric - b.numeric)
}

async function resolveSession(ctx: AppContext, workbook: PackWorkbook) {
  const sessionSheet = findSheet(workbook, 'Session')
  if (!sessionSheet || sessionSheet.rows.length === 0) {
    return ctx.db.academicSession.findFirst({ where: { isCurrent: true } })
  }

  const row = sessionSheet.rows[0]!
  const name = cell(row, 'Session name')
  const startsOn = parseIsoDate(cell(row, 'Starts on'))
  const endsOn = parseIsoDate(cell(row, 'Ends on'))
  const makeCurrent = parseYesNo(cell(row, 'Is current'))

  if (!name || !startsOn || !endsOn) return ctx.db.academicSession.findFirst({ where: { isCurrent: true } })

  const existing = await ctx.db.academicSession.findFirst({ where: { name } })
  if (existing) {
    if (makeCurrent && !existing.isCurrent) {
      await ctx.db.$transaction(async (tx) => {
        await tx.academicSession.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } })
        await tx.academicSession.update({ where: { id: existing.id }, data: { isCurrent: true } })
      })
    }
    return ctx.db.academicSession.findFirst({ where: { id: existing.id } })
  }

  ctx.require('academics.manage')
  return createSession(ctx, { name, startsOn, endsOn, makeCurrent })
}

/**
 * Import structure sheets — session, classes, staff, sections, subjects, class subjects.
 * Call before student rows are committed so class/section/staff links resolve.
 */
export async function commitPackStructure(
  ctx: AppContext,
  workbook: PackWorkbook,
): Promise<{ stats: PackCommitStats; staffByCode: Map<string, string>; classByName: Map<string, string>; sectionByKey: Map<string, string> }> {
  if (!isOnboardingPack(workbook.sheetNames)) {
    throw new ApiException(400, 'BAD_REQUEST', 'This file is not a full school pack')
  }

  ctx.require('academics.manage')
  ctx.require('staff.create')

  const stats: PackCommitStats = {
    sessions: 0,
    classes: 0,
    sections: 0,
    staff: 0,
    subjects: 0,
    classSubjects: 0,
    parents: 0,
    parentLinks: 0,
  }

  const sessionBefore = await ctx.db.academicSession.findFirst({ where: { isCurrent: true } })
  const session = await resolveSession(ctx, workbook)
  if (!session) {
    throw new ApiException(
      409,
      'NO_ACTIVE_SESSION',
      'No academic session. Add one on the Session sheet or in Settings.',
    )
  }
  if (!sessionBefore || sessionBefore.id !== session.id) stats.sessions++

  const staffByCode = new Map<string, string>()
  const classByName = new Map<string, string>()
  const sectionByKey = new Map<string, string>()
  const subjectByCode = new Map<string, string>()

  // Staff first — sections and class subjects reference employee codes.
  const staffSheet = findSheet(workbook, 'Staff')
  if (staffSheet) {
    for (const row of staffSheet.rows) {
      const code = cell(row, 'Employee code')
      if (!code) continue

      const { firstName, lastName } = readStaffName(row)
      if (!firstName) continue

      const existing = await ctx.db.staff.findFirst({
        where: { employeeCode: code },
        select: { id: true, deletedAt: true },
      })

      const data: Prisma.StaffUncheckedCreateInput = {
        tenantId: ctx.tenant.id,
        employeeCode: code,
        firstName,
        lastName,
        staffType: (cell(row, 'Staff type').toUpperCase() || 'TEACHING') as Prisma.StaffCreateInput['staffType'],
        designation: cell(row, 'Designation') || null,
        department: cell(row, 'Department') || null,
        qualification: cell(row, 'Qualification') || null,
        experienceYears: cell(row, 'Experience years') ? Number(cell(row, 'Experience years')) : null,
        gender: parseGender(cell(row, 'Gender')),
        dateOfBirth: parseIsoDate(cell(row, 'Date of birth'))
          ? attendanceDate(parseIsoDate(cell(row, 'Date of birth'))!)
          : null,
        phone: cell(row, 'Phone') || null,
        email: cell(row, 'Email') || null,
        joinedOn: parseIsoDate(cell(row, 'Joined on'))
          ? attendanceDate(parseIsoDate(cell(row, 'Joined on'))!)
          : null,
        city: cell(row, 'City') || null,
        state: cell(row, 'State') || null,
      }

      if (existing && !existing.deletedAt) {
        await ctx.db.staff.update({ where: { id: existing.id }, data })
        staffByCode.set(code.toLowerCase(), existing.id)
      } else if (existing?.deletedAt) {
        const restored = await ctx.db.staff.update({
          where: { id: existing.id },
          data: { ...data, deletedAt: null },
        })
        staffByCode.set(code.toLowerCase(), restored.id)
        stats.staff++
      } else {
        const created = await ctx.db.staff.create({ data })
        staffByCode.set(code.toLowerCase(), created.id)
        stats.staff++
      }
    }
  }

  const classesSheet = findSheet(workbook, 'Classes')
  if (classesSheet) {
    for (const row of classesSheet.rows) {
      const name = cell(row, 'Class')
      if (!name) continue
      const numeric = Number(cell(row, 'Numeric') || '0')
      const stream = cell(row, 'Stream') || null

      const existing = await ctx.db.classLevel.findFirst({
        where: { sessionId: session.id, name },
      })

      if (existing && !existing.deletedAt) {
        await ctx.db.classLevel.update({
          where: { id: existing.id },
          data: { numeric, stream },
        })
        classByName.set(name.toLowerCase(), existing.id)
      } else {
        const created = await findOrRestore({
          model: ctx.db.classLevel,
          where: { tenantId: ctx.tenant.id, sessionId: session.id, name },
          createData: {
            tenantId: ctx.tenant.id,
            sessionId: session.id,
            name,
            numeric,
            stream,
          },
          restoreData: { numeric, stream },
          conflictMsg: `${name} already exists`,
        })
        classByName.set(name.toLowerCase(), created.id)
        stats.classes++
      }
    }
  }

  const sectionsSheet = findSheet(workbook, 'Sections')
  if (sectionsSheet) {
    for (const row of sectionsSheet.rows) {
      const className = cell(row, 'Class')
      const sectionName = cell(row, 'Section')
      if (!className || !sectionName) continue

      const classLevelId = classByName.get(className.toLowerCase())
      if (!classLevelId) continue

      const teacherCode = cell(row, 'Class teacher employee code')
      const classTeacherId = teacherCode ? staffByCode.get(teacherCode.toLowerCase()) : undefined
      const capacity = Number(cell(row, 'Capacity') || '40')
      const roomName = cell(row, 'Room') || null

      const existing = await ctx.db.section.findFirst({
        where: { classLevelId, name: sectionName },
      })

      if (existing && !existing.deletedAt) {
        await ctx.db.section.update({
          where: { id: existing.id },
          data: { capacity, roomName, classTeacherId: classTeacherId ?? null },
        })
        sectionByKey.set(`${className.toLowerCase()}::${sectionName.toLowerCase()}`, existing.id)
      } else {
        const created = await findOrRestore({
          model: ctx.db.section,
          where: { tenantId: ctx.tenant.id, classLevelId, name: sectionName },
          createData: {
            tenantId: ctx.tenant.id,
            classLevelId,
            name: sectionName,
            capacity,
            roomName,
            classTeacherId: classTeacherId ?? null,
          },
          restoreData: { capacity, roomName, classTeacherId: classTeacherId ?? null },
          conflictMsg: `Section ${sectionName} already exists`,
        })
        sectionByKey.set(`${className.toLowerCase()}::${sectionName.toLowerCase()}`, created.id)
        stats.sections++
      }
    }
  }

  const subjectsSheet = findSheet(workbook, 'Subjects')
  if (subjectsSheet) {
    for (const row of subjectsSheet.rows) {
      const code = cell(row, 'Subject code').toUpperCase()
      const name = cell(row, 'Subject name')
      if (!code || !name) continue

      const existing = await ctx.db.subject.findFirst({ where: { code } })
      if (existing && !existing.deletedAt) {
        await ctx.db.subject.update({
          where: { id: existing.id },
          data: { name, isElective: parseYesNo(cell(row, 'Is elective')) },
        })
        subjectByCode.set(code, existing.id)
      } else if (existing?.deletedAt) {
        const restored = await ctx.db.subject.update({
          where: { id: existing.id },
          data: { name, isElective: parseYesNo(cell(row, 'Is elective')), deletedAt: null },
        })
        subjectByCode.set(code, restored.id)
        stats.subjects++
      } else {
        const created = await ctx.db.subject.create({
          data: {
            tenantId: ctx.tenant.id,
            code,
            name,
            isElective: parseYesNo(cell(row, 'Is elective')),
          },
        })
        subjectByCode.set(code, created.id)
        stats.subjects++
      }
    }
  }

  const classSubjectsSheet = findSheet(workbook, 'Class subjects')
  if (classSubjectsSheet) {
    for (const row of classSubjectsSheet.rows) {
      const className = cell(row, 'Class')
      const code = cell(row, 'Subject code').toUpperCase()
      const teacherCode = cell(row, 'Teacher employee code')
      if (!className || !code) continue

      const classLevelId = classByName.get(className.toLowerCase())
      const subjectId = subjectByCode.get(code)
      if (!classLevelId || !subjectId) continue

      const teacherId = teacherCode ? staffByCode.get(teacherCode.toLowerCase()) : undefined

      const existing = await ctx.db.classSubject.findFirst({
        where: { classLevelId, subjectId },
      })

      if (existing) {
        if (teacherId) {
          await ctx.db.classSubject.update({
            where: { id: existing.id },
            data: { teacherId },
          })
        }
      } else {
        await assignSubjectToClass(ctx, { classLevelId, subjectId, teacherId })
        stats.classSubjects++
      }
    }
  }

  return { stats, staffByCode, classByName, sectionByKey }
}

/** Link guardians from the Parents sheet to students already imported. */
export async function commitPackParents(
  ctx: AppContext,
  workbook: PackWorkbook,
  admissionToStudentId: Map<string, string>,
): Promise<{ parents: number; parentLinks: number }> {
  const parentsSheet = findSheet(workbook, 'Parents')
  if (!parentsSheet || parentsSheet.rows.length === 0) {
    return { parents: 0, parentLinks: 0 }
  }

  ctx.require('parents.create')

  let parents = 0
  let parentLinks = 0

  for (const row of parentsSheet.rows) {
    const admission =
      cell(row, 'Student admission no') || cell(row, 'Student admission number')
    const studentId = admissionToStudentId.get(admission.toLowerCase())
    if (!studentId) continue

    const { firstName, lastName } = readParentName(row)
    if (!firstName) continue

    const phone = cell(row, 'Phone') || null
    const email = cell(row, 'Email') || null
    const relation = 'GUARDIAN' as const
    const isPrimary = parseYesNo(cell(row, 'Is primary'))
    const canPickup = cell(row, 'Can pickup') ? parseYesNo(cell(row, 'Can pickup')) : true
    const isEmergency = parseYesNo(cell(row, 'Is emergency contact'))

    // Reuse an existing parent when phone or email matches.
    let parentId: string | undefined
    if (phone) {
      const hit = await ctx.db.parent.findFirst({
        where: { phone, deletedAt: null },
        select: { id: true },
      })
      parentId = hit?.id
    }
    if (!parentId && email) {
      const hit = await ctx.db.parent.findFirst({
        where: { email, deletedAt: null },
        select: { id: true },
      })
      parentId = hit?.id
    }

    if (!parentId) {
      const created = await ctx.db.parent.create({
        data: {
          tenantId: ctx.tenant.id,
          firstName,
          lastName,
          phone,
          email,
          occupation: cell(row, 'Occupation') || null,
          addressLine1: cell(row, 'Address line 1') || null,
          city: cell(row, 'City') || null,
          state: cell(row, 'State') || null,
          postalCode: cell(row, 'Postal code') || null,
        },
      })
      parentId = created.id
      parents++
    } else {
      await ctx.db.parent.update({
        where: { id: parentId },
        data: {
          firstName,
          lastName,
          occupation: cell(row, 'Occupation') || null,
          addressLine1: cell(row, 'Address line 1') || null,
          city: cell(row, 'City') || null,
          state: cell(row, 'State') || null,
          postalCode: cell(row, 'Postal code') || null,
        },
      })
    }

    const existingLink = await ctx.db.studentGuardian.findFirst({
      where: { parentId, studentId },
    })

    if (isPrimary) {
      await ctx.db.studentGuardian.updateMany({
        where: { studentId, isPrimary: true },
        data: { isPrimary: false },
      })
    }

    if (existingLink) {
      await ctx.db.studentGuardian.update({
        where: { id: existingLink.id },
        data: { relation, isPrimary, canPickup, isEmergencyContact: isEmergency },
      })
    } else {
      await ctx.db.studentGuardian.create({
        data: {
          tenantId: ctx.tenant.id,
          parentId,
          studentId,
          relation,
          isPrimary,
          canPickup,
          isEmergencyContact: isEmergency,
        },
      })
      parentLinks++
    }
  }

  return { parents, parentLinks }
}

import * as XLSX from 'xlsx'
import type { Prisma } from '@prisma/client'
import { splitPersonName } from '@/lib/person-name'
import { gridToTable } from '@/lib/spreadsheet'
import { attendanceDate } from '@/lib/dates'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException } from '@/server/api/response'
import { findOrRestore } from '@/server/db/soft-delete'
import { assignSubjectToClass } from '@/server/modules/academics/service'
import { createSession } from '@/server/modules/settings/sessions'
import { issueParentPortalLogin, issueStaffPortalLogin } from '@/server/modules/people/service'
import { phoneLookupCandidates, storePhone } from '@/server/auth/phone'
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
  feeHeads: number
  feeStructures: number
  feeItems: number
  parents: number
  parentLinks: number
  studentsArchived?: number
  staffArchived?: number
}

function formatCell(value: string | number | boolean | Date | null | undefined): string {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return value.toISOString().slice(0, 10)
  }
  return String(value).trim()
}

function detectHeaderRow(grid: string[][]): number {
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const row = grid[i] ?? []
    const text = row.join(' ').toLowerCase()
    if (
      (text.includes('employee') && text.includes('code')) ||
      text.includes('admission') ||
      (text.includes('class') && text.includes('section')) ||
      (text.includes('subject') && text.includes('code'))
    ) {
      return i
    }
  }
  return 0
}

function sheetTable(name: string, grid: string[][]): PackSheetTable | null {
  if (grid.length === 0) return null
  const table = gridToTable(grid, detectHeaderRow(grid))
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

function normalizeHeaderKey(key: string): string {
  return key.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Case-insensitive column lookup — Excel often capitalises headers differently from the template. */
function cell(row: Record<string, string>, header: string, ...aliases: string[]): string {
  const wanted = [header, ...aliases].map(normalizeHeaderKey)
  const wantedSet = new Set(wanted)
  for (const [key, value] of Object.entries(row)) {
    if (wantedSet.has(normalizeHeaderKey(key))) return value.trim()
  }
  // Fuzzy only for multi-word labels when the sheet header *contains* the full
  // requested label (e.g. "staff type (optional)" → "staff type").
  // Never fuzzy single tokens — "name" must not match "session name", and
  // "type" must not match a campus "Type" column that stole Staff type (NAINI).
  for (const want of wanted) {
    if (!want.includes(' ')) continue
    for (const [key, value] of Object.entries(row)) {
      const nk = normalizeHeaderKey(key)
      if (nk !== want && nk.includes(want)) return value.trim()
    }
  }
  return ''
}

function normalizeStructureKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeEmpCode(code: string): string {
  return code.trim().toLowerCase()
}

function readEmployeeCode(row: Record<string, string>): string {
  return cell(row, 'Employee code', 'Emp code', 'Employee ID', 'Staff code', 'Emp. code')
}

function readClassTeacherCode(row: Record<string, string>): string {
  return cell(
    row,
    'Class teacher employee code',
    'Class teacher code',
    'Teacher employee code',
    'Teacher code',
  )
}

function readSubjectTeacherCode(row: Record<string, string>): string {
  return cell(row, 'Teacher employee code', 'Teacher code', 'Subject teacher code')
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

const FEE_FREQUENCIES = new Set([
  'ONE_TIME',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'ANNUAL',
  'TERM_WISE',
  'CUSTOM',
])

function parseFeeFrequency(value: string): Prisma.FeeHeadUncheckedCreateInput['frequency'] | undefined {
  const frequency = value.trim().toUpperCase()
  return FEE_FREQUENCIES.has(frequency)
    ? (frequency as Prisma.FeeHeadUncheckedCreateInput['frequency'])
    : undefined
}

function parseRupeesMinor(value: string): number | undefined {
  const amount = Number(value.replace(/[₹,\s]/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) return undefined
  return Math.round(amount * 100)
}

function parseGender(value: string): 'MALE' | 'FEMALE' | 'OTHER' | undefined {
  if (!value) return undefined
  const v = value.trim().toLowerCase()
  if (['m', 'male', 'boy', 'b'].includes(v)) return 'MALE'
  if (['f', 'female', 'girl', 'g'].includes(v)) return 'FEMALE'
  if (['o', 'other', 'others'].includes(v)) return 'OTHER'
  return undefined
}

type PackStaffType = 'TEACHING' | 'ADMIN' | 'SUPPORT' | 'DRIVER' | 'LIBRARIAN' | 'ACCOUNTANT' | 'OTHER'

const STAFF_TYPES = new Set<string>([
  'TEACHING',
  'ADMIN',
  'SUPPORT',
  'DRIVER',
  'LIBRARIAN',
  'ACCOUNTANT',
  'OTHER',
])

/** Maps common labels; unknown values (e.g. campus names) fall back to TEACHING. */
function parseStaffType(value: string): PackStaffType {
  const raw = value.trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (!raw) return 'TEACHING'
  if (STAFF_TYPES.has(raw)) return raw as PackStaffType
  if (['TEACHER', 'FACULTY', 'TGT', 'PGT', 'PRT', 'NTT'].includes(raw)) return 'TEACHING'
  if (['ADMINISTRATION', 'OFFICE', 'PRINCIPAL', 'COORDINATOR'].includes(raw)) return 'ADMIN'
  if (['HELPER', 'AYAH', 'PEON', 'SECURITY', 'NON_TEACHING'].includes(raw)) return 'SUPPORT'
  if (['ACCOUNTS', 'ACCOUNT', 'FINANCE', 'CASHIER'].includes(raw)) return 'ACCOUNTANT'
  if (['LIBRARY'].includes(raw)) return 'LIBRARIAN'
  return 'TEACHING'
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
      ([k]) => k.toLowerCase().trim() === name.toLowerCase().trim(),
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
      const teacherCode = readClassTeacherCode(row)
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

  const staffSheet = findSheet(workbook, 'Staff', 'Teachers', 'Employees')
  const staffCodesOnSheet = new Set<string>()
  if (staffSheet) {
    for (const row of staffSheet.rows) {
      const code = readEmployeeCode(row)
      if (code) staffCodesOnSheet.add(normalizeEmpCode(code))
    }
  }

  if (staffSheet) {
    for (let i = 0; i < staffSheet.rows.length; i++) {
      const row = staffSheet.rows[i]!
      const code = readEmployeeCode(row)
      const { firstName } = readStaffName(row)
      if (!code) {
        errors.push({ sheet: 'Staff', row: i + 2, message: 'Employee code is missing' })
        continue
      }
      if (staffCodes.has(normalizeEmpCode(code))) {
        errors.push({ sheet: 'Staff', row: i + 2, message: `Employee code ${code} is duplicated` })
        continue
      }
      if (!firstName) {
        errors.push({ sheet: 'Staff', row: i + 2, message: 'Name is required' })
        continue
      }
      staffCodes.add(normalizeEmpCode(code))
    }
    // Cross-check section class teachers against codes listed on the Staff sheet.
    if (sectionsSheet) {
      for (let i = 0; i < sectionsSheet.rows.length; i++) {
        const code = readClassTeacherCode(sectionsSheet.rows[i]!)
        if (code && !staffCodesOnSheet.has(normalizeEmpCode(code))) {
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
      const teacherCode = readSubjectTeacherCode(row)
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
      if (teacherCode && staffSheet && !staffCodesOnSheet.has(normalizeEmpCode(teacherCode))) {
        errors.push({
          sheet: 'Class subjects',
          row: i + 2,
          message: `Unknown employee code ${teacherCode}`,
        })
      }
    }
  }

  const feeHeadCodes = new Set<string>()
  const feeHeadsSheet = findSheet(workbook, 'Fee heads')
  if (feeHeadsSheet) {
    for (let i = 0; i < feeHeadsSheet.rows.length; i++) {
      const row = feeHeadsSheet.rows[i]!
      const code = cell(row, 'Code', 'Fee head code').toUpperCase()
      const name = cell(row, 'Name', 'Fee head name')
      const frequency = parseFeeFrequency(cell(row, 'Frequency'))
      if (!code || !name) {
        errors.push({ sheet: 'Fee heads', row: i + 2, message: 'Code and Name are required' })
        continue
      }
      if (!frequency) {
        errors.push({ sheet: 'Fee heads', row: i + 2, message: 'Frequency is invalid' })
      }
      if (feeHeadCodes.has(code)) {
        errors.push({ sheet: 'Fee heads', row: i + 2, message: `Fee head code ${code} is duplicated` })
      }
      feeHeadCodes.add(code)
    }
  }

  const feeStructureNames = new Set<string>()
  const feeStructuresSheet = findSheet(workbook, 'Fee structures', 'Fee structure')
  if (feeStructuresSheet) {
    for (let i = 0; i < feeStructuresSheet.rows.length; i++) {
      const row = feeStructuresSheet.rows[i]!
      const name = cell(row, 'Structure name', 'Fee structure name', 'Plan name', 'Name')
      const className = cell(row, 'Class')
      if (!name) {
        errors.push({ sheet: 'Fee structures', row: i + 2, message: 'Structure name is required' })
        continue
      }
      const key = normalizeStructureKey(name)
      if (feeStructureNames.has(key)) {
        errors.push({ sheet: 'Fee structures', row: i + 2, message: `Structure ${name} is duplicated` })
      }
      feeStructureNames.add(key)
      if (className && !classMap.has(className.toLowerCase())) {
        errors.push({ sheet: 'Fee structures', row: i + 2, message: `Unknown class ${className}` })
      }
    }
  }

  const feeItemsSheet = findSheet(workbook, 'Fee items')
  if (feeItemsSheet) {
    const itemKeys = new Set<string>()
    for (let i = 0; i < feeItemsSheet.rows.length; i++) {
      const row = feeItemsSheet.rows[i]!
      const structureName = cell(row, 'Structure name', 'Fee structure name', 'Plan name', 'Name')
      const headCode = cell(row, 'Fee head code', 'Code').toUpperCase()
      const amountMinor = parseRupeesMinor(cell(row, 'Amount INR', 'Amount'))
      const dueOn = cell(row, 'Due on')
      if (!structureName || !headCode) {
        errors.push({
          sheet: 'Fee items',
          row: i + 2,
          message: 'Structure name and Fee head code are required',
        })
        continue
      }
      // Only flag when Fee structures lists plans but omits this one. An empty /
      // missing Fee structures sheet is fine — commit will create the plan.
      if (feeStructureNames.size > 0 && !feeStructureNames.has(normalizeStructureKey(structureName))) {
        errors.push({
          sheet: 'Fee items',
          row: i + 2,
          message: `Unknown structure ${structureName} — add it on the Fee structures sheet`,
        })
      }
      if (feeHeadsSheet && !feeHeadCodes.has(headCode)) {
        errors.push({ sheet: 'Fee items', row: i + 2, message: `Unknown fee head code ${headCode}` })
      }
      if (!amountMinor) {
        errors.push({ sheet: 'Fee items', row: i + 2, message: 'Amount INR must be greater than zero' })
      }
      if (dueOn && !parseIsoDate(dueOn)) {
        errors.push({ sheet: 'Fee items', row: i + 2, message: 'Due on must be a valid date' })
      }
      const itemKey = `${structureName.toLowerCase()}::${headCode}`
      if (itemKeys.has(itemKey)) {
        errors.push({
          sheet: 'Fee items',
          row: i + 2,
          message: `${headCode} is duplicated in ${structureName}`,
        })
      }
      itemKeys.add(itemKey)
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
    feeHeads: 0,
    feeStructures: 0,
    feeItems: 0,
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
  const staffSheet = findSheet(workbook, 'Staff', 'Teachers', 'Employees')
  if (staffSheet) {
    for (const row of staffSheet.rows) {
      const code = readEmployeeCode(row)
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
        staffType: parseStaffType(cell(row, 'Staff type', 'Staff category', 'Employee type')),
        designation: cell(row, 'Designation') || null,
        department: cell(row, 'Department') || null,
        qualification: cell(row, 'Qualification') || null,
        experienceYears: cell(row, 'Experience years') ? Number(cell(row, 'Experience years')) : null,
        gender: parseGender(cell(row, 'Gender')),
        dateOfBirth: parseIsoDate(cell(row, 'Date of birth'))
          ? attendanceDate(parseIsoDate(cell(row, 'Date of birth'))!)
          : null,
        phone: storePhone(cell(row, 'Phone')),
        email: cell(row, 'Email') || null,
        joinedOn: parseIsoDate(cell(row, 'Joined on'))
          ? attendanceDate(parseIsoDate(cell(row, 'Joined on'))!)
          : null,
        city: cell(row, 'City') || null,
        state: cell(row, 'State') || null,
      }

      let staffId: string
      if (existing && !existing.deletedAt) {
        await ctx.db.staff.update({ where: { id: existing.id }, data })
        staffId = existing.id
        staffByCode.set(normalizeEmpCode(code), existing.id)
      } else if (existing?.deletedAt) {
        const restored = await ctx.db.staff.update({
          where: { id: existing.id },
          data: { ...data, deletedAt: null },
        })
        staffId = restored.id
        staffByCode.set(normalizeEmpCode(code), restored.id)
        stats.staff++
      } else {
        const created = await ctx.db.staff.create({ data })
        staffId = created.id
        staffByCode.set(normalizeEmpCode(code), created.id)
        stats.staff++
      }

      // Portal login: phone + employee code as first password.
      if (data.phone) {
        const current = await ctx.db.staff.findFirst({
          where: { id: staffId },
          select: { userId: true },
        })
        if (!current?.userId) {
          try {
            await issueStaffPortalLogin(ctx, staffId)
          } catch (err) {
            console.error('[pack] staff portal login skipped', code, err)
          }
        }
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

      const teacherCode = readClassTeacherCode(row)
      const classTeacherId = teacherCode ? staffByCode.get(normalizeEmpCode(teacherCode)) : undefined
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
      const teacherCode = readSubjectTeacherCode(row)
      if (!className || !code) continue

      const classLevelId = classByName.get(className.toLowerCase())
      const subjectId = subjectByCode.get(code)
      if (!classLevelId || !subjectId) continue

      const teacherId = teacherCode ? staffByCode.get(normalizeEmpCode(teacherCode)) : undefined

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

  const feeHeadsSheet = findSheet(workbook, 'Fee heads')
  const feeStructuresSheet = findSheet(workbook, 'Fee structures', 'Fee structure')
  const feeItemsSheet = findSheet(workbook, 'Fee items')
  const hasFeeRows = [feeHeadsSheet, feeStructuresSheet, feeItemsSheet].some(
    (sheet) => sheet && sheet.rows.length > 0,
  )

  if (hasFeeRows) {
    ctx.require('fees.structure')
  }

  const feeHeadByCode = new Map<string, string>()
  if (feeHeadsSheet) {
    for (let i = 0; i < feeHeadsSheet.rows.length; i++) {
      const row = feeHeadsSheet.rows[i]!
      const code = cell(row, 'Code', 'Fee head code').toUpperCase()
      const name = cell(row, 'Name', 'Fee head name')
      const frequency = parseFeeFrequency(cell(row, 'Frequency'))
      if (!code || !name || !frequency) {
        throw new ApiException(
          400,
          'BAD_REQUEST',
          `Fee heads row ${i + 2}: Code, Name and a valid Frequency are required`,
        )
      }

      const existing = await ctx.db.feeHead.findFirst({ where: { code } })
      const data = {
        name,
        frequency,
        isRefundable: parseYesNo(cell(row, 'Is refundable')),
        isDeposit: parseYesNo(cell(row, 'Is deposit')),
        deletedAt: null,
      }
      const saved = existing
        ? await ctx.db.feeHead.update({ where: { id: existing.id }, data })
        : await ctx.db.feeHead.create({
            data: { tenantId: ctx.tenant.id, code, ...data },
          })
      feeHeadByCode.set(code, saved.id)
      stats.feeHeads++
    }
  }

  const structureByName = new Map<
    string,
    { id: string; sessionId: string; invoiceCount: number }
  >()

  // Seed from DB so Fee items still resolve when the Fee structures sheet was left blank.
  const existingStructures = await ctx.db.feeStructure.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { invoices: true } } },
  })
  for (const existing of existingStructures) {
    const key = normalizeStructureKey(existing.name)
    if (structureByName.has(key)) continue
    structureByName.set(key, {
      id: existing.id,
      sessionId: existing.sessionId,
      invoiceCount: existing._count.invoices,
    })
  }

  function inferClassLevelId(structureName: string): string | null {
    const key = normalizeStructureKey(structureName)
    let best: { id: string; len: number } | null = null
    for (const [className, classId] of classByName) {
      if (key === className || key.startsWith(`${className} `)) {
        if (!best || className.length > best.len) best = { id: classId, len: className.length }
      }
    }
    return best?.id ?? null
  }

  if (feeStructuresSheet) {
    for (let i = 0; i < feeStructuresSheet.rows.length; i++) {
      const row = feeStructuresSheet.rows[i]!
      const name = cell(row, 'Structure name', 'Fee structure name', 'Plan name', 'Name')
      if (!name) {
        throw new ApiException(400, 'BAD_REQUEST', `Fee structures row ${i + 2}: Name is required`)
      }

      const sessionName = cell(row, 'Session name')
      const rowSession = sessionName
        ? await ctx.db.academicSession.findFirst({ where: { name: sessionName } })
        : session
      if (!rowSession) {
        throw new ApiException(
          400,
          'BAD_REQUEST',
          `Fee structures row ${i + 2}: Unknown session ${sessionName}`,
        )
      }

      const className = cell(row, 'Class')
      const classLevel = className
        ? await ctx.db.classLevel.findFirst({
            where: { sessionId: rowSession.id, name: className, deletedAt: null },
            select: { id: true },
          })
        : null
      if (className && !classLevel) {
        throw new ApiException(
          400,
          'BAD_REQUEST',
          `Fee structures row ${i + 2}: Unknown class ${className}`,
        )
      }

      const description = cell(row, 'Description') || null
      const existing = await ctx.db.feeStructure.findFirst({
        where: { sessionId: rowSession.id, name },
        include: { _count: { select: { invoices: true } } },
      })

      let saved
      if (existing) {
        const changed =
          existing.classLevelId !== (classLevel?.id ?? null) ||
          (existing.description ?? null) !== description ||
          existing.deletedAt !== null
        if (changed && existing._count.invoices > 0) {
          throw new ApiException(
            409,
            'CONFLICT',
            `Fee structure ${name} already has invoices and cannot be changed by bulk import`,
          )
        }
        saved = changed
          ? await ctx.db.feeStructure.update({
              where: { id: existing.id },
              data: { classLevelId: classLevel?.id ?? null, description, deletedAt: null },
            })
          : existing
      } else {
        saved = await ctx.db.feeStructure.create({
          data: {
            tenantId: ctx.tenant.id,
            sessionId: rowSession.id,
            classLevelId: classLevel?.id ?? null,
            name,
            description,
          },
        })
      }

      structureByName.set(normalizeStructureKey(name), {
        id: saved.id,
        sessionId: rowSession.id,
        invoiceCount: existing?._count.invoices ?? 0,
      })
      stats.feeStructures++
    }
  }

  if (feeItemsSheet) {
    for (let i = 0; i < feeItemsSheet.rows.length; i++) {
      const row = feeItemsSheet.rows[i]!
      const structureName = cell(row, 'Structure name', 'Fee structure name', 'Plan name', 'Name')
      const headCode = cell(row, 'Fee head code', 'Code').toUpperCase()
      const amountMinor = parseRupeesMinor(cell(row, 'Amount INR', 'Amount'))
      const dueOnInput = cell(row, 'Due on')
      const dueOnIso = dueOnInput ? parseIsoDate(dueOnInput) : undefined
      if (!structureName || !headCode || !amountMinor || (dueOnInput && !dueOnIso)) {
        throw new ApiException(
          400,
          'BAD_REQUEST',
          `Fee items row ${i + 2}: Structure, fee head, positive amount and valid due date are required`,
        )
      }

      const structureKey = normalizeStructureKey(structureName)
      let structure = structureByName.get(structureKey)
      if (!structure) {
        const matches = await ctx.db.feeStructure.findMany({
          where: {
            deletedAt: null,
            name: { equals: structureName, mode: 'insensitive' },
          },
          include: { _count: { select: { invoices: true } } },
          take: 10,
        })
        const preferred =
          matches.find((row) => row.sessionId === session.id) ?? matches[0] ?? null

        if (preferred) {
          structure = {
            id: preferred.id,
            sessionId: preferred.sessionId,
            invoiceCount: preferred._count.invoices,
          }
          structureByName.set(structureKey, structure)
        } else {
          // Fee structures sheet left blank — create the plan so amounts still import.
          const classLevelId = inferClassLevelId(structureName)
          const created = await ctx.db.feeStructure.create({
            data: {
              tenantId: ctx.tenant.id,
              sessionId: session.id,
              classLevelId,
              name: structureName,
              description: 'Created from Fee items import',
            },
          })
          structure = { id: created.id, sessionId: session.id, invoiceCount: 0 }
          structureByName.set(structureKey, structure)
          stats.feeStructures++
        }
      }

      let feeHeadId = feeHeadByCode.get(headCode)
      if (!feeHeadId) {
        const existing = await ctx.db.feeHead.findFirst({
          where: { code: headCode, deletedAt: null },
          select: { id: true },
        })
        feeHeadId = existing?.id
        if (feeHeadId) feeHeadByCode.set(headCode, feeHeadId)
      }
      if (!feeHeadId) {
        throw new ApiException(
          400,
          'BAD_REQUEST',
          `Fee items row ${i + 2}: Unknown fee head ${headCode}`,
        )
      }

      const dueOn = dueOnIso ? attendanceDate(dueOnIso) : null
      const existingItem = await ctx.db.feeStructureItem.findFirst({
        where: { structureId: structure.id, feeHeadId },
      })
      const changed =
        !existingItem ||
        existingItem.amountMinor !== amountMinor ||
        (existingItem.dueOn?.getTime() ?? null) !== (dueOn?.getTime() ?? null)
      if (changed && structure.invoiceCount > 0) {
        throw new ApiException(
          409,
          'CONFLICT',
          `Fee structure ${structureName} already has invoices and its amounts cannot be changed`,
        )
      }

      if (existingItem) {
        if (changed) {
          await ctx.db.feeStructureItem.update({
            where: { id: existingItem.id },
            data: { amountMinor, dueOn },
          })
        }
      } else {
        await ctx.db.feeStructureItem.create({
          data: {
            tenantId: ctx.tenant.id,
            structureId: structure.id,
            feeHeadId,
            amountMinor,
            dueOn,
          },
        })
      }
      stats.feeItems++
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

    const phone = storePhone(cell(row, 'Phone'))
    const email = cell(row, 'Email') || null
    const relation = 'GUARDIAN' as const
    const isPrimary = parseYesNo(cell(row, 'Is primary'))
    const canPickup = cell(row, 'Can pickup') ? parseYesNo(cell(row, 'Can pickup')) : true
    const isEmergency = parseYesNo(cell(row, 'Is emergency contact'))

    // Reuse an existing parent when phone or email matches.
    let parentId: string | undefined
    if (phone) {
      const hit = await ctx.db.parent.findFirst({
        where: { phone: { in: phoneLookupCandidates(phone) }, deletedAt: null },
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
          phone: phone ?? undefined,
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

    // Portal login: phone + childFirstName + DOB once a child is linked.
    if (phone) {
      const current = await ctx.db.parent.findFirst({
        where: { id: parentId },
        select: { userId: true },
      })
      if (!current?.userId) {
        try {
          await issueParentPortalLogin(ctx, parentId)
        } catch (err) {
          console.error('[pack] parent portal login skipped', phone, err)
        }
      }
    }
  }

  return { parents, parentLinks }
}

/**
 * Soft-archives active students and staff whose admission / employee codes are
 * not in this pack. Used for an explicit “override” re-import so leftover
 * people from earlier packs do not stay on the rolls.
 */
export async function pruneMissingFromPack(
  ctx: AppContext,
  workbook: PackWorkbook,
): Promise<{ studentsArchived: number; staffArchived: number }> {
  ctx.require('students.delete')
  ctx.require('staff.delete')

  const studentsSheet = findSheet(workbook, 'Students')
  const staffSheet = findSheet(workbook, 'Staff', 'Teachers', 'Employees')

  const keepAdmissions = new Set<string>()
  if (studentsSheet) {
    for (const row of studentsSheet.rows) {
      const admission =
        cell(row, 'Admission number') || cell(row, 'Admission No') || cell(row, 'Admission no')
      if (admission) keepAdmissions.add(admission.toLowerCase())
    }
  }

  const keepStaffCodes = new Set<string>()
  if (staffSheet) {
    for (const row of staffSheet.rows) {
      const code = readEmployeeCode(row)
      if (code) keepStaffCodes.add(normalizeEmpCode(code))
    }
  }

  let studentsArchived = 0
  let staffArchived = 0
  const reason = 'Not present in school pack override import'

  const activeStudents = await ctx.db.student.findMany({
    where: { deletedAt: null },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, userId: true },
  })
  const toArchiveStudents = activeStudents.filter(
    (student) => !keepAdmissions.has(student.admissionNo.toLowerCase()),
  )

  for (const student of toArchiveStudents) {
    await ctx.db.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { studentId: student.id, isCurrent: true },
        data: { isCurrent: false, leftOn: new Date() },
      })
      if (student.userId) {
        await tx.user.update({
          where: { id: student.userId },
          data: { status: 'DISABLED' },
        })
        await tx.session.updateMany({
          where: { userId: student.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      }
      await tx.student.update({
        where: { id: student.id },
        data: { deletedAt: new Date(), status: 'WITHDRAWN' },
      })
    })
    studentsArchived++
  }

  const activeStaff = await ctx.db.staff.findMany({
    where: { deletedAt: null },
    select: { id: true, employeeCode: true, userId: true },
  })
  const toArchiveStaff = activeStaff.filter(
    (member) => !keepStaffCodes.has(normalizeEmpCode(member.employeeCode)),
  )

  for (const member of toArchiveStaff) {
    await ctx.db.$transaction(async (tx) => {
      await tx.section.updateMany({
        where: { classTeacherId: member.id },
        data: { classTeacherId: null },
      })
      await tx.classSubject.updateMany({
        where: { teacherId: member.id },
        data: { teacherId: null },
      })
      if (member.userId) {
        await tx.user.update({
          where: { id: member.userId },
          data: { status: 'DISABLED' },
        })
        await tx.session.updateMany({
          where: { userId: member.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      }
      await tx.staff.update({
        where: { id: member.id },
        data: { deletedAt: new Date(), leftOn: new Date() },
      })
    })
    staffArchived++
  }

  if (studentsArchived > 0 || staffArchived > 0) {
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'students.import.prune_missing',
      module: 'students',
      entityType: 'ImportBatch',
      entityId: ctx.tenant.id,
      summary: `Pack override archived ${studentsArchived} student(s) and ${staffArchived} staff not in the uploaded file`,
      after: { studentsArchived, staffArchived, reason },
    })
  }

  return { studentsArchived, staffArchived }
}

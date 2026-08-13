import { toCsv } from '@/lib/csv'
import { gridToTable, parseSpreadsheet } from '@/lib/spreadsheet'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { assertWithinLimit, FEATURE, hasFeature } from '@/server/entitlements'
import { assistantConfigured } from '@/server/assistant/providers'
import { storageProvider } from '@/server/providers'
import { uploadFile } from '@/server/files'
import { createStudent } from '@/server/modules/students/service'
import { studentCreateSchema, type StudentCreateInput } from '@/server/modules/students/schema'
import {
  analyzeImportWithAi,
  applyClarificationAnswers,
  normalizeAiMapping,
  unresolvedQuestions,
  type ImportClassAlias,
} from './ai-map'
import { buildOnboardingWorkbook } from './onboarding-pack'
import {
  IMPORT_FIELDS,
  REQUIRED_IMPORT_FIELDS,
  SAMPLE_CSV_HEADERS,
  SAMPLE_CSV_ROWS,
  autoMapHeaders,
  type ImportFieldKey,
} from './fields'
import {
  IMPORT_KIND_STUDENTS,
  IMPORT_STATUS,
  type ImportBatchMeta,
  type ImportClarifyInput,
  type ImportMapInput,
  type ImportMapping,
  type ImportRowError,
  type ImportStatus,
} from './schema'

const MAX_IMPORT_ROWS = 2_000
const MAPPING_SETTING_KEY = 'students.columnMap'
const PREVIEW_LIMIT = 40

type ClassLookup = {
  id: string
  name: string
  numeric: number
  sections: Array<{
    id: string
    name: string
    capacity: number
    enrolled: number
  }>
}

export type ImportBatchSummary = {
  id: string
  fileName: string
  status: ImportStatus
  totalRows: number
  validRows: number
  errorRows: number
  committedAt: string | null
  createdAt: string
  headers: string[]
  mapping: Record<ImportFieldKey, string | null>
  rowErrors: ImportRowError[]
  preview: ImportBatchMeta['preview']
  committedCount: number
  aiSummary?: string
  aiNotes?: string
  pendingQuestions?: ImportBatchMeta['pendingQuestions']
  splitFullNameColumn?: string | null
  fileKind?: 'csv' | 'xlsx'
  smartImportAvailable: boolean
}

type RowBuildContext = {
  splitFullNameColumn?: string | null
  classAliases?: ImportClassAlias[]
  headerRowIndex?: number
}

/**
 * Upload CSV or Excel, optionally analyse with AI, then validate (manual path) or
 * pause for admin verification (smart import path).
 */
export async function uploadStudentImport(
  ctx: AppContext,
  file: File,
  opts: { useAi?: boolean } = {},
): Promise<ImportBatchSummary> {
  ctx.require('students.import')

  const name = file.name.toLowerCase()
  const isCsv =
    name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'text/plain'
  const isExcel =
    name.endsWith('.xlsx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  if (!isCsv && !isExcel) {
    throw new ApiException(
      415,
      'UNSUPPORTED_FILE_TYPE',
      'Upload a CSV or Excel (.xlsx) file.',
    )
  }

  const uploadMime = isExcel
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv'

  const normalized =
    file.type === uploadMime
      ? file
      : new File([await file.arrayBuffer()], file.name, { type: uploadMime })

  const uploaded = await uploadFile(ctx, normalized, 'imports')
  const buffer = Buffer.from(await storageProvider().get(uploaded.storageKey))
  const { grid, fileKind } = parseSpreadsheet(buffer, uploaded.fileName, uploadMime)

  if (grid.length === 0) {
    throw new ApiException(400, 'BAD_REQUEST', 'The file is empty')
  }

  const useAi =
    opts.useAi === true &&
    assistantConfigured() &&
    (await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST))

  let headerRowIndex = 0
  let mapping = mergeMapping(autoMapHeaders(grid[0] ?? []), await loadMappingTemplate(ctx))
  let metaExtras: Partial<ImportBatchMeta> = {
    sourceGrid: grid,
    headerRowIndex: 0,
    fileKind,
  }

  if (useAi) {
    const classes = (await loadClasses(ctx)).map((c) => ({
      name: c.name,
      sections: c.sections.map((s) => s.name),
    }))
    const analysis = await analyzeImportWithAi(ctx, {
      grid,
      fileName: uploaded.fileName,
      classes,
    })
    headerRowIndex = analysis.headerRowIndex
    const table = gridToTable(grid, headerRowIndex)
    mapping = normalizeAiMapping(analysis.mapping, table.headers)
    metaExtras = {
      ...metaExtras,
      headerRowIndex,
      mapping,
      splitFullNameColumn: analysis.splitFullNameColumn ?? null,
      classAliases: analysis.classAliases ?? [],
      aiAnalysis: analysis,
      clarificationAnswers: {},
      pendingQuestions: unresolvedQuestions(analysis, {}),
    }
  } else {
    const table = gridToTable(grid, headerRowIndex)
    if (table.rows.length === 0) {
      throw new ApiException(400, 'BAD_REQUEST', 'The file has a header row but no data rows')
    }
    if (table.rows.length > MAX_IMPORT_ROWS) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        `This file has ${table.rows.length} rows. Split it into batches of ${MAX_IMPORT_ROWS} or fewer.`,
      )
    }
  }

  const table = gridToTable(grid, headerRowIndex)
  if (table.rows.length > MAX_IMPORT_ROWS) {
    throw new ApiException(
      400,
      'BAD_REQUEST',
      `This file has ${table.rows.length} rows. Split it into batches of ${MAX_IMPORT_ROWS} or fewer.`,
    )
  }

  const batch = await ctx.db.importBatch.create({
    data: {
      tenantId: ctx.tenant.id,
      kind: IMPORT_KIND_STUDENTS,
      fileName: uploaded.fileName,
      storageKey: uploaded.storageKey,
      totalRows: table.rows.length,
      status: useAi ? IMPORT_STATUS.NEEDS_REVIEW : IMPORT_STATUS.VALIDATING,
      createdById: ctx.user.userId,
      errors: {
        headers: table.headers,
        mapping,
        rowErrors: [],
        preview: [],
        ...metaExtras,
      } satisfies ImportBatchMeta,
    },
  })

  if (useAi) {
    return toSummary(batch)
  }

  return validateAndPersist(ctx, batch.id, mapping, { saveAsTemplate: false })
}

export async function listStudentImports(ctx: AppContext): Promise<ImportBatchSummary[]> {
  ctx.require('students.import')
  const batches = await ctx.db.importBatch.findMany({
    where: { kind: IMPORT_KIND_STUDENTS },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  return batches.map(toSummary)
}

export async function getStudentImport(ctx: AppContext, id: string): Promise<ImportBatchSummary> {
  ctx.require('students.import')
  const batch = await ctx.db.importBatch.findFirst({ where: { id, kind: IMPORT_KIND_STUDENTS } })
  if (!batch) throw notFound('Import batch')
  return toSummary(batch)
}

/**
 * Apply (or re-apply) a column mapping and re-run the dry-run validation.
 */
export async function mapStudentImport(
  ctx: AppContext,
  id: string,
  input: ImportMapInput,
): Promise<ImportBatchSummary> {
  ctx.require('students.import')
  return validateAndPersist(ctx, id, input.mapping, { saveAsTemplate: input.saveAsTemplate })
}

/**
 * Answer the AI's clarification questions, merge into the mapping, then validate.
 */
export async function clarifyStudentImport(
  ctx: AppContext,
  id: string,
  input: ImportClarifyInput,
): Promise<ImportBatchSummary> {
  ctx.require('students.import')
  const batch = await requireBatch(ctx, id)
  const meta = readMeta(batch.errors)
  if (!meta.aiAnalysis) {
    throw new ApiException(400, 'BAD_REQUEST', 'This import was not analysed with smart import')
  }

  const answers = { ...(meta.clarificationAnswers ?? {}), ...input.answers }
  const applied = applyClarificationAnswers(meta.aiAnalysis, answers, meta.headers)

  const nextMeta: ImportBatchMeta = {
    ...meta,
    mapping: applied.mapping,
    classAliases: applied.classAliases,
    splitFullNameColumn: applied.splitFullNameColumn,
    clarificationAnswers: answers,
    pendingQuestions: unresolvedQuestions(meta.aiAnalysis, answers),
  }

  await ctx.db.importBatch.update({
    where: { id },
    data: { errors: nextMeta },
  })

  if (nextMeta.pendingQuestions && nextMeta.pendingQuestions.length > 0) {
    const updated = await requireBatch(ctx, id)
    return toSummary(updated)
  }

  return validateAndPersist(ctx, id, applied.mapping, {
    saveAsTemplate: true,
    rowContext: {
      splitFullNameColumn: applied.splitFullNameColumn,
      classAliases: applied.classAliases,
      headerRowIndex: meta.headerRowIndex,
    },
  })
}

/** Admin confirms AI-suggested mapping (and optional manual edits) before validation. */
export async function confirmStudentImportMapping(
  ctx: AppContext,
  id: string,
  input: ImportMapInput & { answers?: Record<string, string> },
): Promise<ImportBatchSummary> {
  ctx.require('students.import')
  const batch = await requireBatch(ctx, id)
  if (batch.status !== IMPORT_STATUS.NEEDS_REVIEW) {
    throw conflict('This import is not awaiting review')
  }

  const meta = readMeta(batch.errors)
  let mapping = normalizeMapping(input.mapping, meta.headers)
  let rowContext: RowBuildContext = {
    splitFullNameColumn: meta.splitFullNameColumn,
    classAliases: meta.classAliases,
    headerRowIndex: meta.headerRowIndex,
  }

  if (meta.aiAnalysis && input.answers && Object.keys(input.answers).length > 0) {
    const applied = applyClarificationAnswers(meta.aiAnalysis, input.answers, meta.headers)
    mapping = { ...applied.mapping, ...mapping }
    rowContext = {
      splitFullNameColumn: applied.splitFullNameColumn,
      classAliases: applied.classAliases,
      headerRowIndex: meta.headerRowIndex,
    }
    const answers = { ...(meta.clarificationAnswers ?? {}), ...input.answers }
    const pending = unresolvedQuestions(meta.aiAnalysis, answers)
    if (pending.length > 0) {
      await ctx.db.importBatch.update({
        where: { id },
        data: {
          errors: {
            ...meta,
            mapping,
            clarificationAnswers: answers,
            pendingQuestions: pending,
            ...rowContext,
          },
        },
      })
      return toSummary(await requireBatch(ctx, id))
    }
  }

  return validateAndPersist(ctx, id, mapping, {
    saveAsTemplate: input.saveAsTemplate,
    rowContext,
  })
}

/**
 * Commit every valid row. Invalid rows are skipped — the dry-run report already
 * listed them. Returns the updated batch summary.
 */
export async function commitStudentImport(ctx: AppContext, id: string): Promise<ImportBatchSummary> {
  ctx.require('students.import')
  ctx.require('students.create')

  const batch = await requireBatch(ctx, id)
  if (batch.status === IMPORT_STATUS.COMMITTED) {
    throw conflict('This import has already been committed')
  }
  if (batch.status === IMPORT_STATUS.ROLLED_BACK) {
    throw conflict('This import was rolled back and cannot be committed again')
  }
  if (batch.status !== IMPORT_STATUS.READY || batch.validRows === 0) {
    throw new ApiException(
      400,
      'BAD_REQUEST',
      batch.status === IMPORT_STATUS.NEEDS_REVIEW
        ? 'Confirm the column mapping before importing'
        : 'Fix the mapping so at least one row is valid before committing',
    )
  }

  const meta = readMeta(batch.errors)
  const table = await readTable(batch.storageKey, meta, batch.fileName)
  const classes = await loadClasses(ctx)
  const existingAdmissions = await loadAdmissionSet(ctx)
  const rowContext: RowBuildContext = {
    splitFullNameColumn: meta.splitFullNameColumn,
    classAliases: meta.classAliases,
    headerRowIndex: meta.headerRowIndex,
  }

  const activeCount = await ctx.db.student.count({
    where: { status: 'ACTIVE', deletedAt: null },
  })
  await assertWithinLimit(ctx.tenant.id, FEATURE.LIMIT_STUDENTS, activeCount, batch.validRows)

  const capacityUsed = new Map<string, number>()
  for (const cls of classes) {
    for (const sec of cls.sections) capacityUsed.set(sec.id, sec.enrolled)
  }

  const committedIds: string[] = []
  const rowErrors: ImportRowError[] = []
  let created = 0

  for (let i = 0; i < table.rows.length; i++) {
    const raw = table.rows[i]!
    const rowNumber = dataRowNumber(i, meta.headerRowIndex)
    const built = buildRow(raw, meta.mapping, classes, existingAdmissions, capacityUsed, rowContext)

    if (!built.ok || !built.input) {
      rowErrors.push({
        row: rowNumber,
        admissionNo: built.admissionNo,
        messages: built.messages,
      })
      continue
    }

    try {
      const student = await createStudent(ctx, built.input)
      committedIds.push(student.id)
      existingAdmissions.add(built.input.admissionNo.toLowerCase())
      const used = capacityUsed.get(built.input.sectionId) ?? 0
      capacityUsed.set(built.input.sectionId, used + 1)
      created++
    } catch (err) {
      rowErrors.push({
        row: rowNumber,
        admissionNo: built.input.admissionNo,
        messages: [err instanceof Error ? err.message : 'Could not create this student'],
      })
    }
  }

  const nextMeta: ImportBatchMeta = {
    ...meta,
    rowErrors,
    committedIds,
    preview: meta.preview,
  }

  const updated = await ctx.db.importBatch.update({
    where: { id },
    data: {
      status: created > 0 ? IMPORT_STATUS.COMMITTED : IMPORT_STATUS.FAILED,
      validRows: created,
      errorRows: rowErrors.length,
      committedAt: created > 0 ? new Date() : null,
      errors: nextMeta,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'students.import.commit',
    module: 'students',
    entityType: 'ImportBatch',
    entityId: id,
    summary: `Imported ${created} student${created === 1 ? '' : 's'} from ${batch.fileName}`,
    after: { created, skipped: rowErrors.length },
  })

  return toSummary(updated)
}

/**
 * Undo a committed import by archiving every student it created. Attendance and
 * fee history that might already hang off those records is preserved via soft
 * archive rather than hard delete.
 */
export async function rollbackStudentImport(ctx: AppContext, id: string): Promise<ImportBatchSummary> {
  ctx.require('students.import')

  const batch = await requireBatch(ctx, id)
  if (batch.status !== IMPORT_STATUS.COMMITTED) {
    throw conflict('Only a committed import can be rolled back')
  }

  const meta = readMeta(batch.errors)
  const ids = meta.committedIds ?? []
  if (ids.length === 0) throw conflict('This import has no students to roll back')

  await ctx.db.$transaction(async (tx) => {
    await tx.enrollment.updateMany({
      where: { studentId: { in: ids }, isCurrent: true },
      data: { isCurrent: false, leftOn: new Date() },
    })
    await tx.student.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: {
        deletedAt: new Date(),
        status: 'WITHDRAWN',
      },
    })
  })

  const updated = await ctx.db.importBatch.update({
    where: { id },
    data: {
      status: IMPORT_STATUS.ROLLED_BACK,
      errors: { ...meta, committedIds: ids },
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'students.import.rollback',
    module: 'students',
    entityType: 'ImportBatch',
    entityId: id,
    summary: `Rolled back import of ${ids.length} student${ids.length === 1 ? '' : 's'} from ${batch.fileName}`,
  })

  return toSummary(updated)
}

export function sampleStudentCsv(): string {
  return toCsv([...SAMPLE_CSV_HEADERS], SAMPLE_CSV_ROWS)
}

export function sampleOnboardingPack(): Buffer {
  return buildOnboardingWorkbook()
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function validateAndPersist(
  ctx: AppContext,
  id: string,
  mappingInput: ImportMapping,
  opts: { saveAsTemplate: boolean; rowContext?: RowBuildContext },
): Promise<ImportBatchSummary> {
  const batch = await requireBatch(ctx, id)
  if (batch.status === IMPORT_STATUS.COMMITTED || batch.status === IMPORT_STATUS.ROLLED_BACK) {
    throw conflict('This import is closed and can no longer be remapped')
  }

  const meta = readMeta(batch.errors)
  const mapping = normalizeMapping(mappingInput, meta.headers)
  const rowContext: RowBuildContext = {
    splitFullNameColumn: opts.rowContext?.splitFullNameColumn ?? meta.splitFullNameColumn,
    classAliases: opts.rowContext?.classAliases ?? meta.classAliases,
    headerRowIndex: opts.rowContext?.headerRowIndex ?? meta.headerRowIndex,
  }

  const allowsSplitName = Boolean(rowContext.splitFullNameColumn)
  for (const key of REQUIRED_IMPORT_FIELDS) {
    if (key === 'firstName' || key === 'lastName') {
      if (allowsSplitName) continue
    }
    if (!mapping[key]) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        `Map a column to ${IMPORT_FIELDS.find((f) => f.key === key)?.label ?? key}`,
      )
    }
  }
  if (allowsSplitName && !mapping.admissionNo) {
    throw new ApiException(400, 'BAD_REQUEST', 'Map a column to Admission number')
  }

  const table = await readTable(batch.storageKey, meta, batch.fileName)
  const classes = await loadClasses(ctx)
  const existingAdmissions = await loadAdmissionSet(ctx)

  const capacityUsed = new Map<string, number>()
  for (const cls of classes) {
    for (const sec of cls.sections) capacityUsed.set(sec.id, sec.enrolled)
  }

  const seenInFile = new Set<string>()
  const rowErrors: ImportRowError[] = []
  const preview: ImportBatchMeta['preview'] = []
  let validRows = 0

  for (let i = 0; i < table.rows.length; i++) {
    const raw = table.rows[i]!
    const rowNumber = dataRowNumber(i, meta.headerRowIndex)
    const built = buildRow(raw, mapping, classes, existingAdmissions, capacityUsed, rowContext)

    if (built.ok && built.input) {
      const key = built.input.admissionNo.toLowerCase()
      if (seenInFile.has(key)) {
        rowErrors.push({
          row: rowNumber,
          admissionNo: built.input.admissionNo,
          messages: [`Admission number ${built.input.admissionNo} is duplicated in this file`],
        })
        preview.push({
          row: rowNumber,
          admissionNo: built.input.admissionNo,
          firstName: built.input.firstName,
          lastName: built.input.lastName,
          className: valueOf(raw, mapping.className),
          sectionName: valueOf(raw, mapping.sectionName),
          ok: false,
        })
        continue
      }
      seenInFile.add(key)
      // Reserve capacity for later rows in the same dry run.
      const used = capacityUsed.get(built.input.sectionId) ?? 0
      capacityUsed.set(built.input.sectionId, used + 1)
      validRows++
      if (preview.length < PREVIEW_LIMIT) {
        preview.push({
          row: rowNumber,
          admissionNo: built.input.admissionNo,
          firstName: built.input.firstName,
          lastName: built.input.lastName,
          className: valueOf(raw, mapping.className),
          sectionName: valueOf(raw, mapping.sectionName),
          ok: true,
        })
      }
    } else {
      rowErrors.push({
        row: rowNumber,
        admissionNo: built.admissionNo,
        messages: built.messages,
      })
      if (preview.length < PREVIEW_LIMIT) {
        preview.push({
          row: rowNumber,
          admissionNo: built.admissionNo ?? '',
          firstName: valueOf(raw, mapping.firstName),
          lastName: valueOf(raw, mapping.lastName),
          className: valueOf(raw, mapping.className),
          sectionName: valueOf(raw, mapping.sectionName),
          ok: false,
        })
      }
    }
  }

  const nextMeta: ImportBatchMeta = {
    ...meta,
    headers: meta.headers.length ? meta.headers : table.headers,
    mapping,
    rowErrors: rowErrors.slice(0, 200),
    preview,
    splitFullNameColumn: rowContext.splitFullNameColumn,
    classAliases: rowContext.classAliases,
    pendingQuestions: [],
  }

  if (opts.saveAsTemplate) {
    await saveMappingTemplate(ctx, mapping)
  }

  const updated = await ctx.db.importBatch.update({
    where: { id },
    data: {
      totalRows: table.rows.length,
      validRows,
      errorRows: rowErrors.length,
      status: validRows > 0 ? IMPORT_STATUS.READY : IMPORT_STATUS.FAILED,
      errors: nextMeta,
    },
  })

  return toSummary(updated)
}

function buildRow(
  raw: Record<string, string>,
  mapping: Record<ImportFieldKey, string | null>,
  classes: ClassLookup[],
  existingAdmissions: Set<string>,
  capacityUsed: Map<string, number>,
  ctx: RowBuildContext = {},
): {
  ok: boolean
  input?: StudentCreateInput
  admissionNo?: string
  messages: string[]
} {
  const messages: string[] = []
  const get = (key: ImportFieldKey) => valueOf(raw, mapping[key])

  const admissionNo = get('admissionNo')
  let firstName = get('firstName')
  let lastName = get('lastName')

  if (ctx.splitFullNameColumn) {
    const full = valueOf(raw, ctx.splitFullNameColumn)
    if (full) {
      const parts = full.split(/\s+/).filter(Boolean)
      if (parts.length >= 2) {
        firstName = parts[0]!
        lastName = parts.slice(1).join(' ')
      } else if (parts.length === 1) {
        firstName = parts[0]!
        lastName = '-'
      }
    }
  }

  let className = get('className')
  let sectionName = get('sectionName')
  ;({ className, sectionName } = applyClassAliases(className, sectionName, ctx.classAliases))

  if (!admissionNo) messages.push('Admission number is missing')
  if (!firstName) messages.push('First name is missing')
  if (!lastName) messages.push('Last name is missing')
  if (!className) messages.push('Class is missing')
  if (!sectionName) messages.push('Section is missing')

  if (admissionNo && existingAdmissions.has(admissionNo.toLowerCase())) {
    messages.push(`Admission number ${admissionNo} is already in use`)
  }

  const resolved = resolveClassSection(classes, className, sectionName)
  if (!resolved.ok) messages.push(...resolved.messages)

  if (resolved.ok) {
    const used = capacityUsed.get(resolved.sectionId) ?? 0
    const section = classes
      .flatMap((c) => c.sections.map((s) => ({ ...s, classId: c.id })))
      .find((s) => s.id === resolved.sectionId)
    if (section && used >= section.capacity) {
      messages.push(`Section ${sectionName} is full (capacity ${section.capacity})`)
    }
  }

  const gender = normalizeGender(get('gender'))
  if (get('gender') && !gender) messages.push('Gender must be Male, Female or Other')

  const relation = normalizeRelation(get('guardianRelation'))
  if (get('guardianRelation') && !relation) {
    messages.push('Guardian relation must be Father, Mother, Guardian or Other')
  }

  const dateOfBirth = parseFlexibleDate(get('dateOfBirth'))
  if (get('dateOfBirth') && !dateOfBirth) {
    messages.push('Date of birth must be YYYY-MM-DD or DD/MM/YYYY')
  }

  const admissionDate = parseFlexibleDate(get('admissionDate'))
  if (get('admissionDate') && !admissionDate) {
    messages.push('Admission date must be YYYY-MM-DD or DD/MM/YYYY')
  }

  const rollRaw = get('rollNumber')
  let rollNumber: number | undefined
  if (rollRaw) {
    const n = Number(rollRaw)
    if (!Number.isInteger(n) || n < 1 || n > 9999) {
      messages.push('Roll number must be a whole number between 1 and 9999')
    } else {
      rollNumber = n
    }
  }

  const guardianFirst = get('guardianFirstName')
  const guardianLast = get('guardianLastName')
  if (guardianFirst && !guardianLast) messages.push('Guardian last name is required when a guardian is provided')
  if (guardianLast && !guardianFirst) messages.push('Guardian first name is required when a guardian is provided')

  if (messages.length || !resolved.ok) {
    return { ok: false, admissionNo: admissionNo || undefined, messages }
  }

  const payload: Record<string, unknown> = {
    admissionNo,
    firstName,
    lastName,
    classLevelId: resolved.classLevelId,
    sectionId: resolved.sectionId,
    rollNumber,
    dateOfBirth: dateOfBirth ?? undefined,
    admissionDate: admissionDate ?? undefined,
    gender: gender ?? undefined,
    bloodGroup: emptyToUndef(get('bloodGroup')),
    category: emptyToUndef(get('category')),
    religion: emptyToUndef(get('religion')),
    nationality: emptyToUndef(get('nationality')),
    motherTongue: emptyToUndef(get('motherTongue')),
    previousSchool: emptyToUndef(get('previousSchool')),
    addressLine1: emptyToUndef(get('addressLine1')),
    addressLine2: emptyToUndef(get('addressLine2')),
    city: emptyToUndef(get('city')),
    state: emptyToUndef(get('state')),
    postalCode: emptyToUndef(get('postalCode')),
    emergencyContactName: emptyToUndef(get('emergencyContactName')),
    emergencyContactPhone: emptyToUndef(get('emergencyContactPhone')),
    medicalNotes: emptyToUndef(get('medicalNotes')),
    allergies: emptyToUndef(get('allergies')),
  }

  if (guardianFirst && guardianLast) {
    payload.guardian = {
      firstName: guardianFirst,
      lastName: guardianLast,
      relation: relation ?? 'GUARDIAN',
      phone: emptyToUndef(get('guardianPhone')),
      email: emptyToUndef(get('guardianEmail')) ?? '',
      occupation: emptyToUndef(get('guardianOccupation')),
      createLogin: false,
    }
  }

  const parsed = studentCreateSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      ok: false,
      admissionNo: admissionNo || undefined,
      messages: parsed.error.issues.map((i) => i.message),
    }
  }

  return { ok: true, input: parsed.data, admissionNo, messages: [] }
}

function resolveClassSection(
  classes: ClassLookup[],
  className: string,
  sectionName: string,
): { ok: true; classLevelId: string; sectionId: string } | { ok: false; messages: string[] } {
  if (!className || !sectionName) return { ok: false, messages: [] }

  const cls = findClass(classes, className)
  if (!cls) {
    return {
      ok: false,
      messages: [`Unknown class "${className}". Use an exact class name from Academics.`],
    }
  }

  const section = cls.sections.find(
    (s) => s.name.localeCompare(sectionName, undefined, { sensitivity: 'accent' }) === 0,
  )
  if (!section) {
    const available = cls.sections.map((s) => s.name).join(', ') || 'none'
    return {
      ok: false,
      messages: [`Unknown section "${sectionName}" for ${cls.name}. Available: ${available}`],
    }
  }

  return { ok: true, classLevelId: cls.id, sectionId: section.id }
}

function findClass(classes: ClassLookup[], className: string): ClassLookup | undefined {
  const exact = classes.find(
    (c) => c.name.localeCompare(className, undefined, { sensitivity: 'accent' }) === 0,
  )
  if (exact) return exact

  const digits = className.match(/\d+/)?.[0]
  if (digits) {
    const numeric = Number(digits)
    const byNumeric = classes.filter((c) => c.numeric === numeric)
    if (byNumeric.length === 1) return byNumeric[0]
  }

  const normalized = className.toLowerCase().replace(/\s+/g, '')
  return classes.find((c) => c.name.toLowerCase().replace(/\s+/g, '') === normalized)
}

function normalizeGender(value: string): 'MALE' | 'FEMALE' | 'OTHER' | undefined {
  if (!value) return undefined
  const v = value.trim().toLowerCase()
  if (['m', 'male', 'boy', 'b'].includes(v)) return 'MALE'
  if (['f', 'female', 'girl', 'g'].includes(v)) return 'FEMALE'
  if (['o', 'other', 'others', 'non-binary', 'nb'].includes(v)) return 'OTHER'
  return undefined
}

function normalizeRelation(
  value: string,
): 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER' | undefined {
  if (!value) return undefined
  const v = value.trim().toLowerCase()
  if (['father', 'dad', 'papa', 'f'].includes(v)) return 'FATHER'
  if (['mother', 'mom', 'mum', 'mama', 'm'].includes(v)) return 'MOTHER'
  if (['guardian', 'g'].includes(v)) return 'GUARDIAN'
  if (['other', 'o'].includes(v)) return 'OTHER'
  return undefined
}

function parseFlexibleDate(value: string): Date | undefined {
  if (!value) return undefined
  const v = value.trim()

  // ISO / HTML date
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00.000Z`)
    return Number.isNaN(d.getTime()) ? undefined : d
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2])
    const year = Number(m[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    const d = new Date(Date.UTC(year, month - 1, day))
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
      return undefined
    }
    return d
  }

  const parsed = new Date(v)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function emptyToUndef(value: string): string | undefined {
  const v = value.trim()
  return v ? v : undefined
}

function valueOf(raw: Record<string, string>, header: string | null | undefined): string {
  if (!header) return ''
  return (raw[header] ?? '').trim()
}

function normalizeMapping(
  input: ImportMapping,
  headers: string[],
): Record<ImportFieldKey, string | null> {
  const headerSet = new Set(headers)
  const base = Object.fromEntries(
    IMPORT_FIELDS.map((f) => [f.key, null]),
  ) as Record<ImportFieldKey, string | null>

  for (const field of IMPORT_FIELDS) {
    const chosen = input[field.key]
    if (chosen && headerSet.has(chosen)) base[field.key] = chosen
  }
  return base
}

function mergeMapping(
  auto: Record<ImportFieldKey, string | null>,
  saved: Record<ImportFieldKey, string | null> | null,
): Record<ImportFieldKey, string | null> {
  if (!saved) return auto
  const merged = { ...auto }
  for (const field of IMPORT_FIELDS) {
    const fromSaved = saved[field.key]
    if (fromSaved && Object.values(auto).includes(fromSaved)) {
      // Prefer saved mapping when that header still exists in this file.
      merged[field.key] = fromSaved
    }
  }
  // Ensure no two fields claim the same header.
  const used = new Set<string>()
  for (const field of IMPORT_FIELDS) {
    const h = merged[field.key]
    if (!h) continue
    if (used.has(h)) merged[field.key] = null
    else used.add(h)
  }
  return merged
}

async function loadClasses(ctx: AppContext): Promise<ClassLookup[]> {
  const session = await ctx.db.academicSession.findFirst({ where: { isCurrent: true } })
  if (!session) {
    throw new ApiException(
      409,
      'NO_ACTIVE_SESSION',
      'No active academic session. Create one in Settings before importing students.',
    )
  }

  const rows = await ctx.db.classLevel.findMany({
    where: { sessionId: session.id, deletedAt: null },
    orderBy: { numeric: 'asc' },
    select: {
      id: true,
      name: true,
      numeric: true,
      sections: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          capacity: true,
          _count: { select: { enrollments: { where: { isCurrent: true } } } },
        },
      },
    },
  })

  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    numeric: c.numeric,
    sections: c.sections.map((s) => ({
      id: s.id,
      name: s.name,
      capacity: s.capacity,
      enrolled: s._count.enrollments,
    })),
  }))
}

async function loadAdmissionSet(ctx: AppContext): Promise<Set<string>> {
  const rows = await ctx.db.student.findMany({
    where: { deletedAt: null },
    select: { admissionNo: true },
  })
  return new Set(rows.map((r) => r.admissionNo.toLowerCase()))
}

async function readTable(
  storageKey: string | null,
  meta: ImportBatchMeta,
  fileName = 'import.csv',
) {
  if (!storageKey) throw new ApiException(400, 'BAD_REQUEST', 'Import file is missing')

  const headerRow = meta.headerRowIndex ?? 0
  if (meta.sourceGrid && meta.sourceGrid.length > 0) {
    return gridToTable(meta.sourceGrid, headerRow)
  }

  const buffer = Buffer.from(await storageProvider().get(storageKey))
  const mime =
    meta.fileKind === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv'
  const { grid } = parseSpreadsheet(buffer, fileName, mime)
  return gridToTable(grid, headerRow)
}

function dataRowNumber(rowIndex: number, headerRowIndex = 0): number {
  return headerRowIndex + rowIndex + 2
}

function applyClassAliases(
  className: string,
  sectionName: string,
  aliases?: ImportClassAlias[],
): { className: string; sectionName: string } {
  if (!aliases?.length) return { className, sectionName }
  const key = `${className}`.trim()
  const alias = aliases.find(
    (a) => a.fileValue.localeCompare(key, undefined, { sensitivity: 'accent' }) === 0,
  )
  if (!alias) return { className, sectionName }
  return {
    className: alias.className || className,
    sectionName: alias.sectionName || sectionName,
  }
}

async function requireBatch(ctx: AppContext, id: string) {
  const batch = await ctx.db.importBatch.findFirst({ where: { id, kind: IMPORT_KIND_STUDENTS } })
  if (!batch) throw notFound('Import batch')
  return batch
}

function readMeta(errors: unknown): ImportBatchMeta {
  const emptyMapping = Object.fromEntries(
    IMPORT_FIELDS.map((f) => [f.key, null]),
  ) as Record<ImportFieldKey, string | null>
  if (!errors || typeof errors !== 'object') {
    return { headers: [], mapping: emptyMapping, rowErrors: [], preview: [] }
  }
  const e = errors as Partial<ImportBatchMeta>
  return {
    headers: Array.isArray(e.headers) ? e.headers : [],
    mapping: { ...emptyMapping, ...(e.mapping ?? {}) },
    rowErrors: Array.isArray(e.rowErrors) ? e.rowErrors : [],
    preview: Array.isArray(e.preview) ? e.preview : [],
    committedIds: Array.isArray(e.committedIds) ? e.committedIds : undefined,
    sourceGrid: Array.isArray(e.sourceGrid) ? e.sourceGrid : undefined,
    headerRowIndex: typeof e.headerRowIndex === 'number' ? e.headerRowIndex : undefined,
    splitFullNameColumn: e.splitFullNameColumn ?? undefined,
    classAliases: Array.isArray(e.classAliases) ? e.classAliases : undefined,
    aiAnalysis: e.aiAnalysis,
    clarificationAnswers: e.clarificationAnswers,
    pendingQuestions: Array.isArray(e.pendingQuestions) ? e.pendingQuestions : undefined,
    fileKind: e.fileKind,
  }
}

function toSummary(batch: {
  id: string
  fileName: string
  status: string
  totalRows: number
  validRows: number
  errorRows: number
  committedAt: Date | null
  createdAt: Date
  errors: unknown
}): ImportBatchSummary {
  const meta = readMeta(batch.errors)
  return {
    id: batch.id,
    fileName: batch.fileName,
    status: batch.status as ImportStatus,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    errorRows: batch.errorRows,
    committedAt: batch.committedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    headers: meta.headers,
    mapping: meta.mapping,
    rowErrors: meta.rowErrors,
    preview: meta.preview,
    committedCount: meta.committedIds?.length ?? 0,
    aiSummary: meta.aiAnalysis?.summary,
    aiNotes: meta.aiAnalysis?.notes ?? undefined,
    pendingQuestions: meta.pendingQuestions,
    splitFullNameColumn: meta.splitFullNameColumn,
    fileKind: meta.fileKind,
    smartImportAvailable: assistantConfigured(),
  }
}

async function loadMappingTemplate(
  ctx: AppContext,
): Promise<Record<ImportFieldKey, string | null> | null> {
  const setting = await ctx.db.setting.findUnique({
    where: {
      tenantId_namespace_key: {
        tenantId: ctx.tenant.id,
        namespace: 'import',
        key: MAPPING_SETTING_KEY,
      },
    },
  })
  if (!setting || typeof setting.value !== 'object' || setting.value === null) return null
  return setting.value as Record<ImportFieldKey, string | null>
}

async function saveMappingTemplate(
  ctx: AppContext,
  mapping: Record<ImportFieldKey, string | null>,
) {
  await ctx.db.setting.upsert({
    where: {
      tenantId_namespace_key: {
        tenantId: ctx.tenant.id,
        namespace: 'import',
        key: MAPPING_SETTING_KEY,
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      namespace: 'import',
      key: MAPPING_SETTING_KEY,
      value: mapping,
    },
    update: { value: mapping },
  })
}

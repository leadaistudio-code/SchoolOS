import { Prisma } from '@prisma/client'
import { addMonths, differenceInCalendarDays } from 'date-fns'
import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notify } from '@/server/notifications'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { applyConcession, computeInvoiceTotals, deriveInvoiceStatus, sumMinor } from '@/lib/money'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { accessibleStudentIds } from '@/server/scope'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const rupees = z.coerce.number().min(0).max(10_000_000).transform((value) => Math.round(value * 100))
const frequencies = ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'TERM_WISE', 'ANNUAL', 'CUSTOM'] as const

export const simpleFeePlanSchema = z.object({
  id: z.string().optional(),
  sessionId: z.string().min(1),
  classLevelId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  dueDay: z.coerce.number().int().min(1).max(28).default(10),
  items: z.array(z.object({
    feeHeadId: z.string().min(1),
    amount: rupees,
    frequency: z.enum(frequencies),
    isOptional: z.coerce.boolean().default(false),
  })).min(1),
  customInstallments: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    dueOn: isoDate,
    lines: z.array(z.object({ feeHeadId: z.string().min(1), amount: rupees })).min(1),
  })).optional(),
})

const OCCURRENCES: Record<(typeof frequencies)[number], number> = {
  ONE_TIME: 1,
  MONTHLY: 12,
  QUARTERLY: 4,
  HALF_YEARLY: 2,
  TERM_WISE: 3,
  ANNUAL: 1,
  CUSTOM: 0,
}

function occurrenceMonths(frequency: (typeof frequencies)[number]) {
  switch (frequency) {
    case 'MONTHLY': return Array.from({ length: 12 }, (_, index) => index)
    case 'QUARTERLY': return [0, 3, 6, 9]
    case 'HALF_YEARLY': return [0, 6]
    case 'TERM_WISE': return [0, 4, 8]
    case 'ONE_TIME':
    case 'ANNUAL': return [0]
    default: return []
  }
}

function dueDate(sessionStart: Date, monthOffset: number, dueDay: number) {
  const month = addMonths(sessionStart, monthOffset)
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), dueDay))
}

export type FeePlanPreview = {
  annualMinor: number
  monthlyEquivalentMinor: number
  installments: {
    name: string
    dueOn: Date
    amountMinor: number
    lines: { feeHeadId: string; label: string; amountMinor: number }[]
  }[]
}

export async function previewFeePlan(ctx: AppContext, raw: unknown): Promise<FeePlanPreview> {
  ctx.require('fees.structure')
  const input = simpleFeePlanSchema.parse(raw)
  const headIds = [...new Set([
    ...input.items.map((item) => item.feeHeadId),
    ...(input.customInstallments?.flatMap((installment) => installment.lines.map((line) => line.feeHeadId)) ?? []),
  ])]
  const [session, heads] = await Promise.all([
    ctx.db.academicSession.findFirst({ where: { id: input.sessionId } }),
    ctx.db.feeHead.findMany({
      where: { id: { in: headIds }, deletedAt: null },
      select: { id: true, name: true },
    }),
  ])
  if (!session) throw notFound('Academic session')
  if (heads.length !== headIds.length) throw notFound('Fee head')
  const labels = new Map(heads.map((head) => [head.id, head.name]))

  if (input.items.some((item) => item.frequency === 'CUSTOM')) {
    if (!input.customInstallments?.length) throw conflict('Add at least one custom installment')
    const installments = input.customInstallments.map((installment) => ({
      name: installment.name,
      dueOn: attendanceDate(installment.dueOn),
      amountMinor: sumMinor(installment.lines.map((line) => line.amount)),
      lines: installment.lines.map((line) => ({
        feeHeadId: line.feeHeadId,
        label: labels.get(line.feeHeadId) ?? 'Fee',
        amountMinor: line.amount,
      })),
    }))
    const annualMinor = sumMinor(installments.map((installment) => installment.amountMinor))
    return { annualMinor, monthlyEquivalentMinor: Math.round(annualMinor / 12), installments }
  }

  const byMonth = new Map<number, FeePlanPreview['installments'][number]['lines']>()
  for (const item of input.items) {
    for (const month of occurrenceMonths(item.frequency)) {
      const lines = byMonth.get(month) ?? []
      lines.push({
        feeHeadId: item.feeHeadId,
        label: labels.get(item.feeHeadId) ?? 'Fee',
        amountMinor: item.amount,
      })
      byMonth.set(month, lines)
    }
  }

  const installments = [...byMonth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, lines]) => {
      const date = dueDate(session.startsOn, month, input.dueDay)
      return {
        name: date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        dueOn: date,
        amountMinor: sumMinor(lines.map((line) => line.amountMinor)),
        lines,
      }
    })
  const annualMinor = sumMinor(installments.map((installment) => installment.amountMinor))
  return { annualMinor, monthlyEquivalentMinor: Math.round(annualMinor / 12), installments }
}

async function resolveDraftStructure(
  ctx: AppContext,
  input: { id?: string; sessionId: string; classLevelId: string; name: string },
) {
  const named = await ctx.db.feeStructure.findFirst({
    where: { sessionId: input.sessionId, name: input.name },
    include: { classLevel: { select: { name: true } } },
  })
  const requested = input.id
    ? await ctx.db.feeStructure.findFirst({ where: { id: input.id } })
    : named && (named.status !== 'PUBLISHED' || named.deletedAt)
      && (!named.classLevelId || named.classLevelId === input.classLevelId)
      ? named
      : null

  if (input.id && !requested) throw notFound('Fee structure')
  if (requested && !requested.deletedAt && requested.status === 'PUBLISHED') {
    throw conflict('Published structures cannot be edited')
  }

  let name = input.name
  const occupiesName = Boolean(
    named
    && named.id !== requested?.id
    && (!named.deletedAt || named.classLevelId !== input.classLevelId),
  )
  if (occupiesName && named) {
    const classLevel = await ctx.db.classLevel.findFirst({
      where: { id: input.classLevelId },
      select: { name: true },
    })
    const suffix = classLevel?.name ? ` · ${classLevel.name}` : ' (2)'
    const candidate = name.endsWith(suffix) ? name : `${name.slice(0, Math.max(2, 80 - suffix.length))}${suffix}`
    const candidateClash = await ctx.db.feeStructure.findFirst({
      where: { sessionId: input.sessionId, name: candidate, id: requested ? { not: requested.id } : undefined },
    })
    if (candidateClash && !candidateClash.deletedAt && candidateClash.status === 'PUBLISHED') {
      throw conflict(
        `A fee structure called ${input.name} already exists this session${named.classLevel ? ` for ${named.classLevel.name}` : ''}. Choose a different name.`,
      )
    }
    if (candidateClash && !candidateClash.deletedAt && candidateClash.classLevelId !== input.classLevelId) {
      throw conflict(
        `A fee structure called ${input.name} already exists this session${named.classLevel ? ` for ${named.classLevel.name}` : ''}. Choose a different name.`,
      )
    }
    name = candidate
    if (candidateClash && (candidateClash.deletedAt || candidateClash.status === 'DRAFT') && !requested) {
      return { existing: candidateClash, name }
    }
  }

  return { existing: requested, name }
}

export async function saveFeePlanDraft(ctx: AppContext, raw: unknown) {
  ctx.require('fees.structure')
  // Parse the original payload independently in both paths. Passing the
  // transformed paise values back through the rupees schema would multiply
  // every amount by 100 a second time.
  const preview = await previewFeePlan(ctx, raw)
  const input = simpleFeePlanSchema.parse(raw)
  const resolved = await resolveDraftStructure(ctx, input)
  const existing = resolved.existing
  if (existing && !existing.deletedAt && existing.status === 'PUBLISHED') {
    throw conflict('Published structures cannot be edited')
  }

  const structure = await ctx.db.$transaction(async (tx) => {
    const row = existing
      ? await tx.feeStructure.update({
          where: { id: existing.id },
          data: {
            name: resolved.name,
            sessionId: input.sessionId,
            classLevelId: input.classLevelId,
            description: input.description,
            deletedAt: null,
            status: 'DRAFT',
          },
        })
      : await tx.feeStructure.create({
          data: {
            tenantId: ctx.tenant.id,
            name: resolved.name,
            sessionId: input.sessionId,
            classLevelId: input.classLevelId,
            description: input.description,
            status: 'DRAFT',
          },
        })

    await tx.feeInstallment.deleteMany({ where: { structureId: row.id } })
    await tx.feeStructureItem.deleteMany({ where: { structureId: row.id } })
    await tx.feeStructureItem.createMany({
      data: input.items.map((item) => ({
        tenantId: ctx.tenant.id,
        structureId: row.id,
        feeHeadId: item.feeHeadId,
        amountMinor: item.amount * OCCURRENCES[item.frequency],
        unitAmountMinor: item.amount,
        frequency: item.frequency,
        occurrenceCount: OCCURRENCES[item.frequency] || null,
        isOptional: item.isOptional,
      })),
    })
    for (const [index, installment] of preview.installments.entries()) {
      await tx.feeInstallment.create({
        data: {
          tenantId: ctx.tenant.id,
          structureId: row.id,
          name: installment.name,
          dueOn: installment.dueOn,
          amountMinor: installment.amountMinor,
          sortOrder: index,
          lines: {
            create: installment.lines.map((line) => ({
              tenantId: ctx.tenant.id,
              feeHeadId: line.feeHeadId,
              label: line.label,
              amountMinor: line.amountMinor,
            })),
          },
        },
      })
    }
    return row
  }).catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict(
        `A fee structure called ${resolved.name} already exists this session. Choose a different name.`,
      )
    }
    throw error
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: existing ? 'fee_structure.draft_update' : 'fee_structure.draft_create',
    module: 'fees',
    entityType: 'FeeStructure',
    entityId: structure.id,
    summary: `${existing ? 'Updated' : 'Created'} draft ${structure.name} with ${preview.installments.length} installments`,
  })
  return { structure, preview }
}

export const copyFeePlanSchema = z.object({
  structureId: z.string().min(1),
  targetSessionId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  increaseKind: z.enum(['NONE', 'PERCENT', 'FIXED']),
  increaseValue: z.coerce.number().min(0).max(10_000_000).default(0),
})

export async function copyFeePlan(ctx: AppContext, raw: unknown) {
  ctx.require('fees.structure')
  const input = copyFeePlanSchema.parse(raw)
  const [source, targetSession] = await Promise.all([
    ctx.db.feeStructure.findFirst({
      where: { id: input.structureId, deletedAt: null },
      include: {
        items: true,
        installments: { orderBy: { sortOrder: 'asc' }, include: { lines: true } },
        session: true,
      },
    }),
    ctx.db.academicSession.findFirst({ where: { id: input.targetSessionId } }),
  ])
  if (!source) throw notFound('Fee structure')
  if (!targetSession) throw notFound('Academic session')
  const increase = (amount: number) => {
    if (input.increaseKind === 'PERCENT') return amount + Math.round(amount * input.increaseValue / 100)
    if (input.increaseKind === 'FIXED') {
      const annual = sumMinor(source.items.map((item) => item.amountMinor))
      return annual > 0 ? amount + Math.round((input.increaseValue * 100 * amount) / annual) : amount
    }
    return amount
  }
  const monthShift =
    (targetSession.startsOn.getUTCFullYear() - source.session.startsOn.getUTCFullYear()) * 12
    + targetSession.startsOn.getUTCMonth() - source.session.startsOn.getUTCMonth()

  const created = await ctx.db.$transaction(async (tx) => {
    const structure = await tx.feeStructure.create({
      data: {
        tenantId: ctx.tenant.id,
        sessionId: targetSession.id,
        classLevelId: source.classLevelId,
        name: input.name,
        description: `Copied from ${source.name}`,
        status: 'DRAFT',
      },
    })
    await tx.feeStructureItem.createMany({
      data: source.items.map((item) => ({
        tenantId: ctx.tenant.id,
        structureId: structure.id,
        feeHeadId: item.feeHeadId,
        amountMinor: increase(item.amountMinor),
        unitAmountMinor: item.unitAmountMinor === null ? null : increase(item.unitAmountMinor),
        frequency: item.frequency,
        occurrenceCount: item.occurrenceCount,
        dueDayOfMonth: item.dueDayOfMonth,
        dueOn: item.dueOn ? addMonths(item.dueOn, monthShift) : null,
        isOptional: item.isOptional,
      })),
    })
    for (const installment of source.installments) {
      await tx.feeInstallment.create({
        data: {
          tenantId: ctx.tenant.id,
          structureId: structure.id,
          name: installment.name,
          dueOn: addMonths(installment.dueOn, monthShift),
          amountMinor: increase(installment.amountMinor),
          sortOrder: installment.sortOrder,
          lines: {
            create: installment.lines.map((line) => ({
              tenantId: ctx.tenant.id,
              feeHeadId: line.feeHeadId,
              label: line.label,
              amountMinor: increase(line.amountMinor),
            })),
          },
        },
      })
    }
    return structure
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_structure.copy',
    module: 'fees',
    entityType: 'FeeStructure',
    entityId: created.id,
    summary: `Copied ${source.name} to ${targetSession.name} as ${created.name}`,
  })
  return created
}

export const publishFeePlanSchema = z.object({
  structureId: z.string().min(1),
  assignment: z.enum(['CLASS', 'SECTION', 'SELECTED']),
  sectionId: z.string().optional(),
  studentIds: z.array(z.string()).max(5000).optional(),
}).superRefine((input, validation) => {
  if (input.assignment === 'SECTION' && !input.sectionId) {
    validation.addIssue({ code: z.ZodIssueCode.custom, path: ['sectionId'], message: 'Choose a section' })
  }
  if (input.assignment === 'SELECTED' && !input.studentIds?.length) {
    validation.addIssue({ code: z.ZodIssueCode.custom, path: ['studentIds'], message: 'Choose at least one student' })
  }
})

export async function previewFeePlanAssignment(ctx: AppContext, raw: unknown) {
  ctx.require('fees.structure_publish')
  const input = publishFeePlanSchema.parse(raw)
  const structure = await ctx.db.feeStructure.findFirst({
    where: { id: input.structureId, deletedAt: null },
    include: { installments: { include: { lines: true }, orderBy: { sortOrder: 'asc' } } },
  })
  if (!structure) throw notFound('Fee structure')
  const enrollments = await ctx.db.enrollment.findMany({
    where: {
      sessionId: structure.sessionId,
      classLevelId: structure.classLevelId ?? undefined,
      isCurrent: true,
      student: { deletedAt: null, status: 'ACTIVE' },
      ...(input.assignment === 'SECTION' ? { sectionId: input.sectionId } : {}),
      ...(input.assignment === 'SELECTED' ? { studentId: { in: input.studentIds ?? [] } } : {}),
    },
    orderBy: [{ section: { name: 'asc' } }, { student: { firstName: 'asc' } }],
    select: {
      studentId: true,
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
      section: { select: { name: true } },
    },
  })
  return {
    structure,
    students: enrollments.map((enrollment) => ({
      id: enrollment.studentId,
      name: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
      admissionNo: enrollment.student.admissionNo,
      section: enrollment.section.name,
    })),
    annualMinor: sumMinor(structure.installments.map((installment) => installment.amountMinor)),
  }
}

/**
 * Older imports and the compact structure editor predate FeeInstallment rows.
 * Materialize a predictable schedule when such a draft is published: the
 * stored amount is the annual total, divided exactly across its occurrences.
 */
async function ensureDraftInstallments(ctx: AppContext, structureId: string) {
  const structure = await ctx.db.feeStructure.findFirst({
    where: { id: structureId, deletedAt: null },
    include: {
      session: true,
      installments: { select: { id: true }, take: 1 },
      items: { include: { feeHead: { select: { name: true, frequency: true } } } },
    },
  })
  if (!structure) throw notFound('Fee structure')
  if (structure.installments.length > 0) return
  if (structure.items.length === 0) throw conflict('Add at least one fee component before publishing')

  const byMonth = new Map<number, { feeHeadId: string; label: string; amountMinor: number }[]>()
  for (const item of structure.items) {
    const frequency = item.frequency ?? item.feeHead.frequency
    let months = occurrenceMonths(frequency)
    if (months.length === 0) {
      throw conflict(`Add an installment schedule for ${item.feeHead.name} before publishing`)
    }
    if (item.dueOn && months.length === 1) {
      const offset =
        (item.dueOn.getUTCFullYear() - structure.session.startsOn.getUTCFullYear()) * 12
        + item.dueOn.getUTCMonth() - structure.session.startsOn.getUTCMonth()
      months = [Math.max(0, offset)]
    }
    const base = Math.floor(item.amountMinor / months.length)
    let remainder = item.amountMinor - base * months.length
    months.forEach((month) => {
      const lines = byMonth.get(month) ?? []
      const extraMinor = remainder > 0 ? 1 : 0
      if (remainder > 0) remainder -= 1
      lines.push({
        feeHeadId: item.feeHeadId,
        label: item.feeHead.name,
        amountMinor: base + extraMinor,
      })
      byMonth.set(month, lines)
    })
  }

  await ctx.db.$transaction(async (tx) => {
    if (await tx.feeInstallment.count({ where: { structureId } })) return
    for (const [index, [month, lines]] of [...byMonth.entries()].sort(([a], [b]) => a - b).entries()) {
      const date = dueDate(structure.session.startsOn, month, 10)
      await tx.feeInstallment.create({
        data: {
          tenantId: ctx.tenant.id,
          structureId,
          name: date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
          dueOn: date,
          amountMinor: sumMinor(lines.map((line) => line.amountMinor)),
          sortOrder: index,
          lines: {
            create: lines.map((line) => ({ tenantId: ctx.tenant.id, ...line })),
          },
        },
      })
    }
  })
}

export async function publishAndAssignFeePlan(ctx: AppContext, raw: unknown) {
  ctx.require('fees.structure_publish')
  const input = publishFeePlanSchema.parse(raw)
  await ensureDraftInstallments(ctx, input.structureId)
  const preview = await previewFeePlanAssignment(ctx, input)
  if (preview.students.length === 0) throw conflict('No active students match this assignment')
  if (preview.structure.installments.length === 0) throw conflict('Create the installment schedule first')

  const result = await ctx.db.$transaction(async (tx) => {
    await tx.feeStructure.update({
      where: { id: preview.structure.id },
      data: { status: 'PUBLISHED', publishedAt: new Date(), isActive: true },
    })
    let assigned = 0
    let invoices = 0
    for (const student of preview.students) {
      await tx.studentFeeAssignment.upsert({
        where: {
          tenantId_studentId_sessionId_structureId: {
            tenantId: ctx.tenant.id,
            studentId: student.id,
            sessionId: preview.structure.sessionId,
            structureId: preview.structure.id,
          },
        },
        create: {
          tenantId: ctx.tenant.id,
          studentId: student.id,
          sessionId: preview.structure.sessionId,
          structureId: preview.structure.id,
          assignedById: ctx.user.userId,
        },
        update: { status: 'ACTIVE', endedAt: null },
      })
      assigned++
    }
    return { assigned, invoices }
  }, { timeout: 120_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_structure.publish_assign',
    module: 'fees',
    entityType: 'FeeStructure',
    entityId: preview.structure.id,
    summary: `Published ${preview.structure.name}, assigned ${result.assigned} students and created ${result.invoices} invoices`,
  })
  return result
}

const billingMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a valid billing month')

export const customInvoiceGenerationSchema = z.object({
  structureId: z.string().min(1),
  selectionMode: z.enum(['INDIVIDUAL', 'CLASS', 'SECTION']).default('INDIVIDUAL'),
  studentIds: z.array(z.string().min(1)).max(250).default([]),
  classLevelId: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional(),
  installmentIds: z.array(z.string().min(1)).min(1, 'Choose at least one billing month').max(24),
  feeHeadIds: z.array(z.string().min(1)).min(1, 'Choose at least one fee head').max(50),
  autoGenerateFrom: billingMonth.nullable().optional(),
  dryRun: z.coerce.boolean().default(false),
}).superRefine((input, ctx) => {
  if (input.selectionMode === 'INDIVIDUAL' && input.studentIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['studentIds'], message: 'Choose at least one student' })
  }
  if (input.selectionMode === 'CLASS' && !input.classLevelId) {
    ctx.addIssue({ code: 'custom', path: ['classLevelId'], message: 'Choose a class' })
  }
  if (input.selectionMode === 'SECTION' && !input.sectionId) {
    ctx.addIssue({ code: 'custom', path: ['sectionId'], message: 'Choose a section' })
  }
})

export type CustomInvoiceGenerationResult = {
  created: number
  skipped: number
  scheduled: number
  totalMinor: number
  preview: {
    studentId: string
    studentName: string
    admissionNo: string
    installmentId: string
    month: string
    feeHeadId: string
    feeHead: string
    amountMinor: number
    discountMinor: number
    netMinor: number
    skipReason?: string
  }[]
}

export async function customInvoiceGenerationOptions(ctx: AppContext) {
  ctx.require('fees.invoice')
  const structures = await ctx.db.feeStructure.findMany({
    where: {
      deletedAt: null,
      status: 'PUBLISHED',
      installments: { some: {} },
    },
    orderBy: [{ session: { startsOn: 'desc' } }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      classLevelId: true,
      session: {
        select: {
          id: true,
          name: true,
          startsOn: true,
          endsOn: true,
          classes: {
            where: { deletedAt: null },
            orderBy: [{ numeric: 'asc' }, { name: 'asc' }],
            select: {
              id: true,
              name: true,
              sections: {
                where: { deletedAt: null },
                orderBy: { name: 'asc' },
                select: { id: true, name: true },
              },
            },
          },
        },
      },
      classLevel: { select: { name: true } },
      installments: {
        orderBy: [{ dueOn: 'asc' }, { sortOrder: 'asc' }],
        select: {
          id: true,
          name: true,
          dueOn: true,
          lines: {
            orderBy: { label: 'asc' },
            select: {
              id: true,
              feeHeadId: true,
              label: true,
              amountMinor: true,
              feeHead: { select: { code: true, name: true } },
            },
          },
        },
      },
    },
  })
  return structures.map((structure) => ({
    id: structure.id,
    name: structure.name,
    className: structure.classLevel?.name ?? 'All classes',
    sessionName: structure.session.name,
    sessionId: structure.session.id,
    classLevelId: structure.classLevelId,
    classes: structure.session.classes
      .filter((item) => !structure.classLevelId || item.id === structure.classLevelId)
      .map((item) => ({
        id: item.id,
        name: item.name,
        sections: item.sections,
      })),
    installments: structure.installments.map((installment) => ({
      id: installment.id,
      name: installment.name,
      dueOn: installment.dueOn.toISOString(),
      month: installment.dueOn.toISOString().slice(0, 7),
      lines: installment.lines.map((line) => ({
        id: line.id,
        feeHeadId: line.feeHeadId,
        label: line.label || line.feeHead.name,
        code: line.feeHead.code,
        amountMinor: line.amountMinor,
      })),
    })),
  }))
}

/**
 * Creates one immutable invoice per student/month/fee-head occurrence.
 * This lets schools backfill only selected months and heads without future
 * installments leaking into outstanding balances. The source key makes every
 * occurrence idempotent across manual and scheduled runs.
 */
export async function generateCustomInvoices(
  ctx: AppContext,
  raw: unknown,
): Promise<CustomInvoiceGenerationResult> {
  ctx.require('fees.invoice')
  const input = customInvoiceGenerationSchema.parse(raw)
  const structure = await ctx.db.feeStructure.findFirst({
    where: { id: input.structureId, deletedAt: null, status: 'PUBLISHED' },
    include: {
      installments: {
        where: { id: { in: input.installmentIds } },
        include: { lines: { include: { feeHead: true } } },
        orderBy: { dueOn: 'asc' },
      },
    },
  })
  if (!structure) throw notFound('Published fee structure')
  if (structure.installments.length !== new Set(input.installmentIds).size) {
    throw conflict('One or more billing months do not belong to this fee structure')
  }
  if (
    input.selectionMode === 'CLASS' &&
    structure.classLevelId &&
    input.classLevelId !== structure.classLevelId
  ) {
    throw conflict('The selected class does not belong to this fee structure')
  }

  const enrollments = await ctx.db.enrollment.findMany({
    where: {
      sessionId: structure.sessionId,
      ...(structure.classLevelId ? { classLevelId: structure.classLevelId } : {}),
      ...(input.selectionMode === 'INDIVIDUAL'
        ? { studentId: { in: input.studentIds } }
        : input.selectionMode === 'CLASS'
          ? { classLevelId: input.classLevelId! }
          : { sectionId: input.sectionId! }),
      student: { deletedAt: null, status: 'ACTIVE' },
    },
    distinct: ['studentId'],
    select: {
      studentId: true,
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
    },
  })
  if (input.selectionMode === 'INDIVIDUAL' && enrollments.length !== new Set(input.studentIds).size) {
    throw conflict('Every selected student must belong to this structure’s class and session')
  }
  if (enrollments.length === 0) {
    throw conflict('No active students were found for this selection')
  }

  const studentIds = enrollments.map((enrollment) => enrollment.studentId)
  const selectedHeads = new Set(input.feeHeadIds)
  const selectedLines = structure.installments.flatMap((installment) =>
    installment.lines
      .filter((line) => selectedHeads.has(line.feeHeadId))
      .map((line) => ({ installment, line })))
  if (selectedLines.length === 0) throw conflict('The selected fee heads are not due in these months')

  const [concessions, existing] = await Promise.all([
    ctx.db.feeConcession.findMany({ where: { studentId: { in: studentIds } } }),
    ctx.db.feeInvoice.findMany({
      where: {
        studentId: { in: studentIds },
        sourceKey: {
          in: studentIds.flatMap((studentId) =>
            selectedLines.map(({ line }) => `fee-line:${line.id}:student:${studentId}`)),
        },
      },
      select: { sourceKey: true },
    }),
  ])
  const existingKeys = new Set(existing.flatMap((invoice) => invoice.sourceKey ? [invoice.sourceKey] : []))
  const concessionsByStudent = new Map<string, typeof concessions>()
  for (const concession of concessions) {
    concessionsByStudent.set(concession.studentId, [
      ...(concessionsByStudent.get(concession.studentId) ?? []),
      concession,
    ])
  }

  const preview: CustomInvoiceGenerationResult['preview'] = []
  for (const enrollment of enrollments) {
    for (const { installment, line } of selectedLines) {
      const sourceKey = `fee-line:${line.id}:student:${enrollment.studentId}`
      let remaining = line.amountMinor
      let discountMinor = 0
      for (const concession of (concessionsByStudent.get(enrollment.studentId) ?? []).filter((item) =>
        (!item.feeHeadId || item.feeHeadId === line.feeHeadId)
        && (!item.validFrom || item.validFrom <= installment.dueOn)
        && (!item.validTo || item.validTo >= installment.dueOn))) {
        const applied = applyConcession(remaining, concession.kind, concession.value)
        remaining = applied.net
        discountMinor += applied.discount
      }
      preview.push({
        studentId: enrollment.studentId,
        studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
        admissionNo: enrollment.student.admissionNo,
        installmentId: installment.id,
        month: installment.dueOn.toISOString().slice(0, 7),
        feeHeadId: line.feeHeadId,
        feeHead: line.feeHead.name,
        amountMinor: line.amountMinor,
        discountMinor,
        netMinor: line.amountMinor - discountMinor,
        ...(existingKeys.has(sourceKey) ? { skipReason: 'Already invoiced' } : {}),
      })
    }
  }

  const ready = preview.filter((item) => !item.skipReason)
  if (input.dryRun) {
    return {
      created: 0,
      skipped: preview.length - ready.length,
      scheduled: input.autoGenerateFrom ? studentIds.length : 0,
      totalMinor: sumMinor(ready.map((item) => item.netMinor)),
      preview,
    }
  }

  const autoGenerateFrom = input.autoGenerateFrom
    ? attendanceDate(`${input.autoGenerateFrom}-01`)
    : null
  const result = await ctx.db.$transaction(async (tx) => {
    for (const studentId of studentIds) {
      await tx.studentFeeAssignment.upsert({
        where: {
          tenantId_studentId_sessionId_structureId: {
            tenantId: ctx.tenant.id,
            studentId,
            sessionId: structure.sessionId,
            structureId: structure.id,
          },
        },
        create: {
          tenantId: ctx.tenant.id,
          studentId,
          sessionId: structure.sessionId,
          structureId: structure.id,
          assignedById: ctx.user.userId,
          autoGenerateFrom,
          autoFeeHeadIds: autoGenerateFrom ? [...selectedHeads] : [],
        },
        update: {
          status: 'ACTIVE',
          endedAt: null,
          autoGenerateFrom,
          autoFeeHeadIds: autoGenerateFrom ? [...selectedHeads] : [],
        },
      })
    }

    let created = 0
    let totalMinor = 0
    for (const item of ready) {
      const line = selectedLines.find(({ installment, line: candidate }) =>
        installment.id === item.installmentId && candidate.feeHeadId === item.feeHeadId)!.line
      const installment = selectedLines.find(({ installment, line: candidate }) =>
        installment.id === item.installmentId && candidate.feeHeadId === item.feeHeadId)!.installment
      const sourceKey = `fee-line:${line.id}:student:${item.studentId}`
      const duplicate = await tx.feeInvoice.findFirst({ where: { sourceKey }, select: { id: true } })
      if (duplicate) continue
      const number = await nextDocumentNumber(tx, {
        tenantId: ctx.tenant.id,
        kind: 'INVOICE',
        sessionLabel: financialYearLabel(installment.dueOn),
      })
      const monthLabel = installment.dueOn.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
      await tx.feeInvoice.create({
        data: {
          tenantId: ctx.tenant.id,
          number,
          studentId: item.studentId,
          sessionId: structure.sessionId,
          structureId: structure.id,
          sourceKey,
          title: `${item.feeHead} — ${monthLabel}`,
          issuedOn: new Date(Date.UTC(installment.dueOn.getUTCFullYear(), installment.dueOn.getUTCMonth(), 1)),
          dueOn: installment.dueOn,
          status: deriveInvoiceStatus({ totalMinor: item.netMinor, paidMinor: 0, dueOn: installment.dueOn }),
          subtotalMinor: item.amountMinor,
          discountMinor: item.discountMinor,
          totalMinor: item.netMinor,
          balanceMinor: item.netMinor,
          lines: {
            create: {
              tenantId: ctx.tenant.id,
              feeHeadId: item.feeHeadId,
              label: line.label,
              amountMinor: item.amountMinor,
              discountMinor: item.discountMinor,
            },
          },
        },
      })
      created++
      totalMinor += item.netMinor
    }
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenant.id,
        actorId: ctx.user.userId,
        actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
        action: 'fee_invoice.custom_generate',
        module: 'fees',
        entityType: 'FeeStructure',
        entityId: structure.id,
        summary: `Generated ${created} selected fee invoices; automatic billing ${autoGenerateFrom ? `starts ${input.autoGenerateFrom}` : 'disabled'}`,
      },
    })
    return { created, totalMinor }
  }, { timeout: 120_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  return {
    ...result,
    skipped: preview.length - result.created,
    scheduled: autoGenerateFrom ? studentIds.length : 0,
    preview,
  }
}

export async function listStudentFeeAccounts(
  ctx: AppContext,
  query: { q?: string; page: number; pageSize: number },
) {
  ctx.require('fees.accounts')
  const where: Prisma.StudentWhereInput = {
    deletedAt: null,
    status: 'ACTIVE',
    ...(query.q ? {
      OR: [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { admissionNo: { contains: query.q, mode: 'insensitive' } },
        { guardians: { some: { parent: { OR: [
          { firstName: { contains: query.q, mode: 'insensitive' } },
          { lastName: { contains: query.q, mode: 'insensitive' } },
          { phone: { contains: query.q } },
        ] } } } },
      ],
    } : {}),
  }
  const [students, total, currentSession] = await Promise.all([
    ctx.db.student.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true, firstName: true, lastName: true, admissionNo: true,
        enrollments: {
          where: { isCurrent: true }, take: 1,
          select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
        },
      },
    }),
    ctx.db.student.count({ where }),
    ctx.db.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true, startsOn: true },
    }),
  ])
  const ids = students.map((student) => student.id)
  const previousSession = currentSession
    ? await ctx.db.academicSession.findFirst({
        where: { startsOn: { lt: currentSession.startsOn } },
        orderBy: { startsOn: 'desc' },
        select: { id: true },
      })
    : null
  const [currentInvoiceAgg, previousInvoiceAgg] = await Promise.all([
    ctx.db.feeInvoice.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: ids },
        sessionId: currentSession?.id ?? '__no_current_session__',
        status: { not: 'CANCELLED' },
      },
      _sum: {
        totalMinor: true,
        discountMinor: true,
        paidMinor: true,
        balanceMinor: true,
      },
    }),
    ctx.db.feeInvoice.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: ids },
        sessionId: previousSession?.id ?? '__no_previous_session__',
        status: { not: 'CANCELLED' },
      },
      _sum: { balanceMinor: true },
    }),
  ])
  const currentInvoices = new Map(currentInvoiceAgg.map((row) => [row.studentId, row._sum]))
  const previousInvoices = new Map(previousInvoiceAgg.map((row) => [row.studentId, row._sum]))
  return {
    total,
    rows: students.map((student) => {
      const current = currentInvoices.get(student.id)
      const lastSessionDueMinor = previousInvoices.get(student.id)?.balanceMinor ?? 0
      const discountMinor = current?.discountMinor ?? 0
      const amountRequestedMinor = (current?.totalMinor ?? 0) + discountMinor
      const paidMinor = current?.paidMinor ?? 0
      const balanceMinor = lastSessionDueMinor + (current?.balanceMinor ?? 0)
      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
        className: student.enrollments[0]?.classLevel.name ?? '—',
        sectionName: student.enrollments[0]?.section.name ?? '—',
        lastSessionDueMinor,
        amountRequestedMinor,
        discountMinor,
        paidMinor,
        balanceMinor,
      }
    }),
  }
}

export async function getStudentFeeAccount(ctx: AppContext, studentId: string) {
  ctx.require('fees.accounts')
  const student = await ctx.db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    include: {
      enrollments: {
        where: { isCurrent: true }, take: 1,
        include: { classLevel: true, section: true, session: true },
      },
      guardians: { where: { isPrimary: true }, take: 1, include: { parent: true } },
      feeAssignments: { where: { status: 'ACTIVE' }, include: { structure: true } },
    },
  })
  if (!student) throw notFound('Student')
  const [invoices, payments, concessions, credits, adjustments] = await Promise.all([
    ctx.db.feeInvoice.findMany({
      where: { studentId, status: { not: 'CANCELLED' } },
      orderBy: [{ dueOn: 'asc' }, { createdAt: 'asc' }],
      include: { lines: true },
    }),
    ctx.db.feePayment.findMany({
      where: { studentId, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
      orderBy: { paidAt: 'asc' },
      include: { receipt: true, refunds: true },
    }),
    ctx.db.feeConcession.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } }),
    ctx.db.studentFeeCredit.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } }),
    ctx.db.feeAdjustment.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } }),
  ])
  const today = attendanceDate(new Date())
  const summary = {
    originalMinor: sumMinor(invoices.map((invoice) => invoice.subtotalMinor)),
    concessionMinor: sumMinor(invoices.map((invoice) => invoice.discountMinor)),
    fineMinor: sumMinor(invoices.map((invoice) => invoice.lateFeeMinor)),
    netMinor: sumMinor(invoices.map((invoice) => invoice.totalMinor)),
    paidMinor: sumMinor(invoices.map((invoice) => invoice.paidMinor)),
    outstandingMinor: sumMinor(invoices.map((invoice) => invoice.balanceMinor)),
    overdueMinor: sumMinor(invoices.filter((invoice) => invoice.dueOn < today).map((invoice) => invoice.balanceMinor)),
    upcomingMinor: sumMinor(invoices.filter((invoice) => invoice.dueOn >= today).map((invoice) => invoice.balanceMinor)),
    creditMinor: sumMinor(credits.map((credit) =>
      ['CREDIT', 'ADJUSTMENT'].includes(credit.type) ? credit.amountMinor : -credit.amountMinor)),
  }
  const emptyPaymentMeta = {
    paymentId: undefined as string | undefined,
    provider: undefined as string | null | undefined,
    status: undefined as string | undefined,
    mode: undefined as string | undefined,
    paidOn: undefined as string | null | undefined,
    billBookNo: undefined as string | null | undefined,
    paymentReference: undefined as string | null | undefined,
    notes: undefined as string | null | undefined,
  }
  const ledger = [
    ...invoices.map((invoice) => ({
      date: invoice.issuedOn,
      type: 'FEE_CHARGE' as const,
      reference: invoice.number,
      description: invoice.title,
      debitMinor: invoice.totalMinor,
      creditMinor: 0,
      ...emptyPaymentMeta,
    })),
    ...payments.map((payment) => ({
      date: payment.paidAt ?? payment.createdAt,
      type: 'PAYMENT' as const,
      reference: payment.receipt?.number ?? payment.id,
      description: `${payment.mode.toLowerCase().replaceAll('_', ' ')} payment`,
      debitMinor: 0,
      creditMinor: payment.amountMinor,
      paymentId: payment.id,
      provider: payment.provider,
      status: payment.status,
      mode: payment.mode,
      paidOn: payment.paidAt ? toDateInput(payment.paidAt) : null,
      billBookNo: payment.billBookNo,
      paymentReference: payment.reference,
      notes: payment.notes,
    })),
    ...payments.flatMap((payment) =>
      payment.refunds
        .filter((refund) => refund.status === 'SUCCESS')
        .map((refund) => ({
          date: refund.completedAt ?? refund.createdAt,
          type: 'REFUND' as const,
          reference: refund.id,
          description: refund.reason,
          debitMinor: refund.amountMinor,
          creditMinor: 0,
          ...emptyPaymentMeta,
          paymentId: payment.id,
        })),
    ),
    ...adjustments.map((adjustment) => ({
      date: adjustment.createdAt,
      type: adjustment.type,
      reference: adjustment.id,
      description: adjustment.reason,
      debitMinor: adjustment.type === 'CHARGE' || adjustment.type === 'REVERSAL' ? adjustment.amountMinor : 0,
      creditMinor: adjustment.type === 'CREDIT' ? adjustment.amountMinor : 0,
      ...emptyPaymentMeta,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())
  let balanceMinor = 0
  return {
    student, invoices, payments, concessions, credits, summary,
    ledger: ledger.map((entry) => {
      balanceMinor += entry.debitMinor - entry.creditMinor
      return { ...entry, balanceMinor }
    }),
  }
}

export const sendFeeReminderSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(500),
  channels: z.array(z.enum(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'])).min(1),
})

export const feeReminderRuleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  offsetType: z.enum(['BEFORE_DUE', 'ON_DUE', 'AFTER_DUE']),
  offsetDays: z.coerce.number().int().min(0).max(365),
  channels: z.array(z.enum(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'])).min(1),
  maxSends: z.coerce.number().int().min(1).max(20).default(1),
  isActive: z.coerce.boolean().default(true),
})

export async function saveFeeReminderRule(ctx: AppContext, raw: unknown) {
  ctx.require('fees.settings')
  const input = feeReminderRuleSchema.parse(raw)
  const { id, ...data } = input
  const rule = id
    ? await ctx.db.feeReminderRule.update({ where: { id }, data })
    : await ctx.db.feeReminderRule.create({ data: { tenantId: ctx.tenant.id, ...data } })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: id ? 'fee_reminder_rule.update' : 'fee_reminder_rule.create',
    module: 'fees',
    entityType: 'FeeReminderRule',
    entityId: rule.id,
    summary: `${id ? 'Updated' : 'Created'} fee reminder rule ${rule.name}`,
    after: rule,
  })
  return rule
}

export const lateFeeRuleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  graceDays: z.coerce.number().int().min(0).max(365),
  kind: z.enum(['FLAT', 'PERCENT']),
  value: z.coerce.number().min(0),
  perDay: z.coerce.boolean().default(false),
  maxAmount: z.coerce.number().min(0).optional(),
})

export async function saveLateFeeRule(ctx: AppContext, raw: unknown) {
  ctx.require('fees.settings')
  const input = lateFeeRuleSchema.parse(raw)
  const value = input.kind === 'FLAT' ? Math.round(input.value * 100) : Math.round(input.value)
  const rule = await ctx.db.$transaction(async (tx) => {
    await tx.feePenaltyRule.updateMany({ where: { isActive: true }, data: { isActive: false } })
    return tx.feePenaltyRule.upsert({
      where: { tenantId_name: { tenantId: ctx.tenant.id, name: input.name } },
      create: {
        tenantId: ctx.tenant.id,
        name: input.name,
        graceDays: input.graceDays,
        kind: input.kind,
        value,
        perDay: input.perDay,
        maxMinor: input.maxAmount === undefined ? null : Math.round(input.maxAmount * 100),
      },
      update: {
        graceDays: input.graceDays,
        kind: input.kind,
        value,
        perDay: input.perDay,
        maxMinor: input.maxAmount === undefined ? null : Math.round(input.maxAmount * 100),
        isActive: true,
      },
    })
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_late_rule.save',
    module: 'fees',
    entityType: 'FeePenaltyRule',
    entityId: rule.id,
    summary: `Saved late fee rule ${rule.name}`,
    after: rule,
  })
  return rule
}

export const transportFeeRateSchema = z.object({
  stopId: z.string().min(1),
  feeHeadId: z.string().min(1),
  amount: rupees,
  effectiveFrom: isoDate,
})

export async function saveTransportFeeRate(ctx: AppContext, raw: unknown) {
  ctx.require('fees.settings')
  const input = transportFeeRateSchema.parse(raw)
  const [stop, head] = await Promise.all([
    ctx.db.busStop.findFirst({ where: { id: input.stopId }, include: { route: true } }),
    ctx.db.feeHead.findFirst({ where: { id: input.feeHeadId, deletedAt: null } }),
  ])
  if (!stop) throw notFound('Transport stop')
  if (!head) throw notFound('Fee head')
  const rate = await ctx.db.transportFeeRate.upsert({
    where: {
      tenantId_stopId_feeHeadId_effectiveFrom: {
        tenantId: ctx.tenant.id,
        stopId: input.stopId,
        feeHeadId: input.feeHeadId,
        effectiveFrom: attendanceDate(input.effectiveFrom),
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      stopId: input.stopId,
      feeHeadId: input.feeHeadId,
      amountMinor: input.amount,
      effectiveFrom: attendanceDate(input.effectiveFrom),
    },
    update: { amountMinor: input.amount },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_transport_rate.save',
    module: 'fees',
    entityType: 'TransportFeeRate',
    entityId: rate.id,
    summary: `Set ${stop.route.name} / ${stop.name} transport fee to ₹${input.amount / 100}`,
    after: rate,
  })
  return rate
}

export async function sendFeeReminders(ctx: AppContext, raw: unknown) {
  ctx.require('fees.reminder')
  const input = sendFeeReminderSchema.parse(raw)
  const allowedStudentIds = await accessibleStudentIds(ctx)
  const requestedStudentIds =
    allowedStudentIds === null
      ? input.studentIds
      : input.studentIds.filter((id) => allowedStudentIds.includes(id))
  const students = await ctx.db.student.findMany({
    where: { id: { in: requestedStudentIds }, deletedAt: null },
    select: {
      id: true, firstName: true,
      guardians: { select: { parent: { select: { userId: true } } } },
      invoices: {
        where: { balanceMinor: { gt: 0 }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        select: { id: true, balanceMinor: true, dueOn: true },
      },
    },
  })
  let sent = 0
  for (const student of students) {
    const amountMinor = sumMinor(student.invoices.map((invoice) => invoice.balanceMinor))
    if (amountMinor <= 0) continue
    const userIds = student.guardians.flatMap((guardian) => guardian.parent.userId ? [guardian.parent.userId] : [])
    await notify(ctx, {
      userIds,
      eventKey: 'fee.due',
      title: 'Fee payment reminder',
      body: `A fee payment of ₹${(amountMinor / 100).toLocaleString('en-IN')} for ${student.firstName} is outstanding. Please open MyCampusView to review and pay.`,
      linkUrl: '/finance',
      channels: input.channels,
    })
    await ctx.db.feeReminderLog.create({
      data: {
        tenantId: ctx.tenant.id,
        studentId: student.id,
        invoiceId: student.invoices.length === 1 ? student.invoices[0]!.id : null,
        channels: input.channels,
        amountMinor,
        sentById: ctx.user.userId,
      },
    })
    sent++
  }
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_reminder.send',
    module: 'fees',
    entityType: 'FeeReminderLog',
    summary: `Sent confirmed fee reminders for ${sent} students`,
  })
  return { sent }
}

export async function feeReportsSummary(ctx: AppContext, from?: string, to?: string) {
  ctx.require('fees.report')
  const dateFilter = from || to ? {
    ...(from ? { gte: attendanceDate(from) } : {}),
    ...(to ? { lte: new Date(attendanceDate(to).getTime() + 86_399_999) } : {}),
  } : undefined
  const [invoices, collections, concessions, refunds, byMode] = await Promise.all([
    ctx.db.feeInvoice.aggregate({
      where: { status: { not: 'CANCELLED' }, ...(dateFilter ? { issuedOn: dateFilter } : {}) },
      _sum: { totalMinor: true, balanceMinor: true, lateFeeMinor: true },
    }),
    ctx.db.feePayment.aggregate({
      where: { status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] }, ...(dateFilter ? { paidAt: dateFilter } : {}) },
      _sum: { amountMinor: true },
    }),
    ctx.db.feeInvoice.aggregate({
      where: { status: { not: 'CANCELLED' }, ...(dateFilter ? { issuedOn: dateFilter } : {}) },
      _sum: { discountMinor: true },
    }),
    ctx.db.feeRefund.aggregate({
      where: { status: 'SUCCESS', ...(dateFilter ? { completedAt: dateFilter } : {}) },
      _sum: { amountMinor: true },
    }),
    ctx.db.feePayment.groupBy({
      by: ['mode'],
      where: { status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] }, ...(dateFilter ? { paidAt: dateFilter } : {}) },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
  ])
  return {
    billedMinor: invoices._sum.totalMinor ?? 0,
    collectedMinor: collections._sum.amountMinor ?? 0,
    outstandingMinor: invoices._sum.balanceMinor ?? 0,
    lateFeeMinor: invoices._sum.lateFeeMinor ?? 0,
    concessionMinor: concessions._sum.discountMinor ?? 0,
    refundMinor: refunds._sum.amountMinor ?? 0,
    byMode,
  }
}

export async function simulateFeeIncrease(
  ctx: AppContext,
  structureId: string,
  kind: 'PERCENT' | 'FIXED',
  value: number,
) {
  ctx.require('fees.owner_analytics')
  const structure = await ctx.db.feeStructure.findFirst({
    where: { id: structureId, deletedAt: null },
    include: { items: true, _count: { select: { assignments: true } } },
  })
  if (!structure) throw notFound('Fee structure')
  const currentAnnualMinor = sumMinor(structure.items.map((item) => item.amountMinor))
  const proposedAnnualMinor = kind === 'PERCENT'
    ? currentAnnualMinor + Math.round(currentAnnualMinor * value / 100)
    : currentAnnualMinor + Math.round(value * 100)
  return {
    currentAnnualMinor,
    proposedAnnualMinor,
    increasePerStudentMinor: proposedAnnualMinor - currentAnnualMinor,
    students: structure._count.assignments,
    estimatedBillingDifferenceMinor:
      (proposedAnnualMinor - currentAnnualMinor) * structure._count.assignments,
  }
}

export function daysOverdue(dueOn: Date, today = attendanceDate(new Date())) {
  return Math.max(0, differenceInCalendarDays(today, dueOn))
}

export const setInvoiceChargeAmountSchema = z.object({
  invoiceId: z.string().min(1),
  /** Gross charge for the invoice in rupees (before considering money already paid). */
  amount: z.coerce.number().min(0).max(10_000_000),
  reason: z.string().trim().min(3, 'Enter a short reason for the change').max(300),
})

/**
 * Sets an invoice’s billed total to any amount (≥ money already paid).
 * Clears line discounts, rewrites line charge amounts, and appends a FeeAdjustment
 * so the ledger stays auditable without rewriting payments.
 */
export async function setInvoiceChargeAmount(
  ctx: AppContext,
  raw: z.infer<typeof setInvoiceChargeAmountSchema>,
) {
  if (!ctx.can('fees.concession') && !ctx.can('fees.invoice')) {
    ctx.require('fees.concession')
  }

  const input = setInvoiceChargeAmountSchema.parse(raw)
  const amountMinor = Math.round(input.amount * 100)

  const invoice = await ctx.db.feeInvoice.findFirst({
    where: { id: input.invoiceId, status: { not: 'CANCELLED' } },
    include: { lines: { orderBy: { id: 'asc' } } },
  })
  if (!invoice) throw notFound('Invoice')

  if (amountMinor < invoice.paidMinor) {
    throw conflict(
      `This invoice already has ${invoice.paidMinor / 100} paid against it. Set the amount to at least that, or reverse the payment first.`,
    )
  }

  const lateFeeMinor = invoice.lateFeeMinor
  const targetSubtotalMinor = Math.max(0, amountMinor - lateFeeMinor)
  if (amountMinor < lateFeeMinor) {
    throw conflict(
      `Amount cannot be below the late fee of ${lateFeeMinor / 100} already on this invoice.`,
    )
  }

  const beforeTotal = invoice.totalMinor
  const deltaMinor = amountMinor - beforeTotal

  await ctx.db.$transaction(async (tx) => {
    if (invoice.lines.length === 0) {
      const balanceMinor = amountMinor - invoice.paidMinor
      await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          subtotalMinor: targetSubtotalMinor,
          discountMinor: 0,
          taxMinor: 0,
          totalMinor: amountMinor,
          balanceMinor,
          status: deriveInvoiceStatus({
            totalMinor: amountMinor,
            paidMinor: invoice.paidMinor,
            dueOn: invoice.dueOn,
          }),
        },
      })
    } else {
      const weights = invoice.lines.map((line) => Math.max(0, line.amountMinor))
      const weightTotal = sumMinor(weights)
      const nextAmounts: number[] = []
      let allocated = 0
      for (let i = 0; i < invoice.lines.length; i++) {
        if (i === invoice.lines.length - 1) {
          nextAmounts.push(Math.max(0, targetSubtotalMinor - allocated))
        } else if (weightTotal <= 0) {
          const share = Math.floor(targetSubtotalMinor / invoice.lines.length)
          nextAmounts.push(share)
          allocated += share
        } else {
          const share = Math.floor((weights[i]! / weightTotal) * targetSubtotalMinor)
          nextAmounts.push(share)
          allocated += share
        }
      }

      const nextLines = invoice.lines.map((line, index) => ({
        id: line.id,
        amountMinor: nextAmounts[index] ?? 0,
        discountMinor: 0,
        taxPercent: 0,
      }))
      const totals = computeInvoiceTotals(nextLines, lateFeeMinor)
      // Force total to the requested amount if rounding drifted (tax cleared).
      const forcedTotal = targetSubtotalMinor + lateFeeMinor
      const balanceMinor = forcedTotal - invoice.paidMinor

      for (const line of nextLines) {
        await tx.feeInvoiceLine.update({
          where: { id: line.id },
          data: {
            amountMinor: line.amountMinor,
            discountMinor: 0,
            taxPercent: 0,
          },
        })
      }

      await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          subtotalMinor: totals.subtotalMinor,
          discountMinor: 0,
          taxMinor: 0,
          totalMinor: forcedTotal,
          balanceMinor,
          status: deriveInvoiceStatus({
            totalMinor: forcedTotal,
            paidMinor: invoice.paidMinor,
            dueOn: invoice.dueOn,
          }),
        },
      })
    }
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee.invoice.amount_set',
    module: 'fees',
    entityType: 'FeeInvoice',
    entityId: invoice.id,
    summary: `Set ${invoice.number} charge from ${beforeTotal / 100} to ${amountMinor / 100}: ${input.reason}`,
    before: { totalMinor: beforeTotal, paidMinor: invoice.paidMinor },
    after: { totalMinor: amountMinor, deltaMinor },
  })

  return { invoiceId: invoice.id, studentId: invoice.studentId, totalMinor: amountMinor }
}

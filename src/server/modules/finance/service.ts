import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { differenceInCalendarDays } from 'date-fns'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { studentIdScopeWhere, accessibleStudentIds } from '@/server/scope'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'
import { nextDocumentNumber, financialYearLabel } from '@/server/numbering'
import { notify } from '@/server/notifications'
import {
  applyConcession,
  computeInvoiceTotals,
  deriveInvoiceStatus,
  lateFeeFor,
  sumMinor,
} from '@/lib/money'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')

/** Amounts arrive from forms in rupees and are stored in paise. */
const rupees = z.coerce
  .number()
  .min(0, 'Amount cannot be negative')
  .max(10_000_000, 'That amount looks wrong')
  .transform((v) => Math.round(v * 100))

/* -------------------------------------------------------------- fee heads */

export const feeHeadSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters and numbers only'),
  name: z.string().trim().min(2).max(80),
  frequency: z
    .enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL'])
    .default('ANNUAL'),
  isRefundable: z.coerce.boolean().default(false),
  isDeposit: z.coerce.boolean().default(false),
})

export async function listFeeHeads(ctx: AppContext) {
  ctx.require('fees.view')
  return ctx.db.feeHead.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      frequency: true,
      isDeposit: true,
      isRefundable: true,
      _count: { select: { items: true } },
    },
  })
}

export async function createFeeHead(ctx: AppContext, input: z.infer<typeof feeHeadSchema>) {
  ctx.require('fees.structure')
  const code = input.code.toUpperCase()

  const existing = await ctx.db.feeHead.findFirst({ where: { code, deletedAt: null } })
  if (existing) throw conflict(`A fee head with the code ${code} already exists`)

  const created = await ctx.db.feeHead.create({
    data: { tenantId: ctx.tenant.id, ...input, code },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_head.create',
    module: 'fees',
    entityType: 'FeeHead',
    entityId: created.id,
    summary: `Created fee head ${created.name} (${created.code})`,
    after: created,
  })
  return created
}

/* --------------------------------------------------------- fee structures */

export const structureSchema = z.object({
  name: z.string().trim().min(2, 'Name the fee structure').max(80),
  classLevelId: z.string().optional(),
  description: z.string().trim().max(300).optional(),
  items: z
    .array(
      z.object({
        feeHeadId: z.string().min(1),
        amount: rupees,
        dueOn: isoDate.optional(),
      }),
    )
    .min(1, 'Add at least one fee head'),
})

export async function listStructures(ctx: AppContext) {
  ctx.require('fees.view')
  const session = await ctx.db.academicSession.findFirst({ where: { isCurrent: true } })
  if (!session) return []

  const structures = await ctx.db.feeStructure.findMany({
    where: { sessionId: session.id, deletedAt: null },
    orderBy: { name: 'asc' },
    include: {
      classLevel: { select: { id: true, name: true } },
      items: { include: { feeHead: { select: { name: true, code: true } } } },
      _count: { select: { invoices: true } },
    },
  })

  return structures.map((s) => ({
    id: s.id,
    name: s.name,
    className: s.classLevel?.name ?? 'All classes',
    isActive: s.isActive,
    invoiceCount: s._count.invoices,
    totalMinor: sumMinor(s.items.map((i) => i.amountMinor)),
    items: s.items.map((i) => ({
      id: i.id,
      label: i.feeHead.name,
      code: i.feeHead.code,
      amountMinor: i.amountMinor,
    })),
  }))
}

export async function createStructure(ctx: AppContext, input: z.infer<typeof structureSchema>) {
  ctx.require('fees.structure')

  const session = await ctx.db.academicSession.findFirst({ where: { isCurrent: true } })
  if (!session) {
    throw new ApiException(409, 'NO_ACTIVE_SESSION', 'Create an academic session first')
  }

  const existing = await ctx.db.feeStructure.findFirst({
    where: { sessionId: session.id, name: input.name, deletedAt: null },
  })
  if (existing) throw conflict(`A structure called ${input.name} already exists this session`)

  const headIds = input.items.map((i) => i.feeHeadId)
  if (new Set(headIds).size !== headIds.length) {
    throw new ApiException(400, 'BAD_REQUEST', 'Each fee head can appear only once')
  }

  const heads = await ctx.db.feeHead.findMany({
    where: { id: { in: headIds }, deletedAt: null },
    select: { id: true },
  })
  if (heads.length !== headIds.length) throw notFound('Fee head')

  const created = await ctx.db.$transaction(async (tx) => {
    const structure = await tx.feeStructure.create({
      data: {
        tenantId: ctx.tenant.id,
        sessionId: session.id,
        classLevelId: input.classLevelId || null,
        name: input.name,
        description: input.description,
      },
    })

    await tx.feeStructureItem.createMany({
      data: input.items.map((i) => ({
        tenantId: ctx.tenant.id,
        structureId: structure.id,
        feeHeadId: i.feeHeadId,
        amountMinor: i.amount,
        dueOn: i.dueOn ? attendanceDate(i.dueOn) : null,
      })),
    })

    return structure
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_structure.create',
    module: 'fees',
    entityType: 'FeeStructure',
    entityId: created.id,
    summary: `Created fee structure ${created.name} with ${input.items.length} heads totalling ${sumMinor(input.items.map((i) => i.amount)) / 100}`,
    after: created,
  })
  return created
}

/* -------------------------------------------------------------- concession */

export const concessionSchema = z.object({
  studentId: z.string().min(1),
  name: z.string().trim().min(2, 'Name the concession').max(80),
  kind: z.enum(['PERCENT', 'FLAT']).default('PERCENT'),
  /** Percent 0-100, or rupees for a flat amount. */
  value: z.coerce.number().min(0),
  feeHeadId: z.string().optional(),
  reason: z.string().trim().max(300).optional(),
})

export async function grantConcession(ctx: AppContext, input: z.infer<typeof concessionSchema>) {
  ctx.require('fees.concession')

  if (input.kind === 'PERCENT' && input.value > 100) {
    throw new ApiException(400, 'BAD_REQUEST', 'A percentage concession cannot exceed 100%')
  }

  const student = await ctx.db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!student) throw notFound('Student')

  const created = await ctx.db.feeConcession.create({
    data: {
      tenantId: ctx.tenant.id,
      studentId: input.studentId,
      name: input.name,
      kind: input.kind,
      // Percent is stored as-is; a flat concession is stored in paise.
      value: input.kind === 'PERCENT' ? Math.round(input.value) : Math.round(input.value * 100),
      feeHeadId: input.feeHeadId || null,
      reason: input.reason,
      approvedById: ctx.user.userId,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_concession.grant',
    module: 'fees',
    entityType: 'FeeConcession',
    entityId: created.id,
    summary: `Granted ${input.kind === 'PERCENT' ? `${input.value}%` : `₹${input.value}`} concession "${input.name}" to ${student.firstName} ${student.lastName}`,
    after: created,
  })
  return created
}

/* -------------------------------------------------------- invoice generation */

export const generateInvoicesSchema = z.object({
  structureId: z.string().min(1, 'Choose a fee structure'),
  classLevelId: z.string().optional(),
  sectionId: z.string().optional(),
  title: z.string().trim().min(2).max(120),
  issuedOn: isoDate,
  dueOn: isoDate,
  /** Preview returns what would be created without writing anything. */
  dryRun: z.coerce.boolean().default(false),
})

export type GenerationResult = {
  created: number
  skipped: number
  totalMinor: number
  preview: {
    studentId: string
    studentName: string
    admissionNo: string
    grossMinor: number
    discountMinor: number
    netMinor: number
    skipReason?: string
  }[]
}

/**
 * Bulk invoice generation.
 *
 * Concessions are applied per line at generation time, so the invoice a parent
 * sees already reflects their scholarship rather than requiring a mental
 * subtraction. A student who already has an invoice for this structure and
 * title is skipped rather than double-billed — running the job twice by
 * accident is the single most expensive mistake available in this module.
 */
export async function generateInvoices(
  ctx: AppContext,
  input: z.infer<typeof generateInvoicesSchema>,
): Promise<GenerationResult> {
  ctx.require('fees.invoice')

  const structure = await ctx.db.feeStructure.findFirst({
    where: { id: input.structureId, deletedAt: null },
    include: { items: { include: { feeHead: true } }, session: true },
  })
  if (!structure) throw notFound('Fee structure')
  if (structure.items.length === 0) throw conflict('That structure has no fee heads')

  const enrollments = await ctx.db.enrollment.findMany({
    where: {
      isCurrent: true,
      sessionId: structure.sessionId,
      student: { deletedAt: null, status: 'ACTIVE' },
      ...(input.sectionId ? { sectionId: input.sectionId } : {}),
      ...(input.classLevelId
        ? { classLevelId: input.classLevelId }
        : structure.classLevelId
          ? { classLevelId: structure.classLevelId }
          : {}),
    },
    select: {
      studentId: true,
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
    },
  })

  if (enrollments.length === 0) {
    throw conflict('No active students match that class or section')
  }

  const studentIds = enrollments.map((e) => e.studentId)

  const [concessions, alreadyInvoiced] = await Promise.all([
    ctx.db.feeConcession.findMany({ where: { studentId: { in: studentIds } } }),
    ctx.db.feeInvoice.findMany({
      where: { studentId: { in: studentIds }, structureId: structure.id, title: input.title },
      select: { studentId: true },
    }),
  ])

  const concessionsByStudent = new Map<string, typeof concessions>()
  for (const c of concessions) {
    concessionsByStudent.set(c.studentId, [...(concessionsByStudent.get(c.studentId) ?? []), c])
  }
  const invoicedSet = new Set(alreadyInvoiced.map((i) => i.studentId))

  const preview: GenerationResult['preview'] = []
  const toCreate: {
    studentId: string
    lines: { feeHeadId: string; label: string; amountMinor: number; discountMinor: number }[]
  }[] = []

  for (const enrollment of enrollments) {
    const studentConcessions = concessionsByStudent.get(enrollment.studentId) ?? []

    const lines = structure.items.map((item) => {
      // A concession tied to a fee head applies only to that head; an untied
      // one applies to every line.
      const applicable = studentConcessions.filter(
        (c) => !c.feeHeadId || c.feeHeadId === item.feeHeadId,
      )

      let discount = 0
      let remaining = item.amountMinor
      for (const c of applicable) {
        const applied = applyConcession(remaining, c.kind, c.value)
        discount += applied.discount
        remaining = applied.net
      }

      return {
        feeHeadId: item.feeHeadId,
        label: item.feeHead.name,
        amountMinor: item.amountMinor,
        discountMinor: discount,
      }
    })

    const gross = sumMinor(lines.map((l) => l.amountMinor))
    const discount = sumMinor(lines.map((l) => l.discountMinor))

    const skipReason = invoicedSet.has(enrollment.studentId)
      ? 'Already invoiced for this title'
      : undefined

    preview.push({
      studentId: enrollment.studentId,
      studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
      admissionNo: enrollment.student.admissionNo,
      grossMinor: gross,
      discountMinor: discount,
      netMinor: gross - discount,
      skipReason,
    })

    if (!skipReason) toCreate.push({ studentId: enrollment.studentId, lines })
  }

  const totalMinor = sumMinor(
    preview.filter((p) => !p.skipReason).map((p) => p.netMinor),
  )

  if (input.dryRun) {
    return {
      created: 0,
      skipped: preview.filter((p) => p.skipReason).length,
      totalMinor,
      preview,
    }
  }

  const issuedOn = attendanceDate(input.issuedOn)
  const dueOn = attendanceDate(input.dueOn)
  const yearLabel = financialYearLabel(issuedOn)

  // One transaction for the whole batch: a half-generated fee run is worse
  // than none, because nobody can tell which parents were billed.
  await ctx.db.$transaction(
    async (tx) => {
      for (const row of toCreate) {
        const totals = computeInvoiceTotals(
          row.lines.map((l) => ({ ...l, taxPercent: 0 })),
        )
        const number = await nextDocumentNumber(tx, {
          tenantId: ctx.tenant.id,
          kind: 'INVOICE',
          sessionLabel: yearLabel,
        })

        await tx.feeInvoice.create({
          data: {
            tenantId: ctx.tenant.id,
            number,
            studentId: row.studentId,
            sessionId: structure.sessionId,
            structureId: structure.id,
            title: input.title,
            issuedOn,
            dueOn,
            status: deriveInvoiceStatus({
              totalMinor: totals.totalMinor,
              paidMinor: 0,
              dueOn,
            }),
            subtotalMinor: totals.subtotalMinor,
            discountMinor: totals.discountMinor,
            taxMinor: totals.taxMinor,
            totalMinor: totals.totalMinor,
            paidMinor: 0,
            balanceMinor: totals.totalMinor,
            lines: {
              create: row.lines.map((l) => ({
                tenantId: ctx.tenant.id,
                feeHeadId: l.feeHeadId,
                label: l.label,
                amountMinor: l.amountMinor,
                discountMinor: l.discountMinor,
              })),
            },
          },
        })
      }
    },
    { timeout: 120_000 },
  )

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_invoice.generate',
    module: 'fees',
    entityType: 'FeeStructure',
    entityId: structure.id,
    summary: `Generated ${toCreate.length} invoices for "${input.title}" totalling ₹${totalMinor / 100}${preview.length - toCreate.length > 0 ? `, skipping ${preview.length - toCreate.length} already invoiced` : ''}`,
  })

  await notifyNewInvoices(ctx, toCreate.map((t) => t.studentId), input.title, input.dueOn)

  return {
    created: toCreate.length,
    skipped: preview.length - toCreate.length,
    totalMinor,
    preview,
  }
}

async function notifyNewInvoices(
  ctx: AppContext,
  studentIds: string[],
  title: string,
  dueOn: string,
) {
  if (studentIds.length === 0) return

  const students = await ctx.db.student.findMany({
    where: { id: { in: studentIds } },
    select: {
      firstName: true,
      guardians: { select: { parent: { select: { userId: true } } } },
    },
  })

  const userIds = students
    .flatMap((s) => s.guardians.map((g) => g.parent.userId))
    .filter((id): id is string => !!id)

  await notify(ctx, {
    userIds,
    eventKey: 'fee.invoice_issued',
    title: `Fee invoice issued: ${title}`,
    body: `A new fee invoice is due on ${dueOn}. You can view and pay it in the portal.`,
    linkUrl: '/finance',
  })
}

/* ------------------------------------------------------------- invoice list */

export const invoiceFilterSchema = z.object({
  status: z
    .enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'])
    .optional(),
  classLevelId: z.string().optional(),
  sectionId: z.string().optional(),
  studentId: z.string().optional(),
  overdueOnly: z.enum(['yes']).optional(),
})

export const INVOICE_SORT_FIELDS = ['dueOn', 'issuedOn', 'number', 'balanceMinor'] as const

export type InvoiceRow = {
  id: string
  number: string
  title: string
  studentId: string
  studentName: string
  admissionNo: string
  className: string | null
  issuedOn: Date
  dueOn: Date
  totalMinor: number
  paidMinor: number
  balanceMinor: number
  status: string
  daysOverdue: number
}

export async function listInvoices(
  ctx: AppContext,
  query: ListQuery,
  filter: z.infer<typeof invoiceFilterSchema>,
): Promise<{ rows: InvoiceRow[]; total: number; totals: { billed: number; collected: number; outstanding: number } }> {
  ctx.require('fees.view')

  const scope = await studentIdScopeWhere(ctx)
  const today = attendanceDate(new Date())

  const where: Prisma.FeeInvoiceWhereInput = {
    ...scope,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.studentId ? { studentId: filter.studentId } : {}),
    ...(filter.overdueOnly === 'yes'
      ? { balanceMinor: { gt: 0 }, dueOn: { lt: today }, status: { not: 'CANCELLED' } }
      : {}),
    ...(filter.classLevelId || filter.sectionId
      ? {
          student: {
            enrollments: {
              some: {
                isCurrent: true,
                ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
                ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
              },
            },
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { number: { contains: query.q, mode: 'insensitive' } },
            { title: { contains: query.q, mode: 'insensitive' } },
            { student: { firstName: { contains: query.q, mode: 'insensitive' } } },
            { student: { lastName: { contains: query.q, mode: 'insensitive' } } },
            { student: { admissionNo: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const orderBy = orderByFrom(query.sort, query.dir, INVOICE_SORT_FIELDS, { dueOn: 'desc' })

  const [rows, total, agg] = await Promise.all([
    ctx.db.feeInvoice.findMany({
      where,
      orderBy,
      ...skipTake(query),
      select: {
        id: true,
        number: true,
        title: true,
        studentId: true,
        issuedOn: true,
        dueOn: true,
        totalMinor: true,
        paidMinor: true,
        balanceMinor: true,
        status: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNo: true,
            enrollments: {
              where: { isCurrent: true },
              take: 1,
              select: {
                classLevel: { select: { name: true } },
                section: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    ctx.db.feeInvoice.count({ where }),
    ctx.db.feeInvoice.aggregate({
      where,
      _sum: { totalMinor: true, paidMinor: true, balanceMinor: true },
    }),
  ])

  return {
    total,
    totals: {
      billed: agg._sum.totalMinor ?? 0,
      collected: agg._sum.paidMinor ?? 0,
      outstanding: agg._sum.balanceMinor ?? 0,
    },
    rows: rows.map((i) => ({
      id: i.id,
      number: i.number,
      title: i.title,
      studentId: i.studentId,
      studentName: `${i.student.firstName} ${i.student.lastName}`,
      admissionNo: i.student.admissionNo,
      className: i.student.enrollments[0]
        ? `${i.student.enrollments[0].classLevel.name} ${i.student.enrollments[0].section.name}`
        : null,
      issuedOn: i.issuedOn,
      dueOn: i.dueOn,
      totalMinor: i.totalMinor,
      paidMinor: i.paidMinor,
      balanceMinor: i.balanceMinor,
      status: i.status,
      daysOverdue:
        i.balanceMinor > 0 && i.dueOn < today ? differenceInCalendarDays(today, i.dueOn) : 0,
    })),
  }
}

export async function getInvoice(ctx: AppContext, id: string) {
  ctx.require('fees.view')

  const allowed = await accessibleStudentIds(ctx)

  const invoice = await ctx.db.feeInvoice.findFirst({
    where: { id, ...(allowed === null ? {} : { studentId: { in: allowed } }) },
    include: {
      lines: { include: { feeHead: { select: { name: true, code: true } } } },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: {
              rollNumber: true,
              classLevel: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
          guardians: {
            where: { isPrimary: true },
            take: 1,
            select: { parent: { select: { firstName: true, lastName: true, phone: true } } },
          },
        },
      },
      allocations: {
        include: {
          payment: {
            select: {
              id: true,
              mode: true,
              status: true,
              paidAt: true,
              reference: true,
              receipt: { select: { number: true } },
            },
          },
        },
      },
    },
  })

  if (!invoice) throw notFound('Invoice')
  return invoice
}

/** Outstanding summarised by class, which is how collection is chased. */
export async function outstandingByClass(ctx: AppContext) {
  ctx.require('fees.view')
  const today = attendanceDate(new Date())

  return ctx.db.$queryRaw<
    { className: string; students: bigint; outstanding: bigint; overdue: bigint }[]
  >`
    SELECT cl.name AS "className",
           COUNT(DISTINCT i."studentId")::bigint AS students,
           SUM(i."balanceMinor")::bigint AS outstanding,
           SUM(CASE WHEN i."dueOn" < ${today} THEN i."balanceMinor" ELSE 0 END)::bigint AS overdue
    FROM "FeeInvoice" i
    JOIN "Enrollment" e ON e."studentId" = i."studentId" AND e."isCurrent" = true
    JOIN "ClassLevel" cl ON cl.id = e."classLevelId"
    WHERE i."tenantId" = ${ctx.tenant.id}
      AND i."balanceMinor" > 0
      AND i.status <> 'CANCELLED'
    GROUP BY cl.name, cl.numeric
    ORDER BY cl.numeric ASC`
}

/**
 * Applies late fees to overdue invoices under the active rules. Designed to be
 * run by a scheduled job; it is idempotent per day because the recomputed late
 * fee replaces the stored one rather than adding to it.
 */
export async function applyLateFees(ctx: AppContext): Promise<{ updated: number; addedMinor: number }> {
  ctx.require('fees.structure')

  const rules = await ctx.db.feePenaltyRule.findMany({ where: { isActive: true } })
  if (rules.length === 0) return { updated: 0, addedMinor: 0 }

  const rule = rules[0]!
  const today = attendanceDate(new Date())

  const overdue = await ctx.db.feeInvoice.findMany({
    where: { balanceMinor: { gt: 0 }, dueOn: { lt: today }, status: { not: 'CANCELLED' } },
    select: {
      id: true,
      dueOn: true,
      totalMinor: true,
      paidMinor: true,
      lateFeeMinor: true,
      subtotalMinor: true,
      discountMinor: true,
      taxMinor: true,
    },
  })

  let addedMinor = 0
  let updated = 0

  for (const invoice of overdue) {
    const daysOverdue = differenceInCalendarDays(today, invoice.dueOn)
    const base = invoice.totalMinor - invoice.lateFeeMinor - invoice.paidMinor
    const fee = lateFeeFor(Math.max(0, base), daysOverdue, {
      graceDays: rule.graceDays,
      kind: rule.kind,
      value: rule.value,
      perDay: rule.perDay,
      maxMinor: rule.maxMinor,
    })

    if (fee === invoice.lateFeeMinor) continue

    const newTotal =
      invoice.subtotalMinor - invoice.discountMinor + invoice.taxMinor + fee

    await ctx.db.feeInvoice.update({
      where: { id: invoice.id },
      data: {
        lateFeeMinor: fee,
        totalMinor: newTotal,
        balanceMinor: newTotal - invoice.paidMinor,
        status: deriveInvoiceStatus({
          totalMinor: newTotal,
          paidMinor: invoice.paidMinor,
          dueOn: invoice.dueOn,
        }),
      },
    })

    addedMinor += fee - invoice.lateFeeMinor
    updated += 1
  }

  if (updated > 0) {
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'fee.late_fee_run',
      module: 'fees',
      summary: `Applied late fees to ${updated} invoices, adding ₹${addedMinor / 100}`,
    })
  }

  return { updated, addedMinor }
}

export { toDateInput }

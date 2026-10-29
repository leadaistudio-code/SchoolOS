import { z } from 'zod'
import type { JournalApprovalStatus, Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { badRequest, conflict, forbidden, notFound } from '@/server/api/response'
import { audit } from '@/server/audit'
import { departmentStageOn, getAccountingFlags, recordAccountingEvent, saveAccountingSettings } from './service'
import {
  JOURNAL_STAGES,
  JOURNAL_STATUS_LABEL,
  JournalApprovalError,
  PENDING_STATUSES,
  journalActions,
  planJournalAction,
  stageOfStatus,
  type JournalAction,
} from './journal-approval'

function who(ctx: AppContext) {
  return { id: ctx.user.userId, label: `${ctx.user.firstName} ${ctx.user.lastName}`.trim() }
}

function actorOf(ctx: AppContext) {
  return { id: ctx.user.userId, can: (p: string) => ctx.can(p) }
}

/** Stage holders, accounts viewers and makers may see the approval queue. */
export function canSeeJournalApprovals(ctx: AppContext) {
  return ctx.can('accounts.view') || JOURNAL_STAGES.some((s) => ctx.can(s.permission))
}

export const SOURCE_LABEL: Record<string, string> = {
  EXPENSE: 'Expense',
  PURCHASE_VOUCHER: 'Vendor bill',
  STORE_PURCHASE: 'Stock purchase',
  PAYROLL: 'Payroll',
  FIXED_ASSET: 'Fixed asset',
  MANUAL: 'Journal voucher',
}

const ENTRY_INCLUDE = {
  lines: { include: { account: { select: { id: true, code: true, name: true, type: true } } }, orderBy: { debitMinor: 'desc' } },
  approvalSteps: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.JournalEntryInclude

export const journalQueueSchema = z.object({
  view: z.enum(['mine', 'pending', 'returned']).default('pending'),
})

/** Entries waiting for sign-off (or returned to their maker), oldest first. */
export async function listJournalApprovals(ctx: AppContext, raw: unknown) {
  if (!canSeeJournalApprovals(ctx)) throw forbidden()
  const { view } = journalQueueSchema.parse(raw ?? {})
  const [departmentStage, flags] = await Promise.all([departmentStageOn(ctx.db), getAccountingFlags(ctx.db)])
  const myStages = JOURNAL_STAGES.filter((s) => ctx.can(s.permission)).map((s) => s.status)
  const where: Prisma.JournalEntryWhereInput =
    view === 'returned'
      ? { approvalStatus: 'RETURNED' }
      : view === 'mine'
        ? { approvalStatus: { in: myStages }, NOT: { createdById: ctx.user.userId } }
        : { approvalStatus: { in: PENDING_STATUSES } }
  const [rows, counts] = await Promise.all([
    ctx.db.journalEntry.findMany({ where, include: ENTRY_INCLUDE, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], take: 200 }),
    ctx.db.journalEntry.groupBy({ by: ['approvalStatus'], where: { approvalStatus: { in: [...PENDING_STATUSES, 'RETURNED'] } }, _count: true, _sum: { totalMinor: true } }),
  ])
  const byStatus = new Map(counts.map((c) => [c.approvalStatus, { count: c._count, totalMinor: c._sum.totalMinor ?? 0 }]))
  return {
    workflowOn: flags.approvals,
    departmentStage,
    view,
    stages: JOURNAL_STAGES.filter((s) => !s.optional || departmentStage || byStatus.has(s.status)).map((s) => ({
      ...s,
      ...(byStatus.get(s.status) ?? { count: 0, totalMinor: 0 }),
      mine: ctx.can(s.permission),
    })),
    returned: byStatus.get('RETURNED') ?? { count: 0, totalMinor: 0 },
    rows: rows.map((e) => ({
      ...e,
      actions: journalActions(
        { status: e.approvalStatus, cycle: e.approvalCycle, createdById: e.createdById },
        e.approvalSteps.filter((s) => s.cycle === e.approvalCycle),
        actorOf(ctx),
        departmentStage,
      ),
    })),
  }
}

/** Count of entries waiting on this user, for the Accounts overview. */
export async function myJournalApprovalCount(ctx: AppContext) {
  const myStages = JOURNAL_STAGES.filter((s) => ctx.can(s.permission)).map((s) => s.status)
  if (!myStages.length) return 0
  return ctx.db.journalEntry.count({ where: { approvalStatus: { in: myStages }, NOT: { createdById: ctx.user.userId } } })
}

export const journalActionSchema = z.object({
  action: z.enum(['approve', 'return', 'resubmit']),
  remarks: z.string().trim().max(500).optional(),
  expectedStatus: z.string().optional(),
})

export async function actOnJournal(ctx: AppContext, id: string, raw: unknown) {
  if (!canSeeJournalApprovals(ctx) && !ctx.can('accounts.manage')) throw forbidden()
  const input = journalActionSchema.parse(raw)
  const actor = who(ctx)
  const departmentStage = await departmentStageOn(ctx.db)

  const result = await ctx.db.$transaction(async (tx) => {
    const locked = await tx.$queryRawUnsafe<{ id: string }[]>(
      'SELECT "id" FROM "JournalEntry" WHERE "id" = $1 AND "tenantId" = $2 FOR UPDATE',
      id,
      ctx.tenant.id,
    )
    if (!locked.length) throw notFound('Journal entry')
    const entry = await tx.journalEntry.findFirstOrThrow({ where: { id } })
    const steps = await tx.journalApprovalStep.findMany({ where: { entryId: id, cycle: entry.approvalCycle }, select: { cycle: true, action: true, actorId: true } })
    let plan
    try {
      plan = planJournalAction({
        entry: { status: entry.approvalStatus, cycle: entry.approvalCycle, createdById: entry.createdById },
        steps,
        actor: actorOf(ctx),
        action: input.action as JournalAction,
        remarks: input.remarks,
        departmentStage,
        expected: (input.expectedStatus as JournalApprovalStatus | undefined) ?? null,
      })
    } catch (error) {
      if (error instanceof JournalApprovalError) {
        if (error.code === 'FORBIDDEN' || error.code === 'SEPARATION_OF_DUTIES') throw forbidden(error.message)
        if (error.code === 'REMARKS_REQUIRED') throw badRequest(error.message)
        throw conflict(error.message)
      }
      throw error
    }
    const cycle = plan.newCycle ? entry.approvalCycle + 1 : entry.approvalCycle
    const updated = await tx.journalEntry.update({
      where: { id },
      data: {
        approvalStatus: plan.to,
        approvalCycle: cycle,
        ...(plan.approves ? { approvedAt: new Date(), approvedById: actor.id } : {}),
      },
    })
    await tx.journalApprovalStep.create({
      data: {
        tenantId: ctx.tenant.id,
        entryId: id,
        cycle,
        action: plan.step,
        fromStatus: entry.approvalStatus,
        toStatus: plan.to,
        actorId: actor.id,
        actorLabel: actor.label,
        remarks: input.remarks?.trim() || null,
      },
    })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'JournalEntry',
      entityId: id,
      action: `journal.${input.action}`,
      fromStatus: entry.approvalStatus,
      toStatus: plan.to,
      reason: input.remarks ?? null,
      actorId: actor.id,
      actorLabel: actor.label,
    })
    // The monthly rollup skips unapproved entries; approval changes a month without a new entry.
    if (plan.approves) await tx.ledgerSummaryState.deleteMany({})
    return { entry: updated, plan, from: entry.approvalStatus }
  })

  if (result.plan.approves) {
    await audit({
      tenantId: ctx.tenant.id,
      actorId: actor.id,
      actorLabel: actor.label,
      action: 'journal.approve',
      module: 'accounts',
      entityType: 'JournalEntry',
      entityId: id,
      summary: `Owner approved ${result.entry.number} for ₹${result.entry.totalMinor / 100}; it now counts in P&L and balance sheet`,
    })
  }
  return { number: result.entry.number, to: result.plan.to, label: JOURNAL_STATUS_LABEL[result.plan.to] }
}

/** Approval state and actions for one entry (voucher page). */
export async function journalApprovalFor(ctx: AppContext, entry: { id: string; approvalStatus: JournalApprovalStatus; approvalCycle: number; createdById: string | null }) {
  const [steps, departmentStage] = await Promise.all([
    ctx.db.journalApprovalStep.findMany({ where: { entryId: entry.id }, orderBy: { createdAt: 'asc' } }),
    departmentStageOn(ctx.db),
  ])
  const actions = journalActions(
    { status: entry.approvalStatus, cycle: entry.approvalCycle, createdById: entry.createdById },
    steps.filter((s) => s.cycle === entry.approvalCycle),
    actorOf(ctx),
    departmentStage,
  )
  return { steps, actions, stage: stageOfStatus(entry.approvalStatus), departmentStage }
}

export async function setDepartmentStage(ctx: AppContext, enabled: boolean) {
  if (!ctx.can('accounts.manage')) throw forbidden()
  return saveAccountingSettings(ctx, { departmentApprovalEnabled: enabled })
}

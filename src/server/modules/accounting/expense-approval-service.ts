import { z } from 'zod'
import { Prisma, type ExpenseApprovalStatus } from '@prisma/client'
import type { AppContext } from '@/server/context'
import type { TenantClient } from '@/server/db/tenant-client'
import { ApiException, badRequest, conflict, forbidden, notFound } from '@/server/api/response'
import { audit } from '@/server/audit'
import { uploadFile } from '@/server/files'
import { storageProvider } from '@/server/providers'
import { attendanceDate } from '@/lib/dates'
import { schoolToday } from '@/lib/periods'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { accountingEnvSwitches, assertPostingAllowed, getAccountingFlags, saveAccountingSettings } from './service'
import { cashBankAccounts } from './cash-bank'
import { toIsoDay } from './fiscal-year'
import { expenseSchema } from '@/server/modules/finance/expenses'
import { loadResolver } from '@/server/modules/accounts/chart'
import { postExpenseInTransaction, reverseExpenseInTransaction } from '@/server/modules/accounts/posting'
import { profitAndLoss } from '@/server/modules/accounts/service'
import {
  APPROVAL_STAGES,
  ApprovalRuleError,
  IN_FLIGHT_STATUSES,
  PROVISIONAL_STATUSES,
  availableActions,
  planTransition,
  projectProfitAndLoss,
  stageOf,
  type ApprovalAction,
  type ApprovalStatus,
  type ProvisionalItem,
} from './expense-approval'

type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0]

function who(ctx: AppContext) {
  return { id: ctx.user.userId, label: `${ctx.user.firstName} ${ctx.user.lastName}`.trim() }
}

function actorOf(ctx: AppContext) {
  return { id: ctx.user.userId, can: (p: string) => ctx.can(p) }
}

const APPROVER_PERMISSIONS = APPROVAL_STAGES.map((s) => s.permission)

/** May see the approval queue: preparers, any stage holder, or accounts viewers. */
export function canSeeApprovals(ctx: AppContext) {
  return ctx.can('expenses.manage') || ctx.can('accounts.view') || APPROVER_PERMISSIONS.some((p) => ctx.can(p))
}

async function requireModule(ctx: AppContext) {
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) throw new ApiException(403, 'FEATURE_DISABLED', 'Accounting is not enabled for this school')
  return flags
}

/** New requests need the workflow switched on; requests already in it can always be finished. */
async function requireWorkflow(ctx: AppContext) {
  const flags = await requireModule(ctx)
  if (!flags.approvals) throw new ApiException(403, 'FEATURE_DISABLED', 'Expense approval is not switched on for this school')
  return flags
}

function ruleError(error: unknown): never {
  if (error instanceof ApprovalRuleError) {
    if (error.code === 'FORBIDDEN' || error.code === 'SEPARATION_OF_DUTIES') throw forbidden(error.message)
    if (error.code === 'STALE' || error.code === 'NOT_ALLOWED') throw conflict(error.message)
    throw badRequest(error.message)
  }
  throw error
}

async function lockRequest(tx: Tx, tenantId: string, id: string) {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    'SELECT "id" FROM "ExpenseApprovalRequest" WHERE "id" = $1 AND "tenantId" = $2 FOR UPDATE',
    id,
    tenantId,
  )
  if (!rows.length) throw notFound('Expense request')
  return tx.expenseApprovalRequest.findFirstOrThrow({ where: { id } })
}

async function autoPostExpenses(db: Pick<TenantClient, 'ledgerSettings'>) {
  const row = await db.ledgerSettings.findFirst({ select: { autoPostExpenses: true } })
  return row?.autoPostExpenses ?? true
}

async function checkHead(db: Pick<TenantClient, 'expenseHead'>, headId: string, allowInactive = false) {
  const head = await db.expenseHead.findFirst({ where: { id: headId }, select: { id: true, name: true, isActive: true, category: true, nature: true } })
  if (!head) throw notFound('Expense head')
  if (!head.isActive && !allowInactive) throw badRequest(`${head.name} is switched off; choose another head`)
  return head
}

async function checkCashAccount(db: Pick<TenantClient, 'ledgerAccount' | 'ledgerAccountMap'>, id: string | null | undefined) {
  if (!id) return null
  const account = (await cashBankAccounts(db)).find((a) => a.id === id)
  if (!account || !account.isActive) throw badRequest('Choose an active cash or bank ledger')
  return account.id
}

// ------------------------------------------------------------------ create / edit

export const expenseRequestSchema = expenseSchema.extend({
  /** Submit straight to stage 2 instead of saving a draft. */
  submit: z.boolean().default(false),
})

export const expenseRequestUpdateSchema = expenseSchema.omit({ idempotencyKey: true })

/** Stage 1: the creator prepares an expense (and optionally submits it at once). */
export async function createExpenseRequest(ctx: AppContext, raw: unknown) {
  ctx.require('expenses.manage')
  const flags = await requireWorkflow(ctx)
  const input = expenseRequestSchema.parse(raw)
  if (input.idempotencyKey) {
    const replay = await ctx.db.expenseApprovalRequest.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
    if (replay) return replay
  }
  const head = await checkHead(ctx.db, input.headId)
  const cashAccountId = await checkCashAccount(ctx.db, input.cashAccountId)
  if (input.submit) await assertPostingAllowed(ctx.db, input.expenseDate, { startMonth: flags.fiscalYearStartMonth })
  const actor = who(ctx)
  const expenseDate = attendanceDate(input.expenseDate)
  try {
    return await ctx.db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, { tenantId: ctx.tenant.id, kind: 'EXPENSE_REQUEST', sessionLabel: financialYearLabel(expenseDate) })
      const created = await tx.expenseApprovalRequest.create({
        data: {
          tenantId: ctx.tenant.id,
          number,
          title: input.title,
          headId: head.id,
          amountMinor: input.amount,
          expenseDate,
          paymentMode: input.paymentMode,
          vendor: input.vendor || null,
          referenceNo: input.referenceNo || null,
          notes: input.notes || null,
          cashAccountId,
          status: input.submit ? 'SUBMITTED' : 'DRAFT',
          submittedAt: input.submit ? new Date() : null,
          createdById: actor.id,
          createdByLabel: actor.label,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      })
      await tx.expenseApprovalStep.create({
        data: { tenantId: ctx.tenant.id, requestId: created.id, cycle: 1, action: 'EDIT', fromStatus: 'DRAFT', toStatus: 'DRAFT', actorId: actor.id, actorLabel: actor.label, remarks: 'Prepared' },
      })
      if (input.submit) {
        await tx.expenseApprovalStep.create({
          data: { tenantId: ctx.tenant.id, requestId: created.id, cycle: 1, action: 'SUBMIT', fromStatus: 'DRAFT', toStatus: 'SUBMITTED', actorId: actor.id, actorLabel: actor.label },
        })
      }
      return created
    })
  } catch (error) {
    if (input.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await ctx.db.expenseApprovalRequest.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
      if (winner) return winner
    }
    throw error
  }
}

/** The creator corrects a draft or returned request. */
export async function updateExpenseRequest(ctx: AppContext, id: string, raw: unknown) {
  ctx.require('expenses.manage')
  await requireModule(ctx)
  const input = expenseRequestUpdateSchema.parse(raw)
  const head = await checkHead(ctx.db, input.headId)
  const cashAccountId = await checkCashAccount(ctx.db, input.cashAccountId)
  const actor = who(ctx)
  return ctx.db.$transaction(async (tx) => {
    const before = await lockRequest(tx, ctx.tenant.id, id)
    if (before.status !== 'DRAFT' && before.status !== 'RETURNED') throw conflict('Only a draft or returned expense can be edited')
    if (before.createdById !== actor.id) throw forbidden('Only the person who prepared this expense can edit it')
    const updated = await tx.expenseApprovalRequest.update({
      where: { id },
      data: {
        title: input.title,
        headId: head.id,
        amountMinor: input.amount,
        expenseDate: attendanceDate(input.expenseDate),
        paymentMode: input.paymentMode,
        vendor: input.vendor || null,
        referenceNo: input.referenceNo || null,
        notes: input.notes || null,
        cashAccountId,
      },
    })
    const changed: string[] = (['title', 'headId', 'amountMinor', 'paymentMode', 'vendor', 'referenceNo', 'notes', 'cashAccountId'] as const)
      .filter((k) => before[k] !== updated[k])
    if (toIsoDay(before.expenseDate) !== toIsoDay(updated.expenseDate)) changed.push('expenseDate')
    await tx.expenseApprovalStep.create({
      data: {
        tenantId: ctx.tenant.id, requestId: id, cycle: before.cycle, action: 'EDIT', fromStatus: before.status, toStatus: before.status,
        actorId: actor.id, actorLabel: actor.label,
        remarks: changed.length ? `Changed ${changed.join(', ')}${before.amountMinor !== updated.amountMinor ? ` (amount ${before.amountMinor / 100} → ${updated.amountMinor / 100})` : ''}` : 'No changes',
      },
    })
    return updated
  })
}

// ------------------------------------------------------------------ transitions

export const transitionSchema = z.object({
  action: z.enum(['submit', 'approve', 'return', 'reject', 'withdraw', 'reverse']),
  remarks: z.string().trim().max(1000).optional(),
  /** The status the user was looking at; a mismatch means someone else acted first. */
  expectedStatus: z.enum(['DRAFT', 'SUBMITTED', 'PENDING_L1', 'PENDING_L2', 'PENDING_FINAL', 'RETURNED', 'REJECTED', 'WITHDRAWN', 'POSTED', 'REVERSED']).optional(),
})

/**
 * Moves a request one step. Every transition locks the request row, re-checks
 * the rules against the locked state, and writes its step in the same
 * transaction. Final approval also creates the expense and posts its journal
 * entry there, so either all of it happens or none of it does.
 */
export async function transitionExpenseRequest(ctx: AppContext, id: string, raw: unknown) {
  const flags = await requireModule(ctx)
  const input = transitionSchema.parse(raw)
  if (input.action === 'submit' && !flags.approvals) {
    throw new ApiException(403, 'FEATURE_DISABLED', 'Expense approval is not switched on for this school')
  }
  const actor = who(ctx)

  // Checks that need reads outside the transaction, done before taking locks.
  const preview = await ctx.db.expenseApprovalRequest.findFirst({ where: { id } })
  if (!preview) throw notFound('Expense request')
  const finalApproval = input.action === 'approve' && preview.status === 'PENDING_FINAL'
  if (finalApproval && !(await autoPostExpenses(ctx.db))) {
    throw conflict('Automatic expense posting is off in posting rules, so an approved expense cannot be posted. Switch it on first.')
  }
  if (input.action === 'submit') await assertPostingAllowed(ctx.db, toIsoDay(preview.expenseDate), { startMonth: flags.fiscalYearStartMonth })
  const resolve = finalApproval ? await loadResolver(ctx.tenant.id, ctx.db) : null
  const today = schoolToday()

  const result = await ctx.db.$transaction(async (tx) => {
    const request = await lockRequest(tx, ctx.tenant.id, id)
    const steps = await tx.expenseApprovalStep.findMany({ where: { requestId: id, cycle: request.cycle }, select: { cycle: true, action: true, actorId: true } })
    const plan = (() => {
      try {
        return planTransition({
          request: { status: request.status, cycle: request.cycle, createdById: request.createdById },
          steps,
          actor: actorOf(ctx),
          action: input.action,
          remarks: input.remarks,
          expected: input.expectedStatus,
        })
      } catch (error) {
        return ruleError(error)
      }
    })()
    const cycle = plan.newCycle ? request.cycle + 1 : request.cycle
    const data: Prisma.ExpenseApprovalRequestUpdateInput = { status: plan.to, cycle }
    let expenseId: string | null = null
    let journalNumber: string | null = null

    if (plan.step === 'SUBMIT') data.submittedAt = new Date()

    if (plan.posts) {
      await assertPostingAllowed(tx, toIsoDay(request.expenseDate), { startMonth: flags.fiscalYearStartMonth })
      const head = await checkHead(tx, request.headId, true)
      const voucherNumber = await nextDocumentNumber(tx, { tenantId: ctx.tenant.id, kind: 'EXPENSE_VOUCHER', sessionLabel: financialYearLabel(request.expenseDate) })
      const expense = await tx.schoolExpense.create({
        data: {
          tenantId: ctx.tenant.id,
          title: request.title,
          headId: head.id,
          category: head.category,
          nature: head.nature,
          amountMinor: request.amountMinor,
          expenseDate: request.expenseDate,
          paymentMode: request.paymentMode,
          vendor: request.vendor,
          referenceNo: request.referenceNo,
          notes: request.notes,
          recordedById: request.createdById,
          recordedByLabel: request.createdByLabel,
          receiptKey: request.receiptKey,
          receiptName: request.receiptName,
          receiptMime: request.receiptMime,
          voucherNumber,
          cashAccountId: request.cashAccountId,
        },
      })
      const entry = await postExpenseInTransaction(tx, ctx.tenant.id, resolve!, expense.id, actor)
      expenseId = expense.id
      journalNumber = entry.number
      data.expenseId = expense.id
      data.postedAt = new Date()
    }

    if (plan.step === 'REVERSE') {
      if (!request.expenseId) throw conflict('This request has no posted expense')
      await assertPostingAllowed(tx, today, { startMonth: flags.fiscalYearStartMonth })
      const expense = await tx.schoolExpense.findFirst({ where: { id: request.expenseId } })
      if (!expense || expense.deletedAt) throw conflict('The posted expense was already removed')
      await tx.schoolExpense.update({ where: { id: expense.id }, data: { deletedAt: new Date() } })
      const reversal = await reverseExpenseInTransaction(tx, ctx.tenant.id, expense.id, attendanceDate(today), actor)
      journalNumber = reversal?.number ?? null
      expenseId = expense.id
      data.reversedAt = new Date()
    }

    const updated = await tx.expenseApprovalRequest.update({ where: { id }, data })
    await tx.expenseApprovalStep.create({
      data: {
        tenantId: ctx.tenant.id,
        requestId: id,
        cycle,
        action: plan.step,
        fromStatus: request.status,
        toStatus: plan.to,
        actorId: actor.id,
        actorLabel: actor.label,
        remarks: input.remarks?.trim() || (journalNumber ? `Journal ${journalNumber}` : null),
      },
    })
    return { request: updated, plan, expenseId, journalNumber }
  })

  if (result.plan.posts || result.plan.step === 'REVERSE') {
    await audit({
      tenantId: ctx.tenant.id,
      actorId: actor.id,
      actorLabel: actor.label,
      action: result.plan.posts ? 'expense.create' : 'expense.delete',
      module: 'expenses',
      entityType: 'SchoolExpense',
      entityId: result.expenseId ?? undefined,
      summary: result.plan.posts
        ? `Posted approved expense ${result.request.number} (${result.request.title}) for ₹${result.request.amountMinor / 100}`
        : `Reversed approved expense ${result.request.number} (${result.request.title})`,
    })
  }
  return result
}

// ------------------------------------------------------------------ receipts

const RECEIPT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

/** The creator attaches the bill while the request is with them (or before validation). */
export async function attachRequestReceipt(ctx: AppContext, id: string, file: File) {
  ctx.require('expenses.manage')
  await requireModule(ctx)
  const request = await ctx.db.expenseApprovalRequest.findFirst({ where: { id } })
  if (!request) throw notFound('Expense request')
  if (!['DRAFT', 'RETURNED', 'SUBMITTED'].includes(request.status)) throw conflict('The bill can only be changed before validation')
  if (request.createdById !== ctx.user.userId) throw forbidden('Only the person who prepared this expense can attach its bill')
  if (!RECEIPT_TYPES.has(file.type)) throw badRequest('Attach a PDF or an image (JPG, PNG, WebP)')
  const stored = await uploadFile(ctx, file, 'expense-receipts')
  const claimed = await ctx.db.expenseApprovalRequest.updateMany({
    where: { id, status: { in: ['DRAFT', 'RETURNED', 'SUBMITTED'] } },
    data: { receiptKey: stored.storageKey, receiptName: stored.fileName, receiptMime: stored.mimeType },
  })
  if (claimed.count !== 1) {
    await storageProvider().delete(stored.storageKey).catch(() => undefined)
    throw conflict('The expense moved on while the bill was uploading')
  }
  if (request.receiptKey) await storageProvider().delete(request.receiptKey).catch(() => undefined)
  await ctx.db.expenseApprovalStep.create({
    data: {
      tenantId: ctx.tenant.id, requestId: id, cycle: request.cycle, action: 'EDIT', fromStatus: request.status, toStatus: request.status,
      actorId: ctx.user.userId, actorLabel: who(ctx).label, remarks: `Attached bill ${stored.fileName}`,
    },
  })
  return { url: `/api/v1/files/${encodeURIComponent(stored.storageKey)}`, fileName: stored.fileName }
}

// ------------------------------------------------------------------ views

export const requestListSchema = z.object({
  view: z.enum(['mine', 'awaiting', 'in_progress', 'closed', 'all']).catch('awaiting'),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
})

/** Statuses at which `ctx` holds the stage permission. */
function stagesFor(ctx: AppContext): ExpenseApprovalStatus[] {
  return APPROVAL_STAGES.filter((s) => ctx.can(s.permission)).map((s) => s.status as ExpenseApprovalStatus)
}

export async function listExpenseRequests(ctx: AppContext, raw: unknown) {
  if (!canSeeApprovals(ctx)) throw forbidden()
  const flags = await requireModule(ctx)
  const filter = requestListSchema.parse(raw ?? {})
  const pageSize = 50
  const mine = { createdById: ctx.user.userId }
  const byView: Record<typeof filter.view, Prisma.ExpenseApprovalRequestWhereInput> = {
    mine,
    awaiting: { status: { in: stagesFor(ctx) }, NOT: mine },
    in_progress: { status: { in: [...IN_FLIGHT_STATUSES, 'DRAFT', 'RETURNED'] as ExpenseApprovalStatus[] } },
    closed: { status: { in: ['POSTED', 'REVERSED', 'REJECTED', 'WITHDRAWN'] } },
    all: {},
  }
  // Preparers without any stage or accounts rights only see their own.
  const ownOnly = !ctx.can('accounts.view') && stagesFor(ctx).length === 0
  const where: Prisma.ExpenseApprovalRequestWhereInput = {
    AND: [
      ownOnly ? mine : {},
      byView[filter.view],
      filter.q ? { OR: [{ title: { contains: filter.q, mode: 'insensitive' } }, { number: { contains: filter.q, mode: 'insensitive' } }, { vendor: { contains: filter.q, mode: 'insensitive' } }] } : {},
    ],
  }
  const [rows, total, counts, heads] = await Promise.all([
    ctx.db.expenseApprovalRequest.findMany({ where, orderBy: [{ updatedAt: 'desc' }], skip: (filter.page - 1) * pageSize, take: pageSize }),
    ctx.db.expenseApprovalRequest.count({ where }),
    ctx.db.expenseApprovalRequest.groupBy({ by: ['status'], where: ownOnly ? mine : {}, _count: { _all: true }, _sum: { amountMinor: true } }),
    ctx.db.expenseHead.findMany({ select: { id: true, name: true } }),
  ])
  const awaitingMe = stagesFor(ctx).length
    ? await ctx.db.expenseApprovalRequest.count({ where: { status: { in: stagesFor(ctx) }, NOT: mine } })
    : 0
  const headName = new Map(heads.map((h) => [h.id, h.name]))
  return {
    rows: rows.map((r) => ({ ...r, headName: headName.get(r.headId) ?? 'Unknown head' })),
    total,
    page: filter.page,
    pageSize,
    filter,
    awaitingMe,
    byStatus: Object.fromEntries(counts.map((c) => [c.status, { count: c._count._all, amountMinor: c._sum.amountMinor ?? 0 }])) as Partial<Record<ApprovalStatus, { count: number; amountMinor: number }>>,
    workflowOn: flags.approvals,
  }
}

export async function getExpenseRequest(ctx: AppContext, id: string) {
  if (!canSeeApprovals(ctx)) throw forbidden()
  const flags = await requireModule(ctx)
  const request = await ctx.db.expenseApprovalRequest.findFirst({ where: { id } })
  if (!request) throw notFound('Expense request')
  const ownOnly = !ctx.can('accounts.view') && stagesFor(ctx).length === 0
  if (ownOnly && request.createdById !== ctx.user.userId) throw notFound('Expense request')
  const [steps, head, cash, entries] = await Promise.all([
    ctx.db.expenseApprovalStep.findMany({ where: { requestId: id }, orderBy: { createdAt: 'asc' } }),
    ctx.db.expenseHead.findFirst({ where: { id: request.headId }, select: { id: true, name: true, nature: true, isActive: true } }),
    request.cashAccountId ? ctx.db.ledgerAccount.findFirst({ where: { id: request.cashAccountId }, select: { code: true, name: true } }) : null,
    request.expenseId
      ? ctx.db.journalEntry.findMany({
          where: { sourceType: 'EXPENSE', sourceId: request.expenseId },
          select: { id: true, number: true, date: true, isReversal: true, reversedAt: true, totalMinor: true },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
  ])
  const actions = availableActions(
    { status: request.status, cycle: request.cycle, createdById: request.createdById },
    steps.filter((s) => s.cycle === request.cycle),
    actorOf(ctx),
  ).filter((a) => a !== 'submit' || flags.approvals)
  const canEdit = (request.status === 'DRAFT' || request.status === 'RETURNED') && request.createdById === ctx.user.userId && ctx.can('expenses.manage')
  return { request, steps, head, cash, entries, actions, canEdit, stage: stageOf(request.status), workflowOn: flags.approvals }
}

// ------------------------------------------------------------------ settings

/** The "Trigger Multi-Tier Approval Workflow" switch for this school. */
export async function setApprovalWorkflow(ctx: AppContext, raw: unknown) {
  if (!ctx.can('accounts.manage')) throw forbidden()
  await requireModule(ctx)
  const { enabled } = z.object({ enabled: z.boolean() }).parse(raw)
  if (enabled && !accountingEnvSwitches().approvals) {
    throw conflict('Approvals are switched off for this deployment (ACCOUNTING_APPROVALS_ENABLED)')
  }
  if (enabled && !(await autoPostExpenses(ctx.db))) {
    throw conflict('Switch on automatic expense posting in posting rules first; approved expenses are posted to the books')
  }
  if (!enabled) {
    const inFlight = await ctx.db.expenseApprovalRequest.count({ where: { status: { in: IN_FLIGHT_STATUSES as ExpenseApprovalStatus[] } } })
    if (inFlight) throw conflict(`${inFlight} expense${inFlight === 1 ? ' is' : 's are'} still in approval; finish, return or reject ${inFlight === 1 ? 'it' : 'them'} first`)
  }
  return saveAccountingSettings(ctx, { approvalWorkflowEnabled: enabled })
}

// ------------------------------------------------------------------ provisional P&L

/**
 * Actual P&L (posted journal lines only) and, alongside it, a projection that
 * adds every submitted-but-not-posted expense dated in the period, once each.
 * Nothing here writes to the ledgers.
 */
export async function provisionalProfitAndLoss(ctx: AppContext, params: { from: string; to: string }) {
  ctx.require('accounts.view')
  await requireModule(ctx)
  const actual = await profitAndLoss(ctx, params)
  const pending = await ctx.db.expenseApprovalRequest.findMany({
    where: {
      status: { in: PROVISIONAL_STATUSES as ExpenseApprovalStatus[] },
      expenseId: null,
      expenseDate: { gte: attendanceDate(params.from), lte: attendanceDate(params.to) },
    },
    orderBy: [{ expenseDate: 'asc' }, { number: 'asc' }],
  })
  let items: ProvisionalItem[] = []
  if (pending.length) {
    const resolve = await loadResolver(ctx.tenant.id, ctx.db)
    const heads = await ctx.db.expenseHead.findMany({
      where: { id: { in: [...new Set(pending.map((p) => p.headId))] } },
      select: { id: true, category: true, account: { select: { id: true, isActive: true } } },
    })
    const headOf = new Map(heads.map((h) => [h.id, h]))
    const accountIdOf = (headId: string) => {
      const head = headOf.get(headId)
      if (head?.account?.isActive) return head.account.id
      return resolve.expense(head?.category ?? 'OTHER')
    }
    const accountIds = [...new Set(pending.map((p) => accountIdOf(p.headId)))]
    const accounts = await ctx.db.ledgerAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, code: true, name: true, expenseNature: true } })
    const accountOf = new Map(accounts.map((a) => [a.id, a]))
    items = pending.map((p) => {
      const account = accountOf.get(accountIdOf(p.headId))
      return {
        requestId: p.id,
        number: p.number,
        title: p.title,
        status: p.status,
        expenseDate: toIsoDay(p.expenseDate),
        amountMinor: p.amountMinor,
        accountId: account?.id ?? '',
        accountCode: account?.code ?? '',
        accountName: account?.name ?? 'Unmapped expense',
        expenseNature: account?.expenseNature ?? null,
      }
    })
  }
  return { actual, projection: projectProfitAndLoss(actual, items) }
}

export type { ApprovalAction }

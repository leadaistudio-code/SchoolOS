import { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import type { TenantClient } from '@/server/db/tenant-client'
import { badRequest, conflict, forbidden } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'
import { env } from '@/lib/env'
import { ACCOUNTING_OFF, resolveAccountingFlags, type AccountingFlags } from './flags'
import { checkPostingDate, fiscalYearOf, isIsoDate, isWithin, toIsoDay } from './fiscal-year'

export function accountingEnvSwitches() {
  const e = env()
  return {
    module: e.ACCOUNTING_MODULE_ENABLED,
    studentLedger: e.ACCOUNTING_STUDENT_LEDGER_ENABLED,
    approvals: e.ACCOUNTING_APPROVALS_ENABLED,
    whatsappReceipts: e.WHATSAPP_RECEIPTS_ENABLED,
  }
}

/**
 * The accounting features this school may use right now. Never throws: if the
 * settings cannot be read every feature reports off, so a page that only
 * decorates itself with accounting (Student 360) still renders.
 */
export async function getAccountingFlags(db: Pick<TenantClient, 'accountingSettings'>): Promise<AccountingFlags> {
  try {
    const switches = accountingEnvSwitches()
    if (!switches.module) return ACCOUNTING_OFF
    const row = await db.accountingSettings.findFirst({
      select: { studentLedgerEnabled: true, approvalWorkflowEnabled: true, whatsappReceiptsEnabled: true, fiscalYearStartMonth: true },
    })
    return resolveAccountingFlags(switches, row)
  } catch (error) {
    console.error('[accounting] flags unavailable, treating as off:', error instanceof Error ? error.message : 'unknown error')
    return ACCOUNTING_OFF
  }
}

export type AccountingEventInput = {
  entityType: string
  entityId?: string | null
  action: string
  fromStatus?: string | null
  toStatus?: string | null
  reason?: string | null
  actorId?: string | null
  actorLabel?: string | null
  correlationId?: string | null
  data?: Prisma.InputJsonValue
}

/**
 * Appends to the accounting trail. With a correlation id the call is
 * idempotent: a retry that repeats the id returns the first record.
 */
export async function recordAccountingEvent(
  db: Pick<TenantClient, 'accountingAuditEvent'>,
  tenantId: string,
  input: AccountingEventInput,
) {
  const data = {
    tenantId,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    reason: input.reason?.slice(0, 1000) ?? null,
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel ?? null,
    correlationId: input.correlationId ?? null,
    data: input.data,
  }
  try {
    return await db.accountingAuditEvent.create({ data })
  } catch (error) {
    if (input.correlationId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await db.accountingAuditEvent.findFirst({ where: { correlationId: input.correlationId } })
      if (existing) return existing
    }
    throw error
  }
}

function actor(ctx: AppContext) {
  return { actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim() }
}

/** Records the financial year containing `date` if the school has not yet. */
export async function ensureFiscalYear(ctx: AppContext, date: string, startMonth: number) {
  if (!isIsoDate(date)) throw badRequest('Enter a valid date')
  const span = fiscalYearOf(date, startMonth)
  const existing = await ctx.db.accountingFiscalYear.findFirst({ where: { label: span.label } })
  if (existing) return existing
  try {
    return await ctx.db.accountingFiscalYear.create({
      data: {
        tenantId: ctx.tenant.id,
        label: span.label,
        startsOn: attendanceDate(span.startsOn),
        endsOn: attendanceDate(span.endsOn),
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const row = await ctx.db.accountingFiscalYear.findFirst({ where: { label: span.label } })
      if (row) return row
    }
    throw error
  }
}

/** Throws a 400 explaining why nothing may be posted on `date`. */
export async function assertPostingAllowed(
  db: Pick<TenantClient, 'accountingFiscalYear'>,
  date: string,
  options: { startMonth: number; requireRecordedYear?: boolean },
) {
  if (!isIsoDate(date)) throw badRequest('Enter a valid voucher date')
  const day = attendanceDate(date)
  const years = await db.accountingFiscalYear.findMany({
    where: { startsOn: { lte: day }, endsOn: { gte: day } },
    select: { label: true, startsOn: true, endsOn: true, status: true, lockedThrough: true },
  })
  const result = checkPostingDate(date, years, options)
  if (!result.ok) throw badRequest(result.message, { code: result.code })
  return result.fiscalYear
}

/**
 * Locks the books up to and including `through`. A lock only moves forward;
 * reopening a locked period is a separate, deliberate action.
 */
export async function lockBooksThrough(ctx: AppContext, through: string, reason: string) {
  if (!ctx.can('accounts.manage')) throw forbidden()
  if (!isIsoDate(through)) throw badRequest('Enter a valid date')
  const why = reason.trim()
  if (!why) throw badRequest('Give a reason for locking the books')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) throw forbidden('The accounting module is not enabled for this school')

  const year = await ensureFiscalYear(ctx, through, flags.fiscalYearStartMonth)
  return ctx.db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "AccountingFiscalYear" WHERE id = ${year.id} AND "tenantId" = ${ctx.tenant.id} FOR UPDATE`
    if (rows.length === 0) throw conflict('Financial year not found')
    const current = await tx.accountingFiscalYear.findFirstOrThrow({ where: { id: year.id } })
    if (current.status === 'CLOSED') throw conflict(`Financial year ${current.label} is already closed`)
    if (!isWithin(through, { startsOn: toIsoDay(current.startsOn), endsOn: toIsoDay(current.endsOn) })) {
      throw badRequest('The lock date must fall inside the financial year')
    }
    const previous = current.lockedThrough ? toIsoDay(current.lockedThrough) : null
    if (previous && through <= previous) throw conflict(`The books are already locked up to ${previous}`)

    const updated = await tx.accountingFiscalYear.update({
      where: { id: current.id },
      data: { status: 'LOCKED', lockedThrough: attendanceDate(through), lockedById: ctx.user.userId, lockedAt: new Date() },
    })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'AccountingFiscalYear',
      entityId: current.id,
      action: 'period.locked',
      fromStatus: current.status,
      toStatus: 'LOCKED',
      reason: why,
      ...actor(ctx),
      data: { label: current.label, from: previous, through },
    })
    return updated
  })
}

export type AccountingSettingsInput = {
  studentLedgerEnabled?: boolean
  approvalWorkflowEnabled?: boolean
  whatsappReceiptsEnabled?: boolean
  fiscalYearStartMonth?: number
}

/** Saves a school's accounting switches and records who changed what. */
export async function saveAccountingSettings(ctx: AppContext, input: AccountingSettingsInput) {
  if (!ctx.can('accounts.manage')) throw forbidden()
  const month = input.fiscalYearStartMonth
  if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
    throw badRequest('Financial year start month must be 1 to 12')
  }
  const data = {
    ...(input.studentLedgerEnabled !== undefined ? { studentLedgerEnabled: input.studentLedgerEnabled } : {}),
    ...(input.approvalWorkflowEnabled !== undefined ? { approvalWorkflowEnabled: input.approvalWorkflowEnabled } : {}),
    ...(input.whatsappReceiptsEnabled !== undefined ? { whatsappReceiptsEnabled: input.whatsappReceiptsEnabled } : {}),
    ...(month !== undefined ? { fiscalYearStartMonth: month } : {}),
  }
  return ctx.db.$transaction(async (tx) => {
    const before = await tx.accountingSettings.findFirst()
    const saved = before
      ? await tx.accountingSettings.update({ where: { id: before.id }, data: { ...data, updatedById: ctx.user.userId } })
      : await tx.accountingSettings.create({ data: { tenantId: ctx.tenant.id, ...data, updatedById: ctx.user.userId } })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'AccountingSettings',
      entityId: saved.id,
      action: 'settings.updated',
      ...actor(ctx),
      data: { before: before ? pickSettings(before) : null, after: pickSettings(saved) },
    })
    return saved
  })
}

function pickSettings(row: AccountingSettingsInput) {
  return {
    studentLedgerEnabled: row.studentLedgerEnabled,
    approvalWorkflowEnabled: row.approvalWorkflowEnabled,
    whatsappReceiptsEnabled: row.whatsappReceiptsEnabled,
    fiscalYearStartMonth: row.fiscalYearStartMonth,
  }
}

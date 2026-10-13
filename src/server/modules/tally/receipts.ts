import type { AppContext } from '@/server/context'
import { badRequest, notFound } from '@/server/api/response'
import { tenantDb } from '@/server/db/tenant-client'
import { TALLY_ERROR, tallyErrorMessage } from '@/server/integrations/tally'
import { enqueueTallyCommand, enqueueTallyCommandSystem } from './commands'
import { auditTally } from './logging'
import { getOrCreateIntegration } from './settings'

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function rupees(minor: number): number {
  return Math.round(minor) / 100
}

/**
 * Build a voucher preview for a successful FeePayment without posting.
 */
export async function previewReceiptVoucher(ctx: AppContext, paymentId: string) {
  if (!ctx.canAny('fees.tally', 'fees.tally_manage')) ctx.require('fees.tally')
  const built = await buildReceiptVoucherPayload(ctx.tenant.id, paymentId)
  return built
}

async function buildReceiptVoucherPayload(tenantId: string, paymentId: string) {
  const db = tenantDb(tenantId)
  const integration = await db.tallyIntegration.findUnique({ where: { tenantId } })
  if (!integration) {
    return {
      ok: false as const,
      errorCode: TALLY_ERROR.VALIDATION_FAILED,
      errorMessage: 'Tally integration is not configured',
    }
  }

  const payment = await db.feePayment.findFirst({
    where: { id: paymentId, status: 'SUCCESS' },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
      receipt: { select: { id: true, number: true } },
      allocations: {
        include: {
          invoice: {
            include: {
              lines: { include: { feeHead: { select: { id: true, name: true, code: true } } } },
            },
          },
        },
      },
    },
  })
  if (!payment) {
    return {
      ok: false as const,
      errorCode: TALLY_ERROR.VALIDATION_FAILED,
      errorMessage: 'Payment not found or not successful',
    }
  }

  const modeMapping = await db.tallyMapping.findFirst({
    where: {
      integrationId: integration.id,
      kind: 'PAYMENT_MODE',
      localKey: payment.mode,
      active: true,
    },
  })
  const modeRule = await db.tallyAccountingRule.findFirst({
    where: {
      integrationId: integration.id,
      paymentMode: payment.mode,
      active: true,
    },
    orderBy: { sortOrder: 'asc' },
  })
  const defaultRule = await db.tallyAccountingRule.findFirst({
    where: {
      integrationId: integration.id,
      paymentMode: null,
      active: true,
    },
    orderBy: { sortOrder: 'asc' },
  })

  const debitLedger =
    modeMapping?.tallyLedgerName ??
    modeRule?.debitLedgerName ??
    defaultRule?.debitLedgerName ??
    null

  if (!debitLedger) {
    return {
      ok: false as const,
      errorCode: TALLY_ERROR.LEDGER_MAPPING_MISSING,
      errorMessage: tallyErrorMessage(TALLY_ERROR.LEDGER_MAPPING_MISSING),
      payment,
    }
  }

  // Credit side: prefer fee-head mappings from invoice lines; fall back to party ledger.
  const creditLines: Array<{ ledgerName: string; amountMinor: number; feeHeadId?: string }> = []
  let remaining = payment.amountMinor

  for (const alloc of payment.allocations) {
    const lines = alloc.invoice.lines
    const invoiceTotal = Math.max(1, alloc.invoice.totalMinor)
    for (const line of lines) {
      if (!line.feeHeadId || !line.feeHead) continue
      const share = Math.round((alloc.amountMinor * line.amountMinor) / invoiceTotal)
      if (share <= 0) continue
      const map = await db.tallyMapping.findFirst({
        where: {
          integrationId: integration.id,
          kind: 'FEE_HEAD',
          localKey: line.feeHeadId,
          active: true,
        },
      })
      if (!map) {
        return {
          ok: false as const,
          errorCode: TALLY_ERROR.LEDGER_MAPPING_MISSING,
          errorMessage: `No Tally ledger mapped for fee head "${line.feeHead.name}"`,
          payment,
        }
      }
      creditLines.push({
        ledgerName: map.tallyLedgerName,
        amountMinor: share,
        feeHeadId: line.feeHeadId,
      })
      remaining -= share
    }
  }

  // Collapse same ledger names
  const collapsed = new Map<string, number>()
  for (const line of creditLines) {
    collapsed.set(line.ledgerName, (collapsed.get(line.ledgerName) ?? 0) + line.amountMinor)
  }

  // Residual (rounding / unallocated) → student party ledger or default credit
  if (remaining > 0 || collapsed.size === 0) {
    let partyLedger: string | null = null
    if (integration.partyModel === 'STUDENT_LEDGER') {
      const studentMap = await db.tallyMapping.findFirst({
        where: {
          integrationId: integration.id,
          kind: 'STUDENT',
          localKey: payment.studentId,
          active: true,
        },
      })
      partyLedger =
        studentMap?.tallyLedgerName ??
        `${payment.student.firstName} ${payment.student.lastName} - ${payment.student.admissionNo}`
    }
    const credit =
      modeRule?.creditLedgerName ??
      defaultRule?.creditLedgerName ??
      partyLedger
    if (!credit && collapsed.size === 0) {
      return {
        ok: false as const,
        errorCode: TALLY_ERROR.LEDGER_MAPPING_MISSING,
        errorMessage: 'No credit ledger available for this receipt',
        payment,
      }
    }
    if (credit && remaining > 0) {
      collapsed.set(credit, (collapsed.get(credit) ?? 0) + remaining)
    } else if (credit && collapsed.size === 0) {
      collapsed.set(credit, payment.amountMinor)
    }
  }

  const paidAt = payment.paidAt ?? payment.createdAt
  const receiptNumber = payment.receipt?.number ?? payment.id
  const narrationTemplate =
    modeRule?.narrationTemplate ??
    defaultRule?.narrationTemplate ??
    'Fee receipt {{receiptNumber}} — {{studentName}} ({{admissionNo}})'
  const narration = narrationTemplate
    .replaceAll('{{receiptNumber}}', receiptNumber)
    .replaceAll(
      '{{studentName}}',
      `${payment.student.firstName} ${payment.student.lastName}`,
    )
    .replaceAll('{{admissionNo}}', payment.student.admissionNo)

  const voucherType = modeRule?.voucherType ?? defaultRule?.voucherType ?? 'Receipt'
  const lines = [
    { ledgerName: debitLedger, amount: rupees(payment.amountMinor), isDebit: true },
    ...[...collapsed.entries()].map(([ledgerName, amountMinor]) => ({
      ledgerName,
      amount: rupees(amountMinor),
      isDebit: false,
    })),
  ]

  const idempotencyKey = `${tenantId}:FEE_PAYMENT:${payment.id}:Receipt`

  return {
    ok: true as const,
    integration,
    payment,
    idempotencyKey,
    draft: {
      voucherType,
      date: yyyymmdd(paidAt),
      narration,
      partyLedgerName:
        integration.partyModel === 'STUDENT_LEDGER'
          ? `${payment.student.firstName} ${payment.student.lastName} - ${payment.student.admissionNo}`
          : null,
      lines,
      remoteReference: idempotencyKey,
    },
    preview: {
      voucherType,
      date: paidAt.toISOString().slice(0, 10),
      amountMinor: payment.amountMinor,
      receiptNumber,
      debitLedger,
      creditLines: [...collapsed.entries()].map(([ledgerName, amountMinor]) => ({
        ledgerName,
        amountMinor,
      })),
      narration,
      testMode: integration.testMode,
    },
  }
}

/**
 * Queue a fee payment for Tally posting. Never fails the payment itself.
 */
export async function queueFeePaymentForTally(tenantId: string, paymentId: string) {
  try {
    const built = await buildReceiptVoucherPayload(tenantId, paymentId)
    const db = tenantDb(tenantId)
    const integration = await db.tallyIntegration.findUnique({ where: { tenantId } })
    if (!integration?.enabled || !integration.autoSyncReceipts) return null

    if (!built.ok) {
      await db.tallyVoucherLink.upsert({
        where: {
          tenantId_entityKind_entityId: {
            tenantId,
            entityKind: 'FEE_PAYMENT',
            entityId: paymentId,
          },
        },
        create: {
          tenantId,
          integrationId: integration.id,
          entityKind: 'FEE_PAYMENT',
          entityId: paymentId,
          idempotencyKey: `${tenantId}:FEE_PAYMENT:${paymentId}:Receipt`,
          status: 'REQUIRES_REVIEW',
          lastError: built.errorMessage,
          lastErrorCode: built.errorCode,
          amountMinor: built.payment?.amountMinor,
        },
        update: {
          status: 'REQUIRES_REVIEW',
          lastError: built.errorMessage,
          lastErrorCode: built.errorCode,
        },
      })
      return null
    }

    const link = await db.tallyVoucherLink.upsert({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey: built.idempotencyKey,
        },
      },
      create: {
        tenantId,
        integrationId: built.integration.id,
        entityKind: 'FEE_PAYMENT',
        entityId: paymentId,
        idempotencyKey: built.idempotencyKey,
        status: integration.testMode ? 'SKIPPED' : 'PENDING',
        voucherType: built.draft.voucherType,
        amountMinor: built.payment.amountMinor,
        voucherDate: built.payment.paidAt ?? built.payment.createdAt,
        previewJson: built.preview,
        lastError: integration.testMode ? tallyErrorMessage(TALLY_ERROR.TEST_MODE) : null,
        lastErrorCode: integration.testMode ? TALLY_ERROR.TEST_MODE : null,
      },
      update: {
        // Never recreate if already synced
        ...(await shouldUpdateLink(db, built.idempotencyKey)
          ? {
              status: integration.testMode ? 'SKIPPED' : 'PENDING',
              previewJson: built.preview,
              lastError: integration.testMode ? tallyErrorMessage(TALLY_ERROR.TEST_MODE) : null,
            }
          : {}),
      },
    })

    if (link.status === 'SYNCED') return link
    if (integration.testMode) return link

    await enqueueTallyCommandSystem({
      tenantId,
      type: 'CREATE_RECEIPT_VOUCHER',
      idempotencyKey: built.idempotencyKey,
      payload: {
        entityKind: 'FEE_PAYMENT',
        entityId: paymentId,
        companyName: integration.companyName,
        voucher: built.draft,
        preview: built.preview,
      },
    })

    return link
  } catch (err) {
    console.error('[tally] queueFeePaymentForTally failed', { tenantId, paymentId, err })
    return null
  }
}

async function shouldUpdateLink(
  db: ReturnType<typeof tenantDb>,
  idempotencyKey: string,
) {
  const existing = await db.tallyVoucherLink.findFirst({
    where: { idempotencyKey },
    select: { status: true },
  })
  return !existing || existing.status !== 'SYNCED'
}

export async function syncPaymentToTally(ctx: AppContext, paymentId: string) {
  ctx.require('fees.tally_manage')
  const integration = await getOrCreateIntegration(ctx)
  if (!integration.enabled) throw badRequest('Enable Tally integration first')
  if (integration.testMode) {
    throw badRequest(tallyErrorMessage(TALLY_ERROR.TEST_MODE))
  }

  const built = await buildReceiptVoucherPayload(ctx.tenant.id, paymentId)
  if (!built.ok) throw badRequest(built.errorMessage ?? 'Cannot build voucher')

  const existing = await ctx.db.tallyVoucherLink.findFirst({
    where: { idempotencyKey: built.idempotencyKey },
  })
  if (existing?.status === 'SYNCED') {
    return {
      status: 'SYNCED' as const,
      tallyVoucherNumber: existing.tallyVoucherNumber,
      message: tallyErrorMessage(TALLY_ERROR.DUPLICATE_TRANSACTION),
    }
  }

  await ctx.db.tallyVoucherLink.upsert({
    where: {
      tenantId_idempotencyKey: {
        tenantId: ctx.tenant.id,
        idempotencyKey: built.idempotencyKey,
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      integrationId: integration.id,
      entityKind: 'FEE_PAYMENT',
      entityId: paymentId,
      idempotencyKey: built.idempotencyKey,
      status: 'PENDING',
      voucherType: built.draft.voucherType,
      amountMinor: built.payment.amountMinor,
      voucherDate: built.payment.paidAt ?? built.payment.createdAt,
      previewJson: built.preview,
    },
    update: {
      status: 'PENDING',
      previewJson: built.preview,
      lastError: null,
      lastErrorCode: null,
    },
  })

  const command = await enqueueTallyCommand(ctx, {
    type: 'CREATE_RECEIPT_VOUCHER',
    idempotencyKey: built.idempotencyKey,
    payload: {
      entityKind: 'FEE_PAYMENT',
      entityId: paymentId,
      companyName: integration.companyName,
      voucher: built.draft,
      preview: built.preview,
    },
  })

  await auditTally(ctx, {
    action: 'tally.receipt.sync',
    entityType: 'FeePayment',
    entityId: paymentId,
    summary: `Queued receipt sync for payment ${paymentId}`,
  })

  return { status: 'PENDING' as const, commandId: command.id, preview: built.preview }
}

export async function getVoucherLinkForPayment(ctx: AppContext, paymentId: string) {
  if (!ctx.canAny('fees.tally', 'fees.view', 'fees.collect')) ctx.require('fees.tally')
  return ctx.db.tallyVoucherLink.findFirst({
    where: { entityKind: 'FEE_PAYMENT', entityId: paymentId },
  })
}

export async function listVoucherLinks(
  ctx: AppContext,
  filter?: { status?: string; take?: number },
) {
  if (!ctx.canAny('fees.tally', 'fees.tally_manage')) ctx.require('fees.tally')
  return ctx.db.tallyVoucherLink.findMany({
    where: filter?.status
      ? { status: filter.status as 'PENDING' }
      : undefined,
    orderBy: { updatedAt: 'desc' },
    take: filter?.take ?? 50,
  })
}

export async function retryFailedSyncs(ctx: AppContext) {
  ctx.require('fees.tally_manage')
  const integration = await getOrCreateIntegration(ctx)
  if (integration.testMode) throw badRequest(tallyErrorMessage(TALLY_ERROR.TEST_MODE))

  const failed = await ctx.db.tallyVoucherLink.findMany({
    where: { status: { in: ['FAILED', 'REQUIRES_REVIEW', 'RETRYING'] }, entityKind: 'FEE_PAYMENT' },
    take: 100,
  })
  let queued = 0
  for (const link of failed) {
    await queueFeePaymentForTally(ctx.tenant.id, link.entityId)
    queued++
  }
  return { queued }
}

export async function getPaymentOrThrow(ctx: AppContext, paymentId: string) {
  const payment = await ctx.db.feePayment.findFirst({ where: { id: paymentId } })
  if (!payment) throw notFound('Payment not found')
  return payment
}

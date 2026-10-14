import { env } from '@/lib/env'
import { tenantDb } from '@/server/db/tenant-client'
import { audit } from '@/server/audit'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { receiptLinkKey, verifyReceiptToken } from './pure'

export type LinkedReceipt = {
  number: string
  paidAt: Date
  amountMinor: number
  currency: string
  mode: string
  reference: string | null
  studentName: string
  admissionNo: string
  classLabel: string | null
  lines: { title: string; invoice: string; amountMinor: number }[]
  advanceMinor: number
  expiresAt: Date
}

export type LinkResult = { ok: true; receipt: LinkedReceipt } | { ok: false; reason: 'invalid' | 'expired' | 'unavailable' }

/**
 * Opens a receipt from a WhatsApp link without signing in.
 *
 * The token must be signed for this school, unexpired, and point at a receipt
 * whose payment is still settled - a reversed, refunded or bounced payment's
 * link stops working. Only what is printed on the receipt is returned: no
 * outstanding balance, staff names or contact details. Every open is logged.
 */
export async function openReceiptLink(tenantId: string, token: string, now = new Date()): Promise<LinkResult> {
  const check = verifyReceiptToken(token, tenantId, receiptLinkKey(env().AUTH_SECRET), now)
  if (!check.ok) return { ok: false, reason: check.reason === 'expired' ? 'expired' : 'invalid' }

  const db = tenantDb(tenantId)
  const flags = await getAccountingFlags(db)
  if (!flags.whatsappReceipts) return { ok: false, reason: 'unavailable' }

  const receipt = await db.feeReceipt.findFirst({
    where: { id: check.receiptId },
    select: {
      id: true,
      number: true,
      issuedOn: true,
      payment: {
        select: {
          status: true,
          amountMinor: true,
          currency: true,
          mode: true,
          reference: true,
          paidAt: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
              admissionNo: true,
              enrollments: { where: { isCurrent: true }, take: 1, select: { classLevel: { select: { name: true } }, section: { select: { name: true } } } },
            },
          },
          allocations: { select: { amountMinor: true, invoice: { select: { number: true, title: true } } } },
        },
      },
    },
  })
  if (!receipt || receipt.payment.status !== 'SUCCESS') return { ok: false, reason: 'unavailable' }

  const p = receipt.payment
  const allocated = p.allocations.reduce((sum, a) => sum + a.amountMinor, 0)
  const enrollment = p.student.enrollments[0]

  await audit({
    tenantId,
    actorLabel: 'Receipt link',
    action: 'fee_receipt.link_opened',
    module: 'fees',
    entityType: 'FeeReceipt',
    entityId: receipt.id,
    summary: `Receipt ${receipt.number} opened from a WhatsApp link`,
  })

  return {
    ok: true,
    receipt: {
      number: receipt.number,
      paidAt: p.paidAt ?? receipt.issuedOn,
      amountMinor: p.amountMinor,
      currency: p.currency,
      mode: p.mode,
      reference: p.reference,
      studentName: `${p.student.firstName} ${p.student.lastName}`,
      admissionNo: p.student.admissionNo,
      classLabel: enrollment ? `${enrollment.classLevel.name} ${enrollment.section.name}` : null,
      lines: p.allocations.map((a) => ({ title: a.invoice.title, invoice: a.invoice.number, amountMinor: a.amountMinor })),
      advanceMinor: Math.max(0, p.amountMinor - allocated),
      expiresAt: check.expiresAt,
    },
  }
}

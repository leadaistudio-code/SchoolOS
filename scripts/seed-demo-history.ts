/**
 * Gives a school's current students fee history for earlier academic sessions,
 * so year-wise ledgers and "past year outstanding" have something to show:
 *
 *   npx tsx scripts/seed-demo-history.ts --tenant demo            # local database
 *   npx tsx scripts/seed-demo-history.ts --tenant demo --confirm  # any other database
 *
 * Creates the 2023-24 and 2024-25 sessions, two term invoices per session for
 * every student old enough to have been in school then (current class 3+ for
 * 2023-24, class 2+ for 2024-25), and back-dated counter receipts. Most terms
 * are paid; a few are left part-paid or unpaid as old dues.
 *
 * Receipts are written the way the counter writes them (payment, receipt
 * number, allocation, invoice balance) but without parent notifications or
 * WhatsApp receipts. They reach the books through the normal ledger sync, which
 * `scripts/seed-accounting-demo.ts` runs at the end.
 *
 * Re-running is safe: invoices and receipts carry fixed keys and are skipped
 * when they already exist.
 */
import { PrismaClient } from '@prisma/client'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

type Term = { key: 'T1' | 'T2'; title: string; issued: string; due: string; lines: { code: string; label: string; rupees: number }[] }
type SessionDef = { name: string; startsOn: string; endsOn: string; minClass: number; terms: Term[]; unpaid: number; partial: number }

const SESSIONS: SessionDef[] = [
  {
    name: '2023-24', startsOn: '2023-04-01', endsOn: '2024-03-31', minClass: 3, unpaid: 0.05, partial: 0.05,
    terms: [
      { key: 'T1', title: 'Term 1 - 2023-24', issued: '2023-04-01', due: '2023-04-15', lines: [
        { code: 'TUI', label: 'Tuition Fee', rupees: 10200 }, { code: 'EXM', label: 'Examination Fee', rupees: 1300 },
        { code: 'LIB', label: 'Library Fee', rupees: 700 }, { code: 'ACT', label: 'Activity Fee', rupees: 1000 },
      ] },
      { key: 'T2', title: 'Term 2 - 2023-24', issued: '2023-10-01', due: '2023-10-15', lines: [
        { code: 'TUI', label: 'Tuition Fee', rupees: 10200 }, { code: 'EXM', label: 'Examination Fee', rupees: 1300 },
      ] },
    ],
  },
  {
    name: '2024-25', startsOn: '2024-04-01', endsOn: '2025-03-31', minClass: 2, unpaid: 0.08, partial: 0.08,
    terms: [
      { key: 'T1', title: 'Term 1 - 2024-25', issued: '2024-04-01', due: '2024-04-15', lines: [
        { code: 'TUI', label: 'Tuition Fee', rupees: 11000 }, { code: 'EXM', label: 'Examination Fee', rupees: 1400 },
        { code: 'LIB', label: 'Library Fee', rupees: 750 }, { code: 'ACT', label: 'Activity Fee', rupees: 1100 },
      ] },
      { key: 'T2', title: 'Term 2 - 2024-25', issued: '2024-10-01', due: '2024-10-15', lines: [
        { code: 'TUI', label: 'Tuition Fee', rupees: 11000 }, { code: 'EXM', label: 'Examination Fee', rupees: 1400 },
      ] },
    ],
  },
]

/** Stable 0..1 from a string, so every run makes the same choices. */
function unit(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100000) / 100000
}
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const MODES = ['UPI', 'UPI', 'UPI', 'CASH', 'CASH', 'BANK_TRANSFER', 'BANK_TRANSFER', 'CARD'] as const

async function main() {
  const slug = arg('--tenant')
  if (!slug) throw new Error('Pass --tenant <school slug>, e.g. --tenant demo')
  const url = new URL(process.env.DATABASE_URL ?? '')
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  console.log(`database: ${url.hostname}:${url.port || '5432'}${url.pathname} (${local ? 'local' : 'REMOTE'})`)
  if (!local && !process.argv.includes('--confirm')) throw new Error('Remote database: re-run with --confirm')

  const { nextDocumentNumber, financialYearLabel } = await import('../src/server/numbering')
  const { deriveInvoiceStatus } = await import('../src/lib/money')
  const prisma = new PrismaClient({ transactionOptions: { timeout: 60_000, maxWait: 30_000 } })
  const counts = { sessions: 0, invoices: 0, receipts: 0, skipped: 0, openMinor: 0 }
  try {
    const tenant = await prisma.tenant.findFirst({ where: { slug }, select: { id: true, name: true } })
    if (!tenant) throw new Error(`No school with slug ${slug}`)
    const tenantId = tenant.id
    const collector = await prisma.user.findFirst({
      where: { tenantId, deletedAt: null, roles: { some: { role: { key: { in: ['ACCOUNTANT', 'SCHOOL_ADMIN'] } } } } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, firstName: true, lastName: true },
    })
    if (!collector) throw new Error(`${tenant.name} has no accountant or admin to record receipts as`)
    const heads = await prisma.feeHead.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, code: true } })
    const headId = (code: string) => heads.find((h) => h.code === code)?.id ?? null
    const enrolments = await prisma.enrollment.findMany({
      where: { tenantId, isCurrent: true, student: { deletedAt: null } },
      select: { studentId: true, classLevel: { select: { numeric: true } } },
    })
    console.log(`school: ${tenant.name}; ${enrolments.length} students; receipts recorded as ${collector.firstName} ${collector.lastName}`)

    for (const def of SESSIONS) {
      let session = await prisma.academicSession.findFirst({ where: { tenantId, name: def.name } })
      if (!session) {
        session = await prisma.academicSession.create({
          data: { tenantId, name: def.name, startsOn: new Date(`${def.startsOn}T00:00:00Z`), endsOn: new Date(`${def.endsOn}T00:00:00Z`), isCurrent: false },
        })
        counts.sessions++
      }
      const students = enrolments.filter((e) => e.classLevel.numeric >= def.minClass)
      const receiptsBefore = counts.receipts

      for (const s of students) {
        const r = unit(`${s.studentId}:${def.name}`)
        // Most pay both terms; some leave the second term (or part of it) unpaid.
        const t2Unpaid = r < def.unpaid
        const t2Partial = !t2Unpaid && r < def.unpaid + def.partial
        for (const term of def.terms) {
          const sourceKey = `history:${def.name}:${term.key}:${s.studentId}`
          let invoice = await prisma.feeInvoice.findFirst({ where: { tenantId, sourceKey } })
          if (!invoice) {
            const totalMinor = term.lines.reduce((t, l) => t + l.rupees * 100, 0)
            const issuedOn = new Date(`${term.issued}T00:00:00Z`)
            invoice = await prisma.$transaction(async (tx) => {
              const number = await nextDocumentNumber(tx, { tenantId, kind: 'INVOICE', sessionLabel: financialYearLabel(issuedOn) })
              return tx.feeInvoice.create({
                data: {
                  tenantId, number, studentId: s.studentId, sessionId: session!.id, sourceKey, title: term.title,
                  issuedOn, dueOn: new Date(`${term.due}T00:00:00Z`), status: 'ISSUED',
                  subtotalMinor: totalMinor, totalMinor, balanceMinor: totalMinor,
                  lines: { create: term.lines.map((l) => ({ tenantId, feeHeadId: headId(l.code), label: l.label, amountMinor: l.rupees * 100 })) },
                },
              })
            })
            counts.invoices++
          } else counts.skipped++

          const share = term.key === 'T2' && t2Unpaid ? 0 : term.key === 'T2' && t2Partial ? 0.4 + unit(`${s.studentId}:${def.name}:share`) * 0.2 : 1
          const amountMinor = Math.round((invoice.totalMinor * share) / 10000) * 10000
          const idempotencyKey = `history:${invoice.id}`
          if (amountMinor > 0 && !(await prisma.feePayment.findFirst({ where: { tenantId, idempotencyKey }, select: { id: true } }))) {
            const paidOn = addDays(term.issued, 2 + Math.floor(unit(`${s.studentId}:${term.title}:day`) * 40))
            const paidAt = new Date(`${paidOn}T00:00:00Z`)
            const mode = MODES[Math.floor(unit(`${s.studentId}:${term.title}:mode`) * MODES.length)]!
            await prisma.$transaction(async (tx) => {
              const current = await tx.feeInvoice.findUniqueOrThrow({ where: { id: invoice!.id } })
              const apply = Math.min(amountMinor, current.balanceMinor)
              if (apply <= 0) return
              const payment = await tx.feePayment.create({
                data: {
                  tenantId, studentId: s.studentId, amountMinor: apply, currency: 'INR', mode, status: 'SUCCESS', provider: 'manual',
                  reference: mode === 'CASH' ? null : `${mode === 'UPI' ? 'UPI' : mode === 'CARD' ? 'CARD' : 'NEFT'}${paidOn.replace(/-/g, '')}${Math.floor(unit(idempotencyKey) * 9000 + 1000)}`,
                  idempotencyKey, paidAt, collectedById: collector.id, createdAt: paidAt,
                },
              })
              const number = await nextDocumentNumber(tx, { tenantId, kind: 'RECEIPT', sessionLabel: financialYearLabel(paidAt) })
              await tx.feeReceipt.create({ data: { tenantId, number, paymentId: payment.id, issuedOn: paidAt } })
              await tx.feePaymentAllocation.create({ data: { tenantId, paymentId: payment.id, invoiceId: current.id, amountMinor: apply } })
              const paidMinor = current.paidMinor + apply
              await tx.feeInvoice.update({
                where: { id: current.id },
                data: { paidMinor, balanceMinor: current.totalMinor - paidMinor, status: deriveInvoiceStatus({ totalMinor: current.totalMinor, paidMinor, dueOn: current.dueOn }) },
              })
            })
            counts.receipts++
          } else if (amountMinor === 0 && invoice.status !== 'OVERDUE' && invoice.balanceMinor > 0) {
            await prisma.feeInvoice.update({
              where: { id: invoice.id },
              data: { status: deriveInvoiceStatus({ totalMinor: invoice.totalMinor, paidMinor: invoice.paidMinor, dueOn: invoice.dueOn }) },
            })
          }
        }
      }
      const open = await prisma.feeInvoice.aggregate({ where: { tenantId, sessionId: session.id, balanceMinor: { gt: 0 } }, _sum: { balanceMinor: true }, _count: true })
      console.log(`${def.name}: ${students.length} students; ${open._count} invoices still open, ₹${(open._sum.balanceMinor ?? 0) / 100} outstanding`)
      counts.openMinor += open._sum.balanceMinor ?? 0

      // The accounting demo books fee income for months before itemised receipts
      // as monthly summary journals. Summaries written before this run's
      // receipts would count the same money twice, so drop them; re-running
      // scripts/seed-accounting-demo.ts rebuilds them net of the receipts.
      if (counts.receipts > receiptsBefore) {
        const months: string[] = []
        for (let d = new Date(`${def.startsOn}T00:00:00Z`); d <= new Date(`${def.endsOn}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1)) {
          months.push(`DEMO-FEES-${d.toISOString().slice(0, 7)}`)
        }
        const stale = await prisma.journalEntry.deleteMany({
          where: { tenantId, sourceType: 'MANUAL', reference: { in: months } },
        })
        if (stale.count) console.log(`${def.name}: removed ${stale.count} fee summary journals that predate the itemised receipts`)
      }
    }
    console.log('created:', JSON.stringify(counts))
    console.log('next: npx tsx scripts/seed-accounting-demo.ts --tenant <slug> --from 2023-04 to post the receipts and rebuild the books')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

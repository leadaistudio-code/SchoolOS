/**
 * Little Pathshala, session 2026-27, Examination Fee (EXM):
 *  A. Play Group: remove the fee from the structure and cancel every exam charge.
 *     Money already paid against them is re-settled oldest-first against the
 *     student's other open dues; anything left over becomes advance credit.
 *  B. Nursery / LKG / UKG: the October 2026 exam charge moves to the March 2027
 *     installment (issued 1 Mar, due on the March installment's due date) and is
 *     renamed "Examination Fee — March 2027".
 *
 * The same code runs in both modes; a dry run rolls the transaction back.
 *
 * Usage:
 *   npx tsx scripts/_lp-exam-fee-fix.ts            # dry run
 *   npx tsx scripts/_lp-exam-fee-fix.ts --apply
 */
import { PrismaClient, type Prisma } from '@prisma/client'
import { allocatePayment, deriveInvoiceStatus } from '../src/lib/money'

const db = new PrismaClient()
const apply = process.argv.includes('--apply')

const TENANT_SLUG = 'littlepathshala'
const EXAM_CODE = 'EXM'
const PLAY_GROUP = { id: 'cmup0escp035vmo0f3go0pp26', name: 'Play Group Fee Structure (2026-27)' }
const MOVE = [
  { id: 'cmup0i8ph038lmo0fx9rqmcbm', name: 'Nursery Fee Structure (2026-27)' },
  { id: 'cmup0lsp503bdmo0f9ptwrqyu', name: 'LKG Fee Structure (2026-27)' },
  { id: 'cmup0niyu03d5mo0f6r22xf2w', name: 'UKG Fee Structure (2026-27)' },
]
const ACTOR = 'MyCampusView support (requested by school)'

class DryRun extends Error {}
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '-')
const rs = (m: number) => `₹${(m / 100).toLocaleString('en-IN')}`
const isMonth = (d: Date, y: number, m: number) => d.getUTCFullYear() === y && d.getUTCMonth() === m

type Tx = Prisma.TransactionClient

async function run(tx: Tx, tenantId: string, now: Date) {
  const head = await tx.feeHead.findFirstOrThrow({ where: { tenantId, code: EXAM_CODE, deletedAt: null } })
  const touchedPayments = new Set<string>()
  const audits: Prisma.AuditLogCreateManyInput[] = []
  const auditRow = (a: Omit<Prisma.AuditLogCreateManyInput, 'tenantId' | 'module' | 'actorLabel'>) =>
    audits.push({ tenantId, module: 'fees', actorLabel: ACTOR, ...a })

  /* ---------------------------------------------------- A. Play Group removal */
  const pg = await tx.feeStructure.findFirstOrThrow({ where: { id: PLAY_GROUP.id, tenantId } })
  if (pg.name !== PLAY_GROUP.name) throw new Error(`Unexpected structure name ${pg.name}`)

  const pgInvoices = await tx.feeInvoice.findMany({
    where: { tenantId, structureId: pg.id, status: { not: 'CANCELLED' }, lines: { some: { feeHeadId: head.id } } },
    include: {
      lines: true,
      allocations: { include: { payment: { include: { receipt: { select: { number: true } } } } } },
      refundAllocations: true,
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
    },
    orderBy: [{ dueOn: 'asc' }, { number: 'asc' }],
  })
  console.log(`\nA. Play Group: ${pgInvoices.length} examination charges to cancel`)

  const freed = new Map<string, { studentId: string; amount: number; receipt: string; student: string; from: string[] }>()
  let lateFees = 0
  for (const inv of pgInvoices) {
    if (inv.lines.some((l) => l.feeHeadId !== head.id)) throw new Error(`Invoice ${inv.number} has other fee heads`)
    if (inv.refundAllocations.length) throw new Error(`Invoice ${inv.number} has a refund against it`)
    if (inv.lateFeeMinor > 0) lateFees++
    for (const a of inv.allocations) {
      if (a.payment.status !== 'SUCCESS') throw new Error(`Payment ${a.paymentId} on ${inv.number} is ${a.payment.status}`)
      const f = freed.get(a.paymentId) ?? {
        studentId: inv.studentId,
        amount: 0,
        receipt: a.payment.receipt?.number ?? a.paymentId,
        student: `${inv.student.firstName} ${inv.student.lastName} (${inv.student.admissionNo})`,
        from: [],
      }
      f.amount += a.amountMinor
      f.from.push(inv.title)
      freed.set(a.paymentId, f)
    }
    await tx.feePaymentAllocation.deleteMany({ where: { invoiceId: inv.id } })
    await tx.feeInvoice.update({
      where: { id: inv.id },
      data: { paidMinor: 0, balanceMinor: inv.totalMinor, status: 'CANCELLED', cancelledAt: now },
    })
    console.log(`  cancel ${inv.number} ${inv.title} ${rs(inv.totalMinor)} paid ${rs(inv.paidMinor)}  ${inv.student.firstName} ${inv.student.lastName}`)
    auditRow({
      action: 'fee.invoice.cancel',
      entityType: 'FeeInvoice',
      entityId: inv.id,
      summary: `Cancelled ${inv.title} (${inv.number}) for ${inv.student.firstName} ${inv.student.lastName}: Examination Fee removed from Play Group`,
      before: { status: inv.status, paidMinor: inv.paidMinor, balanceMinor: inv.balanceMinor },
      after: { status: 'CANCELLED', paidMinor: 0, balanceMinor: inv.totalMinor },
    })
  }
  if (lateFees) console.log(`  note: ${lateFees} of these had a late fee, cancelled with the charge`)

  console.log(`\n  Re-settling ${freed.size} payments (${rs([...freed.values()].reduce((s, f) => s + f.amount, 0))}):`)
  for (const [paymentId, f] of freed) {
    const open = await tx.feeInvoice.findMany({
      where: { tenantId, studentId: f.studentId, balanceMinor: { gt: 0 }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
      orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
    })
    const { allocations, unallocatedMinor } = allocatePayment(f.amount, open.map((i) => ({ id: i.id, balanceMinor: i.balanceMinor })))
    const applied: string[] = []
    for (const a of allocations) {
      const inv = open.find((i) => i.id === a.id)!
      const paidMinor = inv.paidMinor + a.amountMinor
      await tx.feePaymentAllocation.upsert({
        where: { tenantId_paymentId_invoiceId: { tenantId, paymentId, invoiceId: inv.id } },
        create: { tenantId, paymentId, invoiceId: inv.id, amountMinor: a.amountMinor },
        update: { amountMinor: { increment: a.amountMinor } },
      })
      await tx.feeInvoice.update({
        where: { id: inv.id },
        data: {
          paidMinor,
          balanceMinor: inv.totalMinor - paidMinor,
          status: deriveInvoiceStatus({ totalMinor: inv.totalMinor, paidMinor, dueOn: inv.dueOn, now }),
        },
      })
      applied.push(`${inv.title} ${rs(a.amountMinor)}`)
    }
    if (unallocatedMinor > 0) {
      await tx.studentFeeCredit.create({
        data: {
          tenantId,
          studentId: f.studentId,
          type: 'CREDIT',
          amountMinor: unallocatedMinor,
          paymentId,
          reference: f.receipt,
          notes: 'Examination Fee removed from Play Group: available for future fees',
        },
      })
    }
    // Lets the daily ledger catch-up re-post this receipt against its new allocations.
    await tx.feePayment.update({ where: { id: paymentId }, data: { updatedAt: now } })
    touchedPayments.add(paymentId)
    console.log(`  ${f.receipt} ${f.student}: ${rs(f.amount)} -> ${applied.join(', ') || 'nothing open'}${unallocatedMinor ? `; advance credit ${rs(unallocatedMinor)}` : ''}`)
    auditRow({
      action: 'fee_payment.resettle',
      entityType: 'FeePayment',
      entityId: paymentId,
      summary: `Receipt ${f.receipt} for ${f.student}: ${rs(f.amount)} paid for ${f.from.join(', ')} moved to ${applied.join(', ') || 'no open dues'}${unallocatedMinor ? `; ${rs(unallocatedMinor)} kept as advance credit` : ''} (Examination Fee removed from Play Group)`,
      before: { from: f.from, amountMinor: f.amount },
      after: { applied, advanceMinor: unallocatedMinor },
    })
  }

  const pgLines = await tx.feeInstallmentLine.findMany({ where: { tenantId, feeHeadId: head.id, installment: { structureId: pg.id } }, include: { installment: true } })
  const overrides = await tx.studentFeeLineOverride.deleteMany({ where: { tenantId, installmentLineId: { in: pgLines.map((l) => l.id) } } })
  for (const l of pgLines) {
    await tx.feeInstallment.update({ where: { id: l.installmentId }, data: { amountMinor: { decrement: l.amountMinor } } })
  }
  await tx.feeInstallmentLine.deleteMany({ where: { id: { in: pgLines.map((l) => l.id) } } })
  const item = await tx.feeStructureItem.findFirstOrThrow({ where: { tenantId, structureId: pg.id, feeHeadId: head.id } })
  await tx.feeStructureItem.delete({ where: { id: item.id } })
  const assignments = await tx.studentFeeAssignment.findMany({ where: { tenantId, structureId: pg.id, autoFeeHeadIds: { has: head.id } } })
  for (const a of assignments) {
    await tx.studentFeeAssignment.update({ where: { id: a.id }, data: { autoFeeHeadIds: a.autoFeeHeadIds.filter((id) => id !== head.id) } })
  }
  console.log(`\n  Structure: removed Examination Fee item (${rs(item.amountMinor)} a year), ${pgLines.length} installment lines (${pgLines.map((l) => l.installment.name).join(', ')}), ${overrides.count} student overrides; ${assignments.length} assignments stop auto-billing it`)
  auditRow({
    action: 'fee_structure.update',
    entityType: 'FeeStructure',
    entityId: pg.id,
    summary: `Removed Examination Fee from ${pg.name}`,
    before: { examAmountMinor: item.amountMinor, installments: pgLines.map((l) => ({ name: l.installment.name, amountMinor: l.amountMinor })) },
    after: { examAmountMinor: 0 },
  })

  /* ------------------------------------------- B. Move October exam to March */
  console.log('\nB. Move October 2026 examination charge to March 2027')
  for (const s of MOVE) {
    const structure = await tx.feeStructure.findFirstOrThrow({ where: { id: s.id, tenantId } })
    if (structure.name !== s.name) throw new Error(`Unexpected structure name ${structure.name}`)
    const lines = await tx.feeInstallmentLine.findMany({ where: { tenantId, feeHeadId: head.id, installment: { structureId: s.id } }, include: { installment: true } })
    const oct = lines.find((l) => isMonth(l.installment.dueOn, 2026, 9))
    if (!oct) throw new Error(`${s.name}: no October 2026 exam line`)
    const march = await tx.feeInstallment.findMany({ where: { tenantId, structureId: s.id } })
    const mar = march.filter((i) => isMonth(i.dueOn, 2027, 2))
    if (mar.length !== 1) throw new Error(`${s.name}: expected one March 2027 installment, found ${mar.length}`)
    const target = mar[0]!
    if (lines.some((l) => l.installmentId === target.id)) throw new Error(`${s.name}: March 2027 already has an exam line`)

    await tx.feeInstallmentLine.update({ where: { id: oct.id }, data: { installmentId: target.id } })
    await tx.feeInstallment.update({ where: { id: oct.installmentId }, data: { amountMinor: { decrement: oct.amountMinor } } })
    await tx.feeInstallment.update({ where: { id: target.id }, data: { amountMinor: { increment: oct.amountMinor } } })

    const issuedOn = target.issueOn ?? new Date(Date.UTC(2027, 2, 1))
    const dueOn = target.dueOn
    const invoices = await tx.feeInvoice.findMany({
      where: { tenantId, sourceKey: { startsWith: `fee-line:${oct.id}:student:` }, status: { not: 'CANCELLED' } },
      include: { student: { select: { firstName: true, lastName: true } } },
    })
    const stray = await tx.feeInvoice.count({
      where: { tenantId, structureId: s.id, status: { not: 'CANCELLED' }, title: 'Examination Fee — October 2026', id: { notIn: invoices.map((i) => i.id) } },
    })
    if (stray) throw new Error(`${s.name}: ${stray} October exam invoices are not linked to the schedule`)
    let late = 0
    for (const inv of invoices) {
      if (inv.lateFeeMinor > 0) late++
      const title = inv.title.replace('October 2026', 'March 2027')
      const status = deriveInvoiceStatus({ totalMinor: inv.totalMinor, paidMinor: inv.paidMinor, dueOn, now })
      await tx.feeInvoice.update({ where: { id: inv.id }, data: { issuedOn, dueOn, title, status } })
    }
    console.log(`  ${s.name}: line moved "${oct.installment.name}" -> "${target.name}" (${rs(oct.amountMinor)}); ${invoices.length} charges now issued ${day(issuedOn)}, due ${day(dueOn)} (${invoices.filter((i) => i.paidMinor >= i.totalMinor).length} already paid stay paid)${late ? `; ${late} carry a late fee` : ''}`)
    auditRow({
      action: 'fee_structure.dates_update',
      entityType: 'FeeStructure',
      entityId: s.id,
      summary: `Moved Examination Fee from ${oct.installment.name} to ${target.name} in ${s.name}; ${invoices.length} charges re-dated to ${day(issuedOn)} and renamed`,
      before: { installment: oct.installment.name, issuedOn: '2026-10-01', dueOn: day(oct.installment.dueOn) },
      after: { installment: target.name, issuedOn: day(issuedOn), dueOn: day(dueOn), invoices: invoices.length },
    })
  }

  await tx.auditLog.createMany({ data: audits })
  return { touchedPayments: touchedPayments.size, audits: audits.length }
}

async function main() {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } })
  const tally = await db.tallyIntegration.findUnique({ where: { tenantId: tenant.id }, select: { enabled: true } })
  const books = await db.ledgerSettings.findUnique({ where: { tenantId: tenant.id }, select: { autoPostFees: true } })
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} for ${tenant.name}. Tally: ${tally?.enabled ? 'enabled' : 'off'}. Books auto-post fees: ${books ? books.autoPostFees : 'not opened'}`)
  const now = new Date()
  try {
    const result = await db.$transaction(
      async (tx) => {
        const r = await run(tx, tenant.id, now)
        if (!apply) throw new DryRun()
        return r
      },
      { isolationLevel: 'Serializable', timeout: 600_000, maxWait: 30_000 },
    )
    console.log(`\nApplied. ${result.touchedPayments} receipts re-settled, ${result.audits} audit entries written.`)
  } catch (err) {
    if (err instanceof DryRun) console.log('\nDry run: everything rolled back. Re-run with --apply to write.')
    else throw err
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())

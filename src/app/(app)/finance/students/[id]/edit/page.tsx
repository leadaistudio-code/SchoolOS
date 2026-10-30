import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getStudentFeeAccount } from '@/server/modules/finance/simplicity'
import { listFeeHeads } from '@/server/modules/finance/service'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatDay } from '@/lib/dates'
import { EditStudentFeesForm, type EditFeeHeadRow } from './edit-student-fees-form'

export const metadata = { title: 'Edit fees' }

export default async function EditStudentFeesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireContext('fees.accounts')
  if (!ctx.can('fees.concession') && !ctx.can('fees.invoice') && !ctx.can('fees.accounts')) {
    ctx.require('fees.accounts')
  }

  const [account, feeHeads, overrides] = await Promise.all([
    getStudentFeeAccount(ctx, id),
    listFeeHeads(ctx),
    ctx.db.studentFeeLineOverride.findMany({
      where: { studentId: id },
      select: { installmentLineId: true, amountMinor: true },
    }),
  ])

  const student = account.student
  const heads = buildEditRows(account, new Map(overrides.map((o) => [o.installmentLineId, o.amountMinor])))

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Edit Fee : ${student.firstName} ${student.lastName} (${student.admissionNo})`}
        breadcrumbs={[
          { label: 'Fees & Collections', href: '/finance' },
          { label: 'Ledger', href: '/finance/students' },
          {
            label: `${student.firstName} ${student.lastName}`,
            href: `/finance/students/${id}`,
          },
          { label: 'Edit fees' },
        ]}
        actions={
          <>
            <BackButton fallbackHref={`/finance/students/${id}`} />
            <Link
              href={`/finance/students/${id}`}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              View ledger
            </Link>
          </>
        }
      />

      <EditStudentFeesForm
        studentId={id}
        currency={ctx.tenant.currency}
        heads={heads}
        concessionStudents={[
          {
            id: student.id,
            label: `${student.firstName} ${student.lastName}`,
          },
        ]}
        feeHeads={feeHeads.map((head) => ({ id: head.id, name: head.name }))}
      />
    </div>
  )
}

function buildEditRows(
  account: Awaited<ReturnType<typeof getStudentFeeAccount>>,
  overrides: Map<string, number>,
): EditFeeHeadRow[] {
  const fromPlan = new Map<string, EditFeeHeadRow>()
  const enrollmentClassId = account.student.enrollments[0]?.classLevelId ?? null

  // Prefer the assignment that matches the student's current class; otherwise
  // keep the first. Merging every ACTIVE assignment was doubling 12 months → 24.
  const assignments = [...account.student.feeAssignments].sort((a, b) => {
    const aMatch = enrollmentClassId && a.structure.classLevelId === enrollmentClassId ? 0 : 1
    const bMatch = enrollmentClassId && b.structure.classLevelId === enrollmentClassId ? 0 : 1
    if (aMatch !== bMatch) return aMatch - bMatch
    return (a.structure.classLevelId ? 0 : 1) - (b.structure.classLevelId ? 0 : 1)
  })

  const seenHeadFromAssignment = new Set<string>()

  for (const assignment of assignments) {
    const classLinked = Boolean(assignment.structure.classLevelId)
    for (const item of assignment.structure.items) {
      const key = item.feeHeadId
      // One schedule per fee head — skip the same head from a second assignment.
      if (seenHeadFromAssignment.has(key)) continue
      seenHeadFromAssignment.add(key)

      const name = item.feeHead?.name ?? 'Fee'
      const installmentRows = dedupeInstallments(
        assignment.structure.installments.flatMap((installment) =>
          installment.lines
            .filter((line) => line.feeHeadId === item.feeHeadId)
            .map((line) => {
              const invoice = account.invoices.find(
                (row) => row.sourceKey?.startsWith(`fee-line:${line.id}:student:`),
              ) ?? account.invoices.find(
                (row) =>
                  monthKey(row.dueOn) === monthKey(installment.dueOn)
                  && row.lines.some((invoiceLine) => invoiceLine.feeHeadId === item.feeHeadId),
              )
              const override = overrides.get(line.id)
              return {
                ...invoiceDates(invoice),
                invoiceId: invoice?.id ?? null,
                installmentLineId: line.id,
                planAmountMinor: line.amountMinor,
                overridden: !invoice && override !== undefined,
                dueOn: installment.dueOn.toISOString(),
                label: formatDay(invoice?.dueOn ?? installment.dueOn, 'dd MMM yyyy'),
                amountMinor: invoice
                  ? sumInvoiceHead(invoice, item.feeHeadId)
                  : override ?? line.amountMinor,
                paidMinor: invoice ? sharePaid(invoice, item.feeHeadId) : 0,
              }
            }),
        ),
      )

      fromPlan.set(key, {
        key,
        feeHeadId: item.feeHeadId,
        name,
        classLinked,
        annualMinor: item.amountMinor,
        waiverMinor: 0,
        installments: installmentRows,
      })
    }
  }

  // Heads that appear only on invoices (ad-hoc / legacy), or fill missing months.
  for (const invoice of account.invoices) {
    for (const line of invoice.lines) {
      const key = line.feeHeadId ?? `label:${line.label}`
      if (fromPlan.has(key)) {
        const row = fromPlan.get(key)!
        row.waiverMinor += line.discountMinor
        const already = row.installments.some(
          (item) =>
            item.invoiceId === invoice.id
            || (item.invoiceId == null && monthKey(new Date(item.dueOn)) === monthKey(invoice.dueOn)),
        )
        if (!already) {
          row.installments.push({
            ...invoiceDates(invoice),
            invoiceId: invoice.id,
            dueOn: invoice.dueOn.toISOString(),
            label: formatDay(invoice.dueOn, 'dd MMM yyyy'),
            amountMinor: line.amountMinor,
            paidMinor: sharePaid(invoice, line.feeHeadId),
          })
        } else {
          // Prefer the real invoice row over a plan stub for the same month.
          row.installments = row.installments.map((item) => {
            if (
              item.invoiceId == null
              && monthKey(new Date(item.dueOn)) === monthKey(invoice.dueOn)
            ) {
              return {
                ...invoiceDates(invoice),
                invoiceId: invoice.id,
                dueOn: invoice.dueOn.toISOString(),
                label: formatDay(invoice.dueOn, 'dd MMM yyyy'),
                amountMinor: line.amountMinor,
                paidMinor: sharePaid(invoice, line.feeHeadId),
              }
            }
            return item
          })
        }
        continue
      }
      fromPlan.set(key, {
        key,
        feeHeadId: line.feeHeadId,
        name: line.feeHead?.name ?? line.label,
        classLinked: false,
        annualMinor: line.amountMinor,
        waiverMinor: line.discountMinor,
        installments: [
          {
            ...invoiceDates(invoice),
            invoiceId: invoice.id,
            dueOn: invoice.dueOn.toISOString(),
            label: formatDay(invoice.dueOn, 'dd MMM yyyy'),
            amountMinor: line.amountMinor,
            paidMinor: sharePaid(invoice, line.feeHeadId),
          },
        ],
      })
    }
  }

  for (const concession of account.concessions) {
    if (concession.feeHeadId && fromPlan.has(concession.feeHeadId)) {
      const row = fromPlan.get(concession.feeHeadId)!
      if (concession.kind === 'FLAT') row.waiverMinor += concession.value
    }
  }

  return [...fromPlan.values()]
    .map((row) => ({
      ...row,
      installments: dedupeInstallments(row.installments).sort(
        (a, b) => new Date(a.dueOn).getTime() - new Date(b.dueOn).getTime(),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function invoiceDates(invoice?: { number: string; issuedOn: Date; dueOn: Date }) {
  return invoice
    ? {
        invoiceNumber: invoice.number,
        issuedOn: invoice.issuedOn.toISOString(),
        invoiceDueOn: invoice.dueOn.toISOString(),
      }
    : {}
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function dedupeInstallments<
  T extends { invoiceId: string | null; dueOn: string; amountMinor: number },
>(rows: T[]): T[] {
  const byKey = new Map<string, T>()
  for (const row of rows) {
    const key = row.invoiceId
      ? `invoice:${row.invoiceId}`
      : `month:${monthKey(new Date(row.dueOn))}`
    const existing = byKey.get(key)
    // Prefer a row that already has an invoice id.
    if (!existing || (!existing.invoiceId && row.invoiceId)) {
      byKey.set(key, row)
    }
  }
  return [...byKey.values()]
}

function sumInvoiceHead(
  invoice: {
    lines: { feeHeadId: string | null; amountMinor: number }[]
  },
  feeHeadId: string,
) {
  return invoice.lines
    .filter((line) => line.feeHeadId === feeHeadId)
    .reduce((sum, line) => sum + line.amountMinor, 0)
}

function sharePaid(
  invoice: {
    paidMinor: number
    lines: { feeHeadId: string | null; amountMinor: number; discountMinor: number }[]
  },
  feeHeadId: string | null,
) {
  const nets = invoice.lines.map((line) => Math.max(0, line.amountMinor - line.discountMinor))
  const total = nets.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return 0
  let share = 0
  invoice.lines.forEach((line, index) => {
    if (line.feeHeadId === feeHeadId) {
      share += Math.round((invoice.paidMinor * nets[index]!) / total)
    }
  })
  return share
}

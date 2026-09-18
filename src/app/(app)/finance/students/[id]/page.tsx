import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getStudentFeeAccount } from '@/server/modules/finance/simplicity'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { EditableInvoiceAmounts } from '../invoice-amount-editor'
import { LedgerReceiptActions } from '../ledger-receipt-actions'

export const metadata = { title: 'Fee ledger' }

export default async function StudentFeeAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('fees.accounts')
  const account = await getStudentFeeAccount(ctx, id)
  const currency = ctx.tenant.currency
  const enrollment = account.student.enrollments[0]
  const parent = account.student.guardians[0]?.parent
  const canEditAmounts = ctx.can('fees.concession') || ctx.can('fees.invoice')
  const canCancelReceipt = ctx.can('fees.reverse')
  const canEditReceipt = ctx.can('fees.collect')
  const editableInvoices = account.invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    title: invoice.title,
    totalMinor: invoice.totalMinor,
    paidMinor: invoice.paidMinor,
    balanceMinor: invoice.balanceMinor,
    status: invoice.status,
  }))

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${account.student.firstName} ${account.student.lastName}`}
        description={[
          account.student.admissionNo,
          enrollment ? `${enrollment.classLevel.name}-${enrollment.section.name}` : null,
          parent ? `${parent.firstName} ${parent.lastName}` : null,
        ].filter(Boolean).join(' · ')}
        breadcrumbs={[
          { label: 'Fees & Collections', href: '/finance' },
          { label: 'Ledger', href: '/finance/students' },
          { label: `${account.student.firstName} ${account.student.lastName}` },
        ]}
        actions={
          ctx.can('fees.collect') ? (
            <Link className={buttonVariants({ size: 'sm' })} href={`/finance/collect?student=${id}`}>
              Collect fee
            </Link>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Original fee" value={formatMoney(account.summary.originalMinor, currency)} />
        <Metric label="Concession" value={formatMoney(account.summary.concessionMinor, currency)} />
        <Metric label="Paid" value={formatMoney(account.summary.paidMinor, currency)} />
        <Metric
          label="Outstanding"
          value={formatMoney(account.summary.outstandingMinor, currency)}
          emphasis={account.summary.overdueMinor > 0 ? 'danger' : undefined}
          sub={account.summary.overdueMinor > 0 ? `${formatMoney(account.summary.overdueMinor, currency)} overdue` : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Fee charges</CardTitle>
            <p className="text-sm text-ink-muted mt-0.5">
              {canEditAmounts
                ? 'Change any billed amount, then save with a short reason. Cannot go below money already paid on that invoice.'
                : 'Billed amounts for this student.'}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <EditableInvoiceAmounts
            invoices={editableInvoices}
            currency={currency}
            canEdit={canEditAmounts}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Reference</TH>
                  <TH>Description</TH>
                  <TH align="right">Debit</TH>
                  <TH align="right">Credit</TH>
                  <TH align="right">Balance</TH>
                  <TH align="right"><span className="sr-only">Actions</span></TH>
                </tr>
              </THead>
              <TBody>
                {account.ledger.map((entry) => (
                  <TR key={`${entry.type}-${entry.reference}`}>
                    <TD className="text-sm">{formatDay(entry.date, 'd MMM yyyy')}</TD>
                    <TD className="text-xs">{entry.type.toLowerCase().replace('_', ' ')}</TD>
                    <TD className="text-xs tnum">
                      {entry.type === 'PAYMENT' && entry.paymentId ? (
                        <Link
                          href={`/finance/payments/${entry.paymentId}`}
                          className="text-[var(--brand-600)] hover:underline"
                        >
                          {entry.reference}
                        </Link>
                      ) : (
                        entry.reference
                      )}
                    </TD>
                    <TD className="text-sm">{entry.description}</TD>
                    <TD align="right" className="tnum">{entry.debitMinor ? formatMoney(entry.debitMinor, currency) : '—'}</TD>
                    <TD align="right" className="tnum text-success">{entry.creditMinor ? formatMoney(entry.creditMinor, currency) : '—'}</TD>
                    <TD align="right" className="tnum font-medium">{formatMoney(entry.balanceMinor, currency)}</TD>
                    <TD align="right">
                      {entry.type === 'PAYMENT' && entry.paymentId && entry.mode ? (
                        <LedgerReceiptActions
                          canCancel={canCancelReceipt}
                          canEdit={canEditReceipt}
                          payment={{
                            paymentId: entry.paymentId,
                            provider: entry.provider ?? null,
                            status: entry.status ?? 'SUCCESS',
                            mode: entry.mode,
                            paidOn: entry.paidOn ?? null,
                            billBookNo: entry.billBookNo ?? null,
                            paymentReference: entry.paymentReference ?? null,
                            notes: entry.notes ?? null,
                          }}
                        />
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  )
}

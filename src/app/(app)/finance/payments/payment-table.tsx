'use client'

import Link from 'next/link'
import { FileDown } from 'lucide-react'
import { BulkSelectionBar, downloadCsv, useBulkSelection } from '@/components/bulk-selection'
import { Pagination } from '@/components/pagination'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'

type PaymentRow = {
  id: string
  receiptNumber: string | null
  reference: string | null
  billBookNo: string | null
  studentId: string
  studentName: string
  admissionNo: string
  mode: string
  provider: string | null
  paidAt: string | null
  createdAt: string
  amountMinor: number
  refundedMinor: number
  status: string
}

export function PaymentTable({
  rows,
  currency,
  total,
  page,
  pageSize,
  canExport,
}: {
  rows: PaymentRow[]
  currency: string
  total: number
  page: number
  pageSize: number
  canExport: boolean
}) {
  const selection = useBulkSelection(rows.map((row) => row.id))
  const selectedRows = rows.filter((row) => selection.selected.has(row.id))

  return (
    <>
      {canExport ? (
        <BulkSelectionBar count={selection.selected.size} noun="payment" onClear={selection.clear}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              downloadCsv(
                'payments.csv',
                ['Receipt', 'Student', 'Admission no.', 'Mode', 'Date', 'Amount', 'Refunded', 'Status', 'Currency'],
                selectedRows.map((payment) => [
                  payment.receiptNumber,
                  payment.studentName,
                  payment.admissionNo,
                  payment.mode,
                  formatDay(new Date(payment.paidAt ?? payment.createdAt), 'd MMM yyyy'),
                  payment.amountMinor / 100,
                  payment.refundedMinor / 100,
                  payment.status,
                  currency,
                ]),
              )
            }
          >
            <FileDown aria-hidden />
            Export
          </Button>
        </BulkSelectionBar>
      ) : null}
      <TableWrap>
        <Table>
          <THead>
            <tr>
              {canExport ? (
                <TH>
                  <Checkbox
                    aria-label="Select all payments"
                    checked={selection.allSelected}
                    onChange={selection.toggleAll}
                  />
                </TH>
              ) : null}
              <TH>Receipt</TH>
              <TH>Student</TH>
              <TH>Mode</TH>
              <TH>Date</TH>
              <TH align="right">Amount</TH>
              <TH>Status</TH>
              <TH align="right"><span className="sr-only">Actions</span></TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((payment) => (
              <TR key={payment.id}>
                {canExport ? (
                  <TD>
                    <Checkbox
                      aria-label={`Select payment ${payment.receiptNumber ?? payment.id}`}
                      checked={selection.selected.has(payment.id)}
                      onChange={() => selection.toggle(payment.id)}
                    />
                  </TD>
                ) : null}
                <TD className="text-sm tnum text-ink">
                  {payment.receiptNumber ?? <span className="text-ink-subtle">—</span>}
                  {payment.reference ? (
                    <span className="block text-xs text-ink-subtle">{payment.reference}</span>
                  ) : null}
                  {payment.billBookNo ? (
                    <span className="block text-xs text-ink-subtle">Bill book {payment.billBookNo}</span>
                  ) : null}
                </TD>
                <TD>
                  <Link
                    href={`/students/${payment.studentId}`}
                    className="text-sm text-ink hover:text-[var(--brand-600)]"
                  >
                    {payment.studentName}
                  </Link>
                  <span className="block text-xs text-ink-subtle tnum">{payment.admissionNo}</span>
                </TD>
                <TD className="text-sm text-ink-muted first-letter:uppercase">
                  {payment.mode.toLowerCase().replace('_', ' ')}
                  {payment.provider && payment.provider !== 'manual' ? (
                    <span className="block text-xs text-ink-subtle">{payment.provider}</span>
                  ) : null}
                </TD>
                <TD className="text-sm text-ink-muted">
                  {formatDay(new Date(payment.paidAt ?? payment.createdAt), 'd MMM yyyy')}
                </TD>
                <TD align="right" className="text-sm font-medium">
                  {formatMoney(payment.amountMinor, currency)}
                  {payment.refundedMinor > 0 ? (
                    <span className="block text-xs text-[var(--danger)]">
                      −{formatMoney(payment.refundedMinor, currency)} refunded
                    </span>
                  ) : null}
                </TD>
                <TD>
                  <StatusBadge
                    status={payment.status}
                    tone={payment.status === 'INITIATED' ? 'info' : undefined}
                  />
                </TD>
                <TD align="right">
                  <Link
                    href={`/finance/payments/${payment.id}`}
                    className="text-sm text-[var(--brand-600)] hover:underline"
                  >
                    Receipt
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination total={total} page={page} pageSize={pageSize} label="payments" />
    </>
  )
}

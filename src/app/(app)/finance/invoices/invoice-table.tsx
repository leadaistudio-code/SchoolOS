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
import { cn, formatMoney } from '@/lib/utils'

type InvoiceRow = {
  id: string
  title: string
  number: string
  studentName: string
  admissionNo: string
  className: string | null
  dueOn: string
  daysOverdue: number
  totalMinor: number
  balanceMinor: number
  status: string
}

export function InvoiceTable({
  rows,
  currency,
  total,
  page,
  pageSize,
  canExport,
}: {
  rows: InvoiceRow[]
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
        <BulkSelectionBar count={selection.selected.size} noun="invoice" onClear={selection.clear}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              downloadCsv(
                'invoices.csv',
                ['Invoice', 'Title', 'Student', 'Admission no.', 'Class', 'Due', 'Total', 'Balance', 'Status', 'Currency'],
                selectedRows.map((invoice) => [
                  invoice.number,
                  invoice.title,
                  invoice.studentName,
                  invoice.admissionNo,
                  invoice.className,
                  formatDay(new Date(invoice.dueOn), 'd MMM yyyy'),
                  invoice.totalMinor / 100,
                  invoice.balanceMinor / 100,
                  invoice.status,
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
                    aria-label="Select all invoices"
                    checked={selection.allSelected}
                    onChange={selection.toggleAll}
                  />
                </TH>
              ) : null}
              <TH>Invoice</TH>
              <TH>Student</TH>
              <TH>Due</TH>
              <TH align="right">Total</TH>
              <TH align="right">Balance</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((invoice) => (
              <TR key={invoice.id}>
                {canExport ? (
                  <TD>
                    <Checkbox
                      aria-label={`Select invoice ${invoice.number}`}
                      checked={selection.selected.has(invoice.id)}
                      onChange={() => selection.toggle(invoice.id)}
                    />
                  </TD>
                ) : null}
                <TD>
                  <Link
                    href={`/finance/invoices/${invoice.id}`}
                    className="text-sm text-ink hover:text-[var(--brand-600)]"
                  >
                    {invoice.title}
                  </Link>
                  <span className="block text-xs text-ink-subtle tnum">{invoice.number}</span>
                </TD>
                <TD>
                  <span className="block text-sm text-ink">{invoice.studentName}</span>
                  <span className="block text-xs text-ink-subtle">
                    {invoice.admissionNo}
                    {invoice.className ? ` · ${invoice.className}` : ''}
                  </span>
                </TD>
                <TD className="text-sm text-ink-muted">
                  {formatDay(new Date(invoice.dueOn), 'd MMM yyyy')}
                  {invoice.daysOverdue > 0 ? (
                    <span className="block text-xs text-[var(--danger)]">
                      {invoice.daysOverdue} days overdue
                    </span>
                  ) : null}
                </TD>
                <TD align="right" className="text-sm text-ink-muted">
                  {formatMoney(invoice.totalMinor, currency)}
                </TD>
                <TD align="right">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      invoice.balanceMinor > 0 ? 'text-ink' : 'text-ink-subtle',
                    )}
                  >
                    {invoice.balanceMinor > 0
                      ? formatMoney(invoice.balanceMinor, currency)
                      : '—'}
                  </span>
                </TD>
                <TD>
                  <StatusBadge status={invoice.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination total={total} page={page} pageSize={pageSize} label="invoices" />
    </>
  )
}

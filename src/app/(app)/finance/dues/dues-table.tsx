'use client'

import * as React from 'react'
import Link from 'next/link'
import { Bell, FileDown } from 'lucide-react'
import { sendFeeRemindersAction } from '../actions'
import { BulkSelectionBar, downloadCsv, useBulkSelection } from '@/components/bulk-selection'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/pagination'
import { buttonVariants } from '@/components/ui/button-variants'
import { useToast } from '@/components/ui/toast'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'

type DueRow = {
  studentId: string
  studentName: string
  admissionNo: string
  className: string | null
  oldestDueOn: Date | string
  daysOverdue: number
  balanceMinor: number
  invoiceCount: number
}

export function DuesTable({
  rows, total, page, pageSize, currency, canCollect, canRemind, canExport,
}: {
  rows: DueRow[]
  total: number
  page: number
  pageSize: number
  currency: string
  canCollect: boolean
  canRemind: boolean
  canExport: boolean
}) {
  const toast = useToast()
  const [confirm, setConfirm] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const studentIds = [...new Set(rows.map((row) => row.studentId))]
  const selection = useBulkSelection(studentIds)
  const selectedRows = rows.filter((row) => selection.selected.has(row.studentId))
  const canSelect = canRemind || canExport

  const send = () => startTransition(async () => {
    const result = await sendFeeRemindersAction({
      studentIds: selection.selectedIds,
      channels: ['IN_APP'],
    })
    if (!result.ok) {
      toast.push({ tone: 'error', title: 'Reminders not sent', description: result.message })
      return
    }
    toast.push({ tone: 'success', title: 'Reminders sent', description: result.message })
    setConfirm(false)
    selection.clear()
  })

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Student dues</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">
              One row per student · oldest due first
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {canSelect ? (
            <BulkSelectionBar
              count={selection.selected.size}
              noun="student"
              onClear={selection.clear}
            >
            {canExport ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadCsv(
                    'student-dues.csv',
                    ['Student', 'Admission no.', 'Class', 'Invoices', 'Oldest due', 'Days overdue', 'Balance', 'Currency'],
                    selectedRows.map((row) => [
                      row.studentName,
                      row.admissionNo,
                      row.className,
                      row.invoiceCount,
                      formatDay(new Date(row.oldestDueOn), 'd MMM yyyy'),
                      row.daysOverdue,
                      row.balanceMinor / 100,
                      currency,
                    ]),
                  )
                }
              >
                <FileDown aria-hidden /> Export
              </Button>
            ) : null}
            {canRemind ? (
              <Button size="sm" onClick={() => setConfirm(true)}>
                <Bell aria-hidden /> Send reminder
              </Button>
            ) : null}
            </BulkSelectionBar>
          ) : null}
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  {canSelect ? (
                    <TH>
                      <Checkbox
                        aria-label="Select all students on this page"
                        checked={selection.allSelected}
                        onChange={selection.toggleAll}
                      />
                    </TH>
                  ) : null}
                  <TH>Student</TH>
                  <TH>Class</TH>
                  <TH>Invoices</TH>
                  <TH>Oldest due</TH>
                  <TH>Overdue</TH>
                  <TH align="right">Total due</TH>
                  <TH><span className="sr-only">Action</span></TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.studentId}>
                    {canSelect ? (
                      <TD>
                        <Checkbox
                          aria-label={`Select ${row.studentName}`}
                          checked={selection.selected.has(row.studentId)}
                          onChange={() => selection.toggle(row.studentId)}
                        />
                      </TD>
                    ) : null}
                    <TD>
                      <Link className="text-sm font-medium text-ink hover:text-[var(--brand-600)]" href={`/finance/students/${row.studentId}`}>
                        {row.studentName}
                      </Link>
                      <p className="text-xs text-ink-subtle">
                        {row.admissionNo} · Open breakdown
                      </p>
                    </TD>
                    <TD className="text-sm">{row.className ?? '—'}</TD>
                    <TD className="text-sm tnum">
                      {row.invoiceCount} invoice{row.invoiceCount === 1 ? '' : 's'}
                    </TD>
                    <TD className="text-sm">{formatDay(new Date(row.oldestDueOn), 'd MMM yyyy')}</TD>
                    <TD>
                      {row.daysOverdue > 0 ? <Badge tone={row.daysOverdue > 30 ? 'danger' : 'warning'}>{row.daysOverdue} days</Badge> : <Badge>Upcoming</Badge>}
                    </TD>
                    <TD align="right" className="font-medium tnum">{formatMoney(row.balanceMinor, currency)}</TD>
                    <TD>
                      {canCollect ? <Link className={buttonVariants({ variant: 'secondary', size: 'sm' })} href={`/finance/collect?student=${row.studentId}`}>Collect</Link> : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          <Pagination total={total} page={page} pageSize={pageSize} label="students with dues" />
        </CardContent>
      </Card>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Send fee reminder?"
        description={`A fee-due notification will be sent to the linked parent accounts of ${selection.selected.size} student${selection.selected.size === 1 ? '' : 's'}. Nothing is sent until you confirm.`}
        footer={
          <>
            <Button loading={pending} onClick={send}>Confirm and send</Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          Message amounts are calculated from each student&apos;s current outstanding invoices.
        </p>
      </Dialog>
    </>
  )
}

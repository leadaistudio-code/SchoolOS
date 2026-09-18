'use client'

import * as React from 'react'
import Link from 'next/link'
import { Send } from 'lucide-react'
import { bulkPublishPayslipsAction } from '../actions'
import { PayslipDeductionButton, PayslipStatusControl } from '../[id]/panels'
import { BulkSelectionBar, useBulkSelection } from '@/components/bulk-selection'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'

type PayslipRow = {
  id: string
  staff: {
    id: string
    firstName: string
    lastName: string
    employeeCode: string
    department: string | null
  }
  paidDays: number
  workingDays: number
  grossMinor: number
  deductionsMinor: number
  lopMinor: number
  manualDeductionMinor: number
  manualDeductionReason: string | null
  netMinor: number
  status: string
  paidAt: string | null
}

const TONE: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'info',
  PAID: 'success',
}

export function PayrollTable({
  rows,
  canManage,
  currency,
  year,
  month,
  monthLabel,
}: {
  rows: PayslipRow[]
  canManage: boolean
  currency: string
  year: number
  month: number
  monthLabel: string
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const draftIds = rows.filter((row) => row.status === 'DRAFT').map((row) => row.id)
  const selection = useBulkSelection(draftIds)
  const selectedRows = rows.filter((row) => selection.selected.has(row.id))
  const selectedNet = selectedRows.reduce((sum, row) => sum + row.netMinor, 0)

  const publish = () => {
    const message = [
      `Publish ${selection.selected.size} draft payslip(s) for ${monthLabel} ${year}?`,
      `Combined net payroll: ${formatMoney(selectedNet, currency)}.`,
      'Published payslips can be unpublished back to draft if you need to correct them before marking paid.',
    ].join('\n\n')
    if (!window.confirm(message)) return

    startTransition(async () => {
      const result = await bulkPublishPayslipsAction({
        ids: selection.selectedIds,
        periodYear: year,
        periodMonth: month,
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Payslips published' : 'Some payslips were not published',
        description: result.message,
      })
      if (result.ok) selection.clear()
    })
  }

  return (
    <>
      {canManage ? (
        <BulkSelectionBar count={selection.selected.size} noun="draft payslip" onClear={selection.clear}>
          <span className="text-xs text-ink-muted">
            Net {formatMoney(selectedNet, currency)}
          </span>
          <Button size="sm" loading={pending} onClick={publish}>
            <Send aria-hidden />
            Publish selected
          </Button>
        </BulkSelectionBar>
      ) : null}
      <TableWrap>
        <Table>
          <THead>
            <tr>
              {canManage ? (
                <TH>
                  <Checkbox
                    aria-label="Select all draft payslips"
                    checked={selection.allSelected}
                    onChange={selection.toggleAll}
                    disabled={draftIds.length === 0}
                  />
                </TH>
              ) : null}
              <TH>Staff member</TH>
              <TH>Department</TH>
              <TH align="right">Days paid</TH>
              <TH align="right">Gross</TH>
              <TH align="right">Deductions</TH>
              <TH align="right">Net</TH>
              <TH>Status</TH>
              {canManage ? <TH align="right">&nbsp;</TH> : null}
            </tr>
          </THead>
          <TBody>
            {rows.map((payslip) => (
              <TR key={payslip.id}>
                {canManage ? (
                  <TD>
                    <Checkbox
                      aria-label={`Select payslip for ${payslip.staff.firstName} ${payslip.staff.lastName}`}
                      checked={selection.selected.has(payslip.id)}
                      onChange={() => selection.toggle(payslip.id)}
                      disabled={payslip.status !== 'DRAFT'}
                    />
                  </TD>
                ) : null}
                <TD>
                  <Link
                    href={`/staff/${payslip.staff.id}?tab=salary`}
                    className="block text-sm text-ink hover:underline"
                  >
                    {payslip.staff.firstName} {payslip.staff.lastName}
                  </Link>
                  <span className="block text-xs tnum text-ink-subtle">
                    {payslip.staff.employeeCode}
                  </span>
                </TD>
                <TD className="text-sm text-ink-muted">{payslip.staff.department ?? '—'}</TD>
                <TD align="right" className="text-sm">
                  {payslip.paidDays}/{payslip.workingDays}
                </TD>
                <TD align="right" className="text-sm">
                  {formatMoney(payslip.grossMinor, currency)}
                </TD>
                <TD align="right" className="text-sm">
                  <span className="block">
                    {formatMoney(payslip.deductionsMinor + payslip.lopMinor, currency)}
                  </span>
                  {payslip.lopMinor > 0 ? (
                    <span className="block text-xs text-warning">
                      Attendance {formatMoney(payslip.lopMinor, currency)}
                    </span>
                  ) : null}
                  {payslip.manualDeductionMinor > 0 ? (
                    <span className="block text-xs text-ink-subtle">
                      Manual {formatMoney(payslip.manualDeductionMinor, currency)}
                    </span>
                  ) : null}
                </TD>
                <TD align="right" className="text-sm font-medium text-ink">
                  {formatMoney(payslip.netMinor, currency)}
                </TD>
                <TD>
                  <Badge tone={TONE[payslip.status] ?? 'neutral'}>
                    {payslip.status.toLowerCase()}
                  </Badge>
                  {payslip.paidAt ? (
                    <span className="ml-1.5 text-xs tnum text-ink-subtle">
                      {formatDay(new Date(payslip.paidAt))}
                    </span>
                  ) : null}
                </TD>
                {canManage ? (
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1">
                      {payslip.status === 'DRAFT' ? (
                        <PayslipDeductionButton
                          id={payslip.id}
                          amountMinor={payslip.manualDeductionMinor}
                          reason={payslip.manualDeductionReason}
                        />
                      ) : null}
                      <PayslipStatusControl id={payslip.id} status={payslip.status} />
                    </div>
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </>
  )
}

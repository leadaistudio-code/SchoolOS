'use client'

import * as React from 'react'
import Link from 'next/link'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { FeeMonthPills, type FeeMonthPill } from './fee-month-pills'
import { FeeHeadLedgerTable, type FeeHeadLedgerRow } from './fee-head-ledger'
import { LedgerReceiptActions, type LedgerPaymentAction } from './ledger-receipt-actions'

type LedgerEntry = {
  date: Date | string
  type: string
  reference: string
  description: string
  debitMinor: number
  creditMinor: number
  balanceMinor: number
  paymentId?: string
  provider?: string | null
  status?: string
  mode?: string
  paidOn?: string | null
  billBookNo?: string | null
  paymentReference?: string | null
  notes?: string | null
}

export function StudentFeeLedgerView({
  currency,
  months,
  heads,
  ledger,
  canCancelReceipt,
  canEditReceipt,
}: {
  currency: string
  months: FeeMonthPill[]
  heads: FeeHeadLedgerRow[]
  ledger: LedgerEntry[]
  canCancelReceipt: boolean
  canEditReceipt: boolean
}) {
  const [monthKey, setMonthKey] = React.useState<string | null>(null)

  const filteredLedger = React.useMemo(() => {
    if (!monthKey) return ledger
    return ledger.filter((entry) => {
      const date = typeof entry.date === 'string' ? new Date(entry.date) : entry.date
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      return key === monthKey
    })
  }, [ledger, monthKey])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Monthly status</CardTitle>
            <p className="text-sm text-ink-muted mt-0.5">
              Tap a month to filter the detailed ledger. Green paid · amber due · red overdue · grey upcoming.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <FeeMonthPills months={months} selectedKey={monthKey} onSelect={setMonthKey} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Collection heads</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <FeeHeadLedgerTable heads={heads} currency={currency} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Detailed view</CardTitle>
            <p className="text-sm text-ink-muted mt-0.5">
              {monthKey
                ? `Showing ${monthKey} only — tap the month again to clear.`
                : 'Charges, collections and running balance.'}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Transaction Type</TH>
                  <TH align="right">Debit</TH>
                  <TH align="right">Credit</TH>
                  <TH align="right">Balance</TH>
                  <TH align="right">
                    <span className="sr-only">Action</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {filteredLedger.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="text-sm text-ink-muted text-center py-8">
                      No transactions in this month.
                    </TD>
                  </TR>
                ) : (
                  filteredLedger.map((entry) => {
                    const payment: LedgerPaymentAction | null =
                      entry.type === 'PAYMENT' && entry.paymentId && entry.mode
                        ? {
                            paymentId: entry.paymentId,
                            provider: entry.provider ?? null,
                            status: entry.status ?? 'SUCCESS',
                            mode: entry.mode,
                            paidOn: entry.paidOn ?? null,
                            billBookNo: entry.billBookNo ?? null,
                            paymentReference: entry.paymentReference ?? null,
                            notes: entry.notes ?? null,
                          }
                        : null
                    return (
                      <TR key={`${entry.type}-${entry.reference}-${String(entry.date)}`}>
                        <TD className="text-sm whitespace-nowrap">
                          {formatDay(
                            typeof entry.date === 'string' ? new Date(entry.date) : entry.date,
                            'd-MMM-yyyy',
                          )}
                        </TD>
                        <TD className="text-sm">
                          {entry.type === 'PAYMENT' && entry.paymentId ? (
                            <Link
                              href={`/finance/payments/${entry.paymentId}`}
                              className="text-[var(--brand-600)] hover:underline"
                            >
                              {entry.description}
                            </Link>
                          ) : (
                            entry.description
                          )}
                        </TD>
                        <TD align="right" className="tnum">
                          {entry.debitMinor ? formatMoney(entry.debitMinor, currency) : '—'}
                        </TD>
                        <TD align="right" className="tnum text-success">
                          {entry.creditMinor ? formatMoney(entry.creditMinor, currency) : '—'}
                        </TD>
                        <TD align="right" className="tnum font-medium">
                          {formatMoney(entry.balanceMinor, currency)}
                        </TD>
                        <TD align="right">
                          {payment ? (
                            <LedgerReceiptActions
                              canCancel={canCancelReceipt}
                              canEdit={canEditReceipt}
                              payment={payment}
                            />
                          ) : null}
                        </TD>
                      </TR>
                    )
                  })
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  )
}

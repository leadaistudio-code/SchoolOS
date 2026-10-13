'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export type FeeHeadLedgerRow = {
  key: string
  feeHeadId: string | null
  name: string
  classLinked: boolean
  totalFeesMinor: number
  amountRequestedMinor: number
  collectionMinor: number
  discountMinor: number
  balanceMinor: number
}

function moneyOrDash(minor: number, currency: string) {
  if (!minor) return '—'
  return formatMoney(minor, currency)
}

export function FeeHeadLedgerTable({
  heads,
  currency,
}: {
  heads: FeeHeadLedgerRow[]
  currency: string
}) {
  const [open, setOpen] = React.useState<Record<string, boolean>>({})

  const totals = heads.reduce(
    (acc, head) => ({
      totalFeesMinor: acc.totalFeesMinor + head.totalFeesMinor,
      amountRequestedMinor: acc.amountRequestedMinor + head.amountRequestedMinor,
      collectionMinor: acc.collectionMinor + head.collectionMinor,
      discountMinor: acc.discountMinor + head.discountMinor,
      balanceMinor: acc.balanceMinor + head.balanceMinor,
    }),
    {
      totalFeesMinor: 0,
      amountRequestedMinor: 0,
      collectionMinor: 0,
      discountMinor: 0,
      balanceMinor: 0,
    },
  )

  if (heads.length === 0) {
    return (
      <p className="px-4 py-8 text-sm text-ink-muted text-center">
        No fee heads on this account yet. Assign a fee structure or generate invoices.
      </p>
    )
  }

  return (
    <TableWrap>
      <Table>
        <THead>
          <tr>
            <TH>Collection Head</TH>
            <TH align="right">Total Fees</TH>
            <TH align="right">Amount Requested (Debit)</TH>
            <TH align="right">Collection (Credit)</TH>
            <TH align="right">Discount (Credit)</TH>
            <TH align="right">Balance (Against Requested)</TH>
          </tr>
        </THead>
        <TBody>
          {heads.map((head) => {
            const expanded = open[head.key]
            return (
              <React.Fragment key={head.key}>
                <TR>
                  <TD>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 text-left text-sm font-medium text-ink"
                      onClick={() =>
                        setOpen((current) => ({ ...current, [head.key]: !current[head.key] }))
                      }
                    >
                      <span className="grid size-5 place-items-center rounded-full bg-[var(--brand-50)] text-[var(--brand-600)]">
                        {expanded ? (
                          <ChevronDown className="size-3.5" aria-hidden />
                        ) : (
                          <ChevronRight className="size-3.5" aria-hidden />
                        )}
                      </span>
                      {head.name}
                    </button>
                  </TD>
                  <TD align="right" className="tnum">{formatMoney(head.totalFeesMinor, currency)}</TD>
                  <TD align="right" className="tnum">{formatMoney(head.amountRequestedMinor, currency)}</TD>
                  <TD align="right" className="tnum">{formatMoney(head.collectionMinor, currency)}</TD>
                  <TD align="right" className="tnum">{moneyOrDash(head.discountMinor, currency)}</TD>
                  <TD align="right" className="tnum font-medium">
                    <span className={head.balanceMinor > 0 ? 'text-[var(--danger)]' : 'text-success'}>
                      {formatMoney(head.balanceMinor, currency)}
                    </span>
                  </TD>
                </TR>
                {expanded ? (
                  <TR>
                    <TD colSpan={6} className="bg-surface-2 text-xs text-ink-muted">
                      {head.classLinked ? 'Class-linked fee' : 'Non class linked fee'}
                      {' · '}
                      Requested {formatMoney(head.amountRequestedMinor, currency)}
                      {' − '}
                      collected {formatMoney(head.collectionMinor, currency)}
                      {head.discountMinor > 0
                        ? ` − discount ${formatMoney(head.discountMinor, currency)}`
                        : ''}
                      {' = '}
                      balance {formatMoney(head.balanceMinor, currency)}
                    </TD>
                  </TR>
                ) : null}
              </React.Fragment>
            )
          })}
          <TR className="bg-warning-bg/40">
            <TD className="font-semibold text-ink">Total</TD>
            <TD align="right" className="tnum font-semibold">{formatMoney(totals.totalFeesMinor, currency)}</TD>
            <TD align="right" className="tnum font-semibold">{formatMoney(totals.amountRequestedMinor, currency)}</TD>
            <TD align="right" className="tnum font-semibold">{formatMoney(totals.collectionMinor, currency)}</TD>
            <TD align="right" className="tnum font-semibold">{formatMoney(totals.discountMinor, currency)}</TD>
            <TD align="right" className="tnum font-semibold">{formatMoney(totals.balanceMinor, currency)}</TD>
          </TR>
        </TBody>
      </Table>
    </TableWrap>
  )
}

'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { setInvoiceChargeAmountAction } from '../actions'
import { formatMoney } from '@/lib/utils'

export type EditableInvoice = {
  id: string
  number: string
  title: string
  totalMinor: number
  paidMinor: number
  balanceMinor: number
  status: string
}

/**
 * Lets office staff set any billed amount on an invoice (≥ money already paid).
 * Used on the fee ledger and collect screens for correcting imported / wrong dues.
 */
export function EditableInvoiceAmounts({
  invoices,
  currency,
  canEdit,
  onSaved,
}: {
  invoices: EditableInvoice[]
  currency: string
  canEdit: boolean
  onSaved?: () => void
}) {
  const toast = useToast()
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(invoices.map((invoice) => [invoice.id, String(invoice.totalMinor / 100)])),
  )
  const [reasons, setReasons] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    setDrafts(Object.fromEntries(invoices.map((invoice) => [invoice.id, String(invoice.totalMinor / 100)])))
  }, [invoices])

  if (invoices.length === 0) {
    return <p className="text-sm text-ink-subtle">No fee charges on this account yet.</p>
  }

  const save = (invoice: EditableInvoice) => {
    const amount = Number(drafts[invoice.id])
    if (!Number.isFinite(amount) || amount < 0) {
      toast.push({ tone: 'error', title: 'Enter a valid amount' })
      return
    }
    const reason = (reasons[invoice.id] ?? '').trim()
    if (reason.length < 3) {
      toast.push({
        tone: 'error',
        title: 'Reason required',
        description: 'Enter a short note explaining why the amount is changing.',
      })
      return
    }
    if (Math.round(amount * 100) === invoice.totalMinor) {
      toast.push({ tone: 'error', title: 'Amount is unchanged' })
      return
    }

    setPendingId(invoice.id)
    void (async () => {
      const result = await setInvoiceChargeAmountAction({
        invoiceId: invoice.id,
        amount,
        reason,
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Amount updated' : 'Could not update',
        description: result.message,
      })
      setPendingId(null)
      if (result.ok) {
        setReasons((prev) => ({ ...prev, [invoice.id]: '' }))
        onSaved?.()
      }
    })()
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {invoices.map((invoice) => {
        const dirty = Math.round(Number(drafts[invoice.id] || 0) * 100) !== invoice.totalMinor
        return (
          <li key={invoice.id} className="space-y-2 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink truncate">{invoice.title}</p>
                <p className="text-xs text-ink-subtle tnum">
                  {invoice.number}
                  {invoice.paidMinor > 0
                    ? ` · paid ${formatMoney(invoice.paidMinor, currency)}`
                    : ''}
                  {invoice.balanceMinor > 0
                    ? ` · due ${formatMoney(invoice.balanceMinor, currency)}`
                    : ' · settled'}
                </p>
              </div>
              {!canEdit ? (
                <span className="text-sm font-medium tnum shrink-0">
                  {formatMoney(invoice.totalMinor, currency)}
                </span>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-ink-subtle">₹</span>
                  <Input
                    className="w-28 text-right tnum"
                    inputMode="decimal"
                    value={drafts[invoice.id] ?? ''}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [invoice.id]: e.target.value }))
                    }
                    aria-label={`Amount for ${invoice.title}`}
                  />
                </div>
              )}
            </div>
            {canEdit && dirty ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  className="flex-1"
                  placeholder="Reason for change"
                  value={reasons[invoice.id] ?? ''}
                  onChange={(e) =>
                    setReasons((prev) => ({ ...prev, [invoice.id]: e.target.value }))
                  }
                />
                <Button
                  size="sm"
                  loading={pendingId === invoice.id}
                  onClick={() => save(invoice)}
                >
                  Save amount
                </Button>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

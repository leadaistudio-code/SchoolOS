'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ReceiptText } from 'lucide-react'
import { editPaymentAction } from '../../../actions'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

const MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'NET_BANKING', label: 'Net banking' },
] as const

type Receipt = {
  paymentId: string
  receiptNumber: string
  amountMinor: number
  mode: string
  paidOn: string
  reference: string
  billBookNo: string
  notes: string
  collectedById: string
  hasRefund: boolean
  splitParts: number
  studentName: string
  admissionNo: string
  className: string
  guardianName: string
  allocations: { id: string; title: string; number: string; amountMinor: number }[]
  outstandingMinor: number
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="self-center text-xs text-ink-subtle">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </>
  )
}

export function ReceiptEditor({
  receipt,
  collectors,
  currency,
  schoolName,
  canChangeAmount,
}: {
  receipt: Receipt
  collectors: { id: string; name: string; code: string | null }[]
  currency: string
  schoolName: string
  canChangeAmount: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [amount, setAmount] = React.useState((receipt.amountMinor / 100).toString())
  const [mode, setMode] = React.useState(receipt.mode)
  const [paidOn, setPaidOn] = React.useState(receipt.paidOn)
  const [reference, setReference] = React.useState(receipt.reference)
  const [billBookNo, setBillBookNo] = React.useState(receipt.billBookNo)
  const [collectedById, setCollectedById] = React.useState(receipt.collectedById)
  const [notes, setNotes] = React.useState(receipt.notes)
  const [amountReason, setAmountReason] = React.useState('')

  const amountMinor = Math.round(Number(amount || 0) * 100)
  const amountChanged = Number.isFinite(amountMinor) && amountMinor !== receipt.amountMinor
  const amountLocked = !canChangeAmount || receipt.hasRefund
  const delta = amountMinor - receipt.amountMinor

  const save = () =>
    startTransition(async () => {
      const result = await editPaymentAction({
        paymentId: receipt.paymentId,
        mode,
        paidOn,
        reference,
        billBookNo,
        notes,
        ...(collectedById ? { collectedById } : {}),
        ...(amountChanged ? { amount: amountMinor / 100, amountReason } : {}),
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Receipt not updated', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Receipt updated', description: result.message })
      router.push(`/finance/payments/${receipt.paymentId}`)
      router.refresh()
    })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-card)]"
    >
      <div className="border-b border-dashed border-[var(--product-300)] bg-[var(--product-50)] px-6 py-2 text-xs font-medium text-[var(--product-700)]">
        Editing — the fields with a box can be changed
      </div>
      <div className="p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-[var(--radius)] bg-[var(--product-500)] text-white">
              <ReceiptText className="size-6" aria-hidden />
            </div>
            <div>
              <p className="text-xl font-semibold text-ink">Fee payment receipt</p>
              <p className="mt-0.5 text-xs text-ink-muted">{schoolName}</p>
            </div>
          </div>
        </div>

        <div className="mb-5 grid overflow-hidden rounded-[var(--radius)] border border-line sm:grid-cols-2">
          <div className="bg-[var(--product-50)] p-4">
            <p className="text-xs font-semibold text-ink-muted">Receipt number</p>
            <p className="mt-1 text-lg font-semibold text-ink tnum">{receipt.receiptNumber}</p>
            <label htmlFor="edit-paidOn" className="mt-3 block text-xs font-semibold text-ink-muted">
              Payment date
            </label>
            <Input
              id="edit-paidOn"
              type="date"
              className="mt-1 max-w-48"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              required
            />
          </div>
          <div className="p-4">
            <label htmlFor="edit-amount" className="block text-xs font-semibold text-ink-muted">
              Amount received ({currency})
            </label>
            <Input
              id="edit-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              className="mt-1 max-w-48 text-lg font-semibold tnum"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={amountLocked}
              required
            />
            {amountLocked ? (
              <p className="mt-1 text-xs text-ink-subtle">
                {receipt.hasRefund
                  ? 'A refund was issued against this receipt, so the amount is fixed.'
                  : 'Only users who can cancel receipts can change the amount.'}
              </p>
            ) : amountChanged ? (
              <p className="mt-1 text-xs text-warning">
                {delta > 0 ? 'Adds' : 'Removes'} {formatMoney(Math.abs(delta), currency)}. Dues are re-settled
                oldest first; any extra becomes advance credit.
              </p>
            ) : null}
            {receipt.splitParts > 1 ? (
              <p className="mt-1 text-xs text-ink-subtle">
                This is one part of a {receipt.splitParts}-mode split payment; only this part changes.
              </p>
            ) : null}
          </div>
        </div>

        {amountChanged && !amountLocked ? (
          <div className="mb-5">
            <label htmlFor="edit-reason" className="block text-xs font-semibold text-ink-muted">
              Reason for changing the amount
            </label>
            <Input
              id="edit-reason"
              className="mt-1"
              value={amountReason}
              onChange={(e) => setAmountReason(e.target.value)}
              placeholder="e.g. Typed 3,500 instead of 3,000"
              required
              minLength={3}
            />
          </div>
        ) : null}

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <section className="rounded-[var(--radius)] bg-surface-2 p-4">
            <p className="text-xs font-semibold text-ink-muted">Student details</p>
            <p className="mt-1.5 text-base font-semibold text-ink">{receipt.studentName}</p>
            <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-ink-subtle">Admission no.</dt>
              <dd className="font-medium text-ink tnum">{receipt.admissionNo}</dd>
              <dt className="text-ink-subtle">Class</dt>
              <dd className="font-medium text-ink">{receipt.className}</dd>
              <dt className="text-ink-subtle">Received from</dt>
              <dd className="font-medium text-ink">{receipt.guardianName}</dd>
            </dl>
          </section>
          <section className="rounded-[var(--radius)] bg-surface-2 p-4">
            <p className="text-xs font-semibold text-ink-muted">Payment details</p>
            <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2">
              <Row label="Collected by">
                <Select
                  aria-label="Collected by"
                  value={collectedById}
                  onChange={(e) => setCollectedById(e.target.value)}
                >
                  {!collectedById ? <option value="">—</option> : null}
                  {collectors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.code ? ` (${c.code})` : ''}
                    </option>
                  ))}
                </Select>
              </Row>
              <Row label="Payment mode">
                <Select aria-label="Payment mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Row>
              <Row label="Reference">
                <Input
                  aria-label="Reference or UTR"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UTR / cheque no."
                />
              </Row>
              <Row label="Bill book no.">
                <Input
                  aria-label="Bill book number"
                  value={billBookNo}
                  onChange={(e) => setBillBookNo(e.target.value)}
                  required
                />
              </Row>
            </dl>
          </section>
        </div>

        <div className="mb-5 overflow-hidden rounded-[var(--radius)] border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--product-50)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-muted">Fee description</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-muted">Invoice</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-ink-muted">Applied now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {receipt.allocations.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium text-ink">{a.title}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted tnum">{a.number}</td>
                  <td className="px-4 py-3 text-right tnum text-ink">{formatMoney(a.amountMinor, currency)}</td>
                </tr>
              ))}
              {receipt.allocations.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-xs text-ink-subtle">
                    Held as advance credit
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-2">
                <td className="px-4 py-3 font-semibold text-ink" colSpan={2}>
                  Total received
                </td>
                <td className="px-4 py-3 text-right text-lg font-semibold tnum text-ink">
                  {formatMoney(Number.isFinite(amountMinor) ? amountMinor : 0, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <label htmlFor="edit-notes" className="block text-xs font-semibold text-ink-muted">
          Payment note
        </label>
        <Textarea
          id="edit-notes"
          className="mt-1"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-6 py-3">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Discard
        </Button>
        <Button type="submit" loading={pending}>
          Save receipt
        </Button>
      </div>
    </form>
  )
}

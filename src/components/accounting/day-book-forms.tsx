'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { parseMoneyToMinor } from '@/server/modules/accounting/money'
import { callApi, FormDialog } from './payables-forms'

export type Option = { id: string; label: string }

export function DayBookExpenseDialog({ heads, cashAccounts, today, approvals = false }: { heads: Option[]; cashAccounts: Option[]; today: string; approvals?: boolean }) {
  return (
    <FormDialog
      title={approvals ? 'Submit expense for approval' : 'Record expense'}
      description={approvals
        ? 'Expense approval is on: this goes to validation and four approval stages, and is posted (Dr the expense head, Cr cash or bank) only at final approval.'
        : "Paid now: posts Dr the expense head, Cr the cash or bank ledger. Bills paid later go through a vendor's purchase voucher."}
      trigger={(open) => <Button size="sm" onClick={open}>{approvals ? 'Submit expense' : 'Record expense'}</Button>}
    >
      {(close, key) => <DayBookExpenseForm heads={heads} cashAccounts={cashAccounts} today={today} idempotencyKey={key} approvals={approvals} onDone={close} />}
    </FormDialog>
  )
}

function DayBookExpenseForm({
  heads,
  cashAccounts,
  today,
  idempotencyKey,
  approvals,
  onDone,
}: {
  heads: Option[]
  cashAccounts: Option[]
  today: string
  idempotencyKey: string
  approvals: boolean
  onDone: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState('CASH')

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    const f = new FormData(e.currentTarget)
    const amountMinor = parseMoneyToMinor(String(f.get('amount') ?? ''))
    if (!amountMinor) {
      setError('Enter the amount in rupees, with at most two decimals')
      return
    }
    setBusy(true)
    setError(null)
    const saved = await callApi('/api/v1/accounting/day-book/expenses', {
      method: 'POST',
      body: {
        title: String(f.get('title') ?? ''),
        headId: String(f.get('headId') ?? ''),
        amount: (amountMinor / 100).toFixed(2),
        expenseDate: String(f.get('expenseDate') ?? ''),
        paymentMode: mode,
        cashAccountId: String(f.get('cashAccountId') ?? '') || undefined,
        vendor: String(f.get('vendor') ?? '') || undefined,
        referenceNo: String(f.get('referenceNo') ?? '') || undefined,
        notes: String(f.get('notes') ?? '') || undefined,
        idempotencyKey,
      },
    })
    if (!saved.ok) {
      setBusy(false)
      setError(saved.message)
      return
    }
    const { voucherNumber, requestNumber, receiptUrl } = saved.data as { voucherNumber: string | null; requestNumber: string | null; receiptUrl: string }
    const file = f.get('receipt')
    if (file instanceof File && file.size > 0) {
      const form = new FormData()
      form.set('file', file)
      const uploaded = await callApi(receiptUrl, { method: 'POST', form })
      if (!uploaded.ok) {
        setBusy(false)
        setError(`${voucherNumber ?? requestNumber ?? 'The expense'} was saved, but the bill could not be attached: ${uploaded.message}. Attach it from the ${requestNumber ? 'approval request' : 'register'}.`)
        router.refresh()
        return
      }
    }
    setBusy(false)
    onDone()
    router.refresh()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Description" required htmlFor="db-title" className="sm:col-span-2">
          <Input id="db-title" name="title" required minLength={2} maxLength={120} />
        </Field>
        <Field label="Expense head" required htmlFor="db-head">
          <Select id="db-head" name="headId" required defaultValue="">
            <option value="" disabled>Choose a head</option>
            {heads.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
          </Select>
        </Field>
        <Field label="Amount (₹)" required htmlFor="db-amount">
          <Input id="db-amount" name="amount" inputMode="decimal" required />
        </Field>
        <Field label="Voucher date" required htmlFor="db-date">
          <Input id="db-date" name="expenseDate" type="date" required defaultValue={today} />
        </Field>
        <Field label="Payee / vendor" htmlFor="db-vendor">
          <Input id="db-vendor" name="vendor" maxLength={120} />
        </Field>
        <Field label="Payment mode" htmlFor="db-mode">
          <Select id="db-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="UPI">UPI</option>
          </Select>
        </Field>
        <Field label="Paid from" hint="Leave as default to use the ledger mapped to the payment mode" htmlFor="db-cash">
          <Select id="db-cash" name="cashAccountId" defaultValue="">
            <option value="">Default for the mode</option>
            {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Reference" required={mode !== 'CASH'} hint="Cheque number, UTR or UPI reference" htmlFor="db-ref">
          <Input id="db-ref" name="referenceNo" maxLength={60} required={mode !== 'CASH'} />
        </Field>
        <Field label="Bill / receipt" hint="PDF, JPG, PNG or WebP" htmlFor="db-receipt">
          <Input id="db-receipt" name="receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
        </Field>
      </div>
      <Field label="Remarks" htmlFor="db-notes"><Textarea id="db-notes" name="notes" rows={2} maxLength={500} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : approvals ? 'Submit for approval' : 'Record and post'}</Button>
      </div>
    </form>
  )
}

export function RepairPostingsButton({ from, to, count }: { from: string; to: string; count: number }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const repair = async () => {
    setBusy(true)
    setMessage(null)
    const result = await callApi('/api/v1/accounting/day-book/repair', { method: 'POST', body: { from, to } })
    setBusy(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    const { attempted, remaining } = result.data as { attempted: number; remaining: number }
    setMessage(remaining ? `Re-posted ${attempted}; ${remaining} still need attention.` : `Re-posted ${attempted}. All expenses now match.`)
    router.refresh()
  }
  return (
    <span className="inline-flex items-center gap-3">
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void repair()}>
        {busy ? 'Re-posting…' : `Re-post ${count} ${count === 1 ? 'expense' : 'expenses'}`}
      </Button>
      {message ? <span className="text-sm text-ink-muted">{message}</span> : null}
    </span>
  )
}

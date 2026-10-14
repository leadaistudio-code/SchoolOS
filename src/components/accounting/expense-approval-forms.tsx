'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { parseMoneyToMinor } from '@/server/modules/accounting/money'
import { callApi, FormDialog, useSubmit } from './payables-forms'

type Option = { id: string; label: string }

const ACTION_COPY: Record<string, { hint: string; remarks: 'required' | 'optional' | 'none' }> = {
  submit: { hint: 'Sends it to validation (stage 2). You cannot edit it while it is in approval unless it is returned to you.', remarks: 'optional' },
  approve: { hint: 'Signs this stage and passes it to the next. Each stage needs a different person.', remarks: 'optional' },
  return: { hint: 'Sends it back to the person who prepared it. Resubmitting starts again at validation and clears earlier sign-offs.', remarks: 'required' },
  reject: { hint: 'Closes it for good. Nothing is posted. The preparer would have to start a new expense.', remarks: 'required' },
  withdraw: { hint: 'Takes it out of approval. It stays on record as withdrawn.', remarks: 'optional' },
  reverse: { hint: 'Removes the expense and posts a reversing journal entry dated today. The original entry stays in the books.', remarks: 'required' },
}

const FINAL_HINT = 'Final approval creates the expense and posts it (Dr the expense head, Cr cash or bank) in one step. If posting fails, nothing changes and it stays here.'

/** One workflow button: confirms with optional / required remarks and sends the status the user saw. */
export function ApprovalActionButton({
  requestId,
  action,
  label,
  expectedStatus,
  finalStage,
  variant = 'secondary',
}: {
  requestId: string
  action: 'submit' | 'approve' | 'return' | 'reject' | 'withdraw' | 'reverse'
  label: string
  expectedStatus: string
  finalStage?: boolean
  variant?: 'ghost' | 'secondary' | 'danger' | 'primary'
}) {
  return (
    <FormDialog title={label} size="sm" trigger={(open) => <Button size="sm" variant={variant} onClick={open}>{label}</Button>}>
      {(close) => <ActionForm requestId={requestId} action={action} label={label} expectedStatus={expectedStatus} finalStage={finalStage} onDone={close} />}
    </FormDialog>
  )
}

function ActionForm({
  requestId,
  action,
  label,
  expectedStatus,
  finalStage,
  onDone,
}: {
  requestId: string
  action: string
  label: string
  expectedStatus: string
  finalStage?: boolean
  onDone: () => void
}) {
  const { busy, error, run } = useSubmit(onDone)
  const copy = ACTION_COPY[action]!
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const remarks = String(new FormData(e.currentTarget).get('remarks') ?? '').trim()
    void run(() => callApi(`/api/v1/accounting/expense-approvals/${requestId}`, {
      method: 'POST',
      body: { action, expectedStatus, remarks: remarks || undefined },
    }))
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <p className="text-sm text-ink-muted">{finalStage && action === 'approve' ? FINAL_HINT : copy.hint}</p>
      {copy.remarks !== 'none' ? (
        <Field label="Remarks" required={copy.remarks === 'required'} htmlFor="ea-remarks">
          <Textarea id="ea-remarks" name="remarks" rows={3} maxLength={1000} required={copy.remarks === 'required'} minLength={copy.remarks === 'required' ? 3 : undefined} />
        </Field>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Back</Button>
        <Button type="submit" disabled={busy} variant={action === 'reject' || action === 'reverse' ? 'danger' : 'primary'}>{busy ? 'Working…' : label}</Button>
      </div>
    </form>
  )
}

export type RequestFormValue = {
  id: string
  title: string
  headId: string
  amountMinor: number
  expenseDate: string
  paymentMode: string
  vendor: string | null
  referenceNo: string | null
  notes: string | null
  cashAccountId: string | null
}

/** The preparer corrects a draft or returned expense. */
export function EditRequestDialog({ value, heads, cashAccounts }: { value: RequestFormValue; heads: Option[]; cashAccounts: Option[] }) {
  return (
    <FormDialog title="Edit expense" description="Changes are recorded in the approval history." trigger={(open) => <Button size="sm" variant="secondary" onClick={open}>Edit</Button>}>
      {(close) => <EditRequestForm value={value} heads={heads} cashAccounts={cashAccounts} onDone={close} />}
    </FormDialog>
  )
}

function EditRequestForm({ value, heads, cashAccounts, onDone }: { value: RequestFormValue; heads: Option[]; cashAccounts: Option[]; onDone: () => void }) {
  const { busy, error, setError, run } = useSubmit(onDone)
  const [mode, setMode] = React.useState(value.paymentMode)
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const amountMinor = parseMoneyToMinor(String(f.get('amount') ?? ''))
    if (!amountMinor) {
      setError('Enter the amount in rupees, with at most two decimals')
      return
    }
    void run(() => callApi(`/api/v1/accounting/expense-approvals/${value.id}`, {
      method: 'PATCH',
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
      },
    }))
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Description" required htmlFor="ea-title" className="sm:col-span-2">
          <Input id="ea-title" name="title" required minLength={2} maxLength={120} defaultValue={value.title} />
        </Field>
        <Field label="Expense head" required htmlFor="ea-head">
          <Select id="ea-head" name="headId" required defaultValue={value.headId}>
            {heads.some((h) => h.id === value.headId) ? null : <option value="" disabled>Choose a head</option>}
            {heads.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
          </Select>
        </Field>
        <Field label="Amount (₹)" required htmlFor="ea-amount">
          <Input id="ea-amount" name="amount" inputMode="decimal" required defaultValue={(value.amountMinor / 100).toFixed(2)} />
        </Field>
        <Field label="Voucher date" required htmlFor="ea-date">
          <Input id="ea-date" name="expenseDate" type="date" required defaultValue={value.expenseDate} />
        </Field>
        <Field label="Payee / vendor" htmlFor="ea-vendor">
          <Input id="ea-vendor" name="vendor" maxLength={120} defaultValue={value.vendor ?? ''} />
        </Field>
        <Field label="Payment mode" htmlFor="ea-mode">
          <Select id="ea-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Paid from" hint="Leave as default to use the ledger mapped to the payment mode" htmlFor="ea-cash">
          <Select id="ea-cash" name="cashAccountId" defaultValue={value.cashAccountId ?? ''}>
            <option value="">Default for the mode</option>
            {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Reference" required={mode !== 'CASH'} hint="Cheque number, UTR or UPI reference" htmlFor="ea-ref">
          <Input id="ea-ref" name="referenceNo" maxLength={60} required={mode !== 'CASH'} defaultValue={value.referenceNo ?? ''} />
        </Field>
      </div>
      <Field label="Remarks" htmlFor="ea-notes"><Textarea id="ea-notes" name="notes" rows={2} maxLength={500} defaultValue={value.notes ?? ''} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </form>
  )
}

/** The school's "Trigger Multi-Tier Approval Workflow" switch. */
export function ApprovalWorkflowToggle({ enabled, available }: { enabled: boolean; available: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await callApi('/api/v1/accounting/expense-approvals/settings', { method: 'POST', body: { enabled: !enabled } })
    setBusy(false)
    if (!result.ok) setError(result.message)
    else router.refresh()
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant={enabled ? 'secondary' : 'primary'} disabled={busy || (!enabled && !available)} onClick={() => void toggle()}>
          {busy ? 'Saving…' : enabled ? 'Switch off approval workflow' : 'Trigger multi-tier approval workflow'}
        </Button>
        {!enabled && !available ? <span className="text-xs text-ink-subtle">Not available on this deployment (ACCOUNTING_APPROVALS_ENABLED is off).</span> : null}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  )
}

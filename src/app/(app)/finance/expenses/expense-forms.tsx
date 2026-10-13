'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createExpenseAction,
  deleteExpenseAction,
  updateExpenseAction,
} from './actions'
import { EXPENSE_NATURES, EXPENSE_PAYMENT_MODES } from '@/lib/finance/expense-options'
import { Button, IconButton } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { toDateInput } from '@/lib/dates'

export type HeadOption = { id: string; name: string; nature: string; isActive: boolean }

export type ExpenseDraft = {
  id: string
  title: string
  headId: string | null
  amountMinor: number
  expenseDateInput: string
  paymentMode: string
  vendor: string | null
  referenceNo: string | null
  notes: string | null
  receiptName: string | null
  receiptUrl: string | null
}

type FormState = {
  title: string
  headId: string
  amount: string
  expenseDate: string
  paymentMode: string
  vendor: string
  referenceNo: string
  notes: string
}

const emptyForm = (heads: HeadOption[]): FormState => ({
  title: '',
  headId: heads.find((h) => h.isActive)?.id ?? '',
  amount: '',
  expenseDate: toDateInput(new Date()),
  paymentMode: 'CASH',
  vendor: '',
  referenceNo: '',
  notes: '',
})

const fromDraft = (e: ExpenseDraft): FormState => ({
  title: e.title,
  headId: e.headId ?? '',
  amount: String(e.amountMinor / 100),
  expenseDate: e.expenseDateInput,
  paymentMode: e.paymentMode,
  vendor: e.vendor ?? '',
  referenceNo: e.referenceNo ?? '',
  notes: e.notes ?? '',
})

const MAX_RECEIPT_MB = 10

async function uploadReceipt(expenseId: string, file: File): Promise<string | null> {
  const body = new FormData()
  body.set('file', file)
  const res = await fetch(`/api/v1/finance/expenses/${expenseId}/receipt`, { method: 'POST', body })
  if (res.ok) return null
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
  return json?.error?.message ?? 'The receipt could not be uploaded'
}

function ExpenseFields({
  idPrefix,
  form,
  set,
  heads,
  file,
  setFile,
  existingReceipt,
  autoFocus,
}: {
  idPrefix: string
  form: FormState
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  heads: HeadOption[]
  file: File | null
  setFile: (f: File | null) => void
  existingReceipt?: { name: string; url: string } | null
  autoFocus?: boolean
}) {
  const head = heads.find((h) => h.id === form.headId)
  const selectable = heads.filter((h) => h.isActive || h.id === form.headId)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Expense title" htmlFor={`${idPrefix}-title`} required className="sm:col-span-2">
        <Input
          id={`${idPrefix}-title`}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Electricity bill — August"
          autoFocus={autoFocus}
        />
      </Field>
      <Field label="Amount (₹)" htmlFor={`${idPrefix}-amount`} required>
        <Input
          id={`${idPrefix}-amount`}
          type="number"
          min="0.01"
          step="0.01"
          value={form.amount}
          onChange={(e) => set('amount', e.target.value)}
          placeholder="0.00"
        />
      </Field>
      <Field label="Date" htmlFor={`${idPrefix}-date`} required>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={form.expenseDate}
          max={toDateInput(new Date())}
          onChange={(e) => set('expenseDate', e.target.value)}
        />
      </Field>
      <Field label="Expense head" htmlFor={`${idPrefix}-head`} required className="sm:col-span-2">
        <Select id={`${idPrefix}-head`} value={form.headId} onChange={(e) => set('headId', e.target.value)}>
          {EXPENSE_NATURES.map((n) => (
            <optgroup key={n.value} label={n.label}>
              {selectable
                .filter((h) => h.nature === n.value)
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
        {head ? (
          <p className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
            <Badge tone={head.nature === 'DIRECT' ? 'brand' : 'neutral'}>
              {head.nature === 'DIRECT' ? 'Direct expense' : 'Indirect expense'}
            </Badge>
            {head.nature === 'DIRECT' ? 'Counts against gross surplus in P&L' : 'Shown under operating costs in P&L'}
          </p>
        ) : null}
      </Field>
      <Field label="Payment mode" htmlFor={`${idPrefix}-mode`}>
        <Select id={`${idPrefix}-mode`} value={form.paymentMode} onChange={(e) => set('paymentMode', e.target.value)}>
          {EXPENSE_PAYMENT_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Vendor / supplier" htmlFor={`${idPrefix}-vendor`}>
        <Input
          id={`${idPrefix}-vendor`}
          value={form.vendor}
          onChange={(e) => set('vendor', e.target.value)}
          placeholder="e.g. State electricity board"
        />
      </Field>
      <Field label="Invoice / bill number" htmlFor={`${idPrefix}-ref`}>
        <Input
          id={`${idPrefix}-ref`}
          value={form.referenceNo}
          onChange={(e) => set('referenceNo', e.target.value)}
          placeholder="INV-001"
        />
      </Field>
      <Field label="Attach receipt (PDF / image)" htmlFor={`${idPrefix}-file`}>
        <Input
          id={`${idPrefix}-file`}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <p className="mt-1 text-xs text-ink-muted">{file.name}</p>
        ) : existingReceipt ? (
          <a href={existingReceipt.url} className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--brand-600)] hover:underline">
            <Paperclip className="size-3" aria-hidden /> {existingReceipt.name} (choose a file to replace)
          </a>
        ) : null}
      </Field>
      <Field label="Notes (internal)" htmlFor={`${idPrefix}-notes`} className="sm:col-span-2">
        <Textarea
          id={`${idPrefix}-notes`}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          placeholder="Optional tracking notes"
        />
      </Field>
    </div>
  )
}

function useExpenseForm(initial: () => FormState) {
  const [form, setForm] = React.useState<FormState>(initial)
  const set = React.useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }, [])
  return { form, setForm, set }
}

function payloadOf(form: FormState) {
  return {
    title: form.title.trim(),
    headId: form.headId,
    amount: Number(form.amount),
    expenseDate: form.expenseDate,
    paymentMode: form.paymentMode,
    vendor: form.vendor.trim() || undefined,
    referenceNo: form.referenceNo.trim() || undefined,
    notes: form.notes.trim() || undefined,
  }
}

function fileProblem(file: File | null) {
  if (file && file.size > MAX_RECEIPT_MB * 1024 * 1024) return `Receipts must be ${MAX_RECEIPT_MB}MB or smaller`
  return null
}

export function NewExpenseButton({ heads }: { heads: HeadOption[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const { form, setForm, set } = useExpenseForm(() => emptyForm(heads))
  const [file, setFile] = React.useState<File | null>(null)

  const submit = () =>
    startTransition(async () => {
      const problem = fileProblem(file)
      if (problem) {
        toast.push({ tone: 'error', title: 'Receipt too large', description: problem })
        return
      }
      const result = await createExpenseAction(payloadOf(form))
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save expense', description: result.message })
        return
      }
      if (file && result.id) {
        const err = await uploadReceipt(result.id, file)
        if (err) toast.push({ tone: 'error', title: 'Expense saved, receipt not attached', description: err })
      }
      toast.push({ tone: 'success', title: 'Expense recorded', description: result.message })
      setOpen(false)
      setForm(emptyForm(heads))
      setFile(null)
      router.refresh()
    })

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Record expense
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record expense"
        description="Every rupee the school spends: choose the head and it is filed as a direct or indirect expense automatically."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!form.title.trim() || !form.headId || !form.amount || Number(form.amount) <= 0}
            >
              Save expense
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <ExpenseFields idPrefix="new-expense" form={form} set={set} heads={heads} file={file} setFile={setFile} autoFocus />
      </Dialog>
    </>
  )
}

export function EditExpenseButton({ expense, heads }: { expense: ExpenseDraft; heads: HeadOption[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const { form, setForm, set } = useExpenseForm(() => fromDraft(expense))
  const [file, setFile] = React.useState<File | null>(null)
  const [confirmRemove, setConfirmRemove] = React.useState(false)

  const openDialog = () => {
    setForm(fromDraft(expense))
    setFile(null)
    setConfirmRemove(false)
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const problem = fileProblem(file)
      if (problem) {
        toast.push({ tone: 'error', title: 'Receipt too large', description: problem })
        return
      }
      const result = await updateExpenseAction({ id: expense.id, ...payloadOf(form) })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not update', description: result.message })
        return
      }
      if (file) {
        const err = await uploadReceipt(expense.id, file)
        if (err) toast.push({ tone: 'error', title: 'Saved, receipt not attached', description: err })
      }
      toast.push({ tone: 'success', title: 'Expense updated', description: result.message })
      setOpen(false)
      router.refresh()
    })

  const removeReceipt = () =>
    startTransition(async () => {
      const res = await fetch(`/api/v1/finance/expenses/${expense.id}/receipt`, { method: 'DELETE' })
      if (!res.ok) {
        toast.push({ tone: 'error', title: 'Could not remove the receipt' })
        return
      }
      toast.push({ tone: 'success', title: 'Receipt removed' })
      setOpen(false)
      router.refresh()
    })

  const remove = () =>
    startTransition(async () => {
      const result = await deleteExpenseAction(expense.id)
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not remove', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Expense removed', description: result.message })
      setOpen(false)
      router.refresh()
    })

  return (
    <>
      <IconButton label={`Edit ${expense.title}`} onClick={openDialog}>
        <Pencil className="size-3.5" aria-hidden />
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${expense.title}`}
        description="Correct the amount, head or payment details. The books are corrected with a reversal, never overwritten."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!form.title.trim() || !form.headId || !form.amount || Number(form.amount) <= 0}
            >
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <ExpenseFields
          idPrefix={`edit-expense-${expense.id}`}
          form={form}
          set={set}
          heads={heads}
          file={file}
          setFile={setFile}
          existingReceipt={expense.receiptUrl && expense.receiptName ? { name: expense.receiptName, url: expense.receiptUrl } : null}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {confirmRemove ? (
            <>
              <p className="text-sm text-ink-muted">Remove this expense from the tracker?</p>
              <Button size="sm" variant="danger" loading={pending} onClick={remove}>
                Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                Keep
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                <Trash2 aria-hidden /> Remove expense
              </Button>
              {expense.receiptUrl ? (
                <Button size="sm" variant="ghost" loading={pending} onClick={removeReceipt}>
                  <Paperclip aria-hidden /> Remove receipt
                </Button>
              ) : null}
            </>
          )}
        </div>
      </Dialog>
    </>
  )
}

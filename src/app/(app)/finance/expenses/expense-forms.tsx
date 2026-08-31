'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createExpenseAction,
  deleteExpenseAction,
  updateExpenseAction,
} from './actions'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_MODES,
} from '@/server/modules/finance/expenses'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { toDateInput } from '@/lib/dates'

export type ExpenseDraft = {
  id: string
  title: string
  category: string
  amountMinor: number
  expenseDateInput: string
  paymentMode: string
  vendor: string | null
  referenceNo: string | null
  notes: string | null
}

function ExpenseFields({
  idPrefix,
  title,
  setTitle,
  category,
  setCategory,
  amount,
  setAmount,
  expenseDate,
  setExpenseDate,
  paymentMode,
  setPaymentMode,
  vendor,
  setVendor,
  referenceNo,
  setReferenceNo,
  notes,
  setNotes,
  autoFocus,
}: {
  idPrefix: string
  title: string
  setTitle: (v: string) => void
  category: string
  setCategory: (v: string) => void
  amount: string
  setAmount: (v: string) => void
  expenseDate: string
  setExpenseDate: (v: string) => void
  paymentMode: string
  setPaymentMode: (v: string) => void
  vendor: string
  setVendor: (v: string) => void
  referenceNo: string
  setReferenceNo: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  autoFocus?: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="What was spent" htmlFor={`${idPrefix}-title`} required className="sm:col-span-2">
        <Input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Electricity bill — August"
          autoFocus={autoFocus}
        />
      </Field>
      <Field label="Amount (₹)" htmlFor={`${idPrefix}-amount`} required>
        <Input
          id={`${idPrefix}-amount`}
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />
      </Field>
      <Field label="Date" htmlFor={`${idPrefix}-date`} required>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
        />
      </Field>
      <Field label="Category" htmlFor={`${idPrefix}-category`}>
        <Select
          id={`${idPrefix}-category`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Paid by" htmlFor={`${idPrefix}-mode`}>
        <Select
          id={`${idPrefix}-mode`}
          value={paymentMode}
          onChange={(e) => setPaymentMode(e.target.value)}
        >
          {EXPENSE_PAYMENT_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Vendor / payee" htmlFor={`${idPrefix}-vendor`}>
        <Input
          id={`${idPrefix}-vendor`}
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="BESCOM, stationery shop…"
        />
      </Field>
      <Field label="Bill / reference no." htmlFor={`${idPrefix}-ref`}>
        <Input
          id={`${idPrefix}-ref`}
          value={referenceNo}
          onChange={(e) => setReferenceNo(e.target.value)}
          placeholder="Optional"
        />
      </Field>
      <Field label="Notes" htmlFor={`${idPrefix}-notes`} className="sm:col-span-2">
        <Textarea
          id={`${idPrefix}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional details for audit"
        />
      </Field>
    </div>
  )
}

export function NewExpenseButton() {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [title, setTitle] = React.useState('')
  const [category, setCategory] = React.useState('OTHER')
  const [amount, setAmount] = React.useState('')
  const [expenseDate, setExpenseDate] = React.useState(toDateInput(new Date()))
  const [paymentMode, setPaymentMode] = React.useState('CASH')
  const [vendor, setVendor] = React.useState('')
  const [referenceNo, setReferenceNo] = React.useState('')
  const [notes, setNotes] = React.useState('')

  const reset = () => {
    setTitle('')
    setCategory('OTHER')
    setAmount('')
    setExpenseDate(toDateInput(new Date()))
    setPaymentMode('CASH')
    setVendor('')
    setReferenceNo('')
    setNotes('')
  }

  const submit = () =>
    startTransition(async () => {
      const result = await createExpenseAction({
        title: title.trim(),
        category,
        amount: Number(amount),
        expenseDate,
        paymentMode,
        vendor: vendor.trim() || undefined,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save expense', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Expense recorded', description: result.message })
      setOpen(false)
      reset()
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
        description="Log any school spend — utilities, supplies, maintenance, events and more."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!title.trim() || !amount || Number(amount) <= 0}
            >
              Save expense
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <ExpenseFields
          idPrefix="new-expense"
          title={title}
          setTitle={setTitle}
          category={category}
          setCategory={setCategory}
          amount={amount}
          setAmount={setAmount}
          expenseDate={expenseDate}
          setExpenseDate={setExpenseDate}
          paymentMode={paymentMode}
          setPaymentMode={setPaymentMode}
          vendor={vendor}
          setVendor={setVendor}
          referenceNo={referenceNo}
          setReferenceNo={setReferenceNo}
          notes={notes}
          setNotes={setNotes}
          autoFocus
        />
      </Dialog>
    </>
  )
}

export function EditExpenseButton({ expense }: { expense: ExpenseDraft }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [title, setTitle] = React.useState(expense.title)
  const [category, setCategory] = React.useState(expense.category)
  const [amount, setAmount] = React.useState(String(expense.amountMinor / 100))
  const [expenseDate, setExpenseDate] = React.useState(expense.expenseDateInput)
  const [paymentMode, setPaymentMode] = React.useState(expense.paymentMode)
  const [vendor, setVendor] = React.useState(expense.vendor ?? '')
  const [referenceNo, setReferenceNo] = React.useState(expense.referenceNo ?? '')
  const [notes, setNotes] = React.useState(expense.notes ?? '')
  const [confirmRemove, setConfirmRemove] = React.useState(false)

  const openDialog = () => {
    setTitle(expense.title)
    setCategory(expense.category)
    setAmount(String(expense.amountMinor / 100))
    setExpenseDate(expense.expenseDateInput)
    setPaymentMode(expense.paymentMode)
    setVendor(expense.vendor ?? '')
    setReferenceNo(expense.referenceNo ?? '')
    setNotes(expense.notes ?? '')
    setConfirmRemove(false)
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await updateExpenseAction({
        id: expense.id,
        title: title.trim(),
        category,
        amount: Number(amount),
        expenseDate,
        paymentMode,
        vendor: vendor.trim() || undefined,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not update', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Expense updated', description: result.message })
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
        description="Correct the amount, category or payment details."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!title.trim() || !amount || Number(amount) <= 0}
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
          title={title}
          setTitle={setTitle}
          category={category}
          setCategory={setCategory}
          amount={amount}
          setAmount={setAmount}
          expenseDate={expenseDate}
          setExpenseDate={setExpenseDate}
          paymentMode={paymentMode}
          setPaymentMode={setPaymentMode}
          vendor={vendor}
          setVendor={setVendor}
          referenceNo={referenceNo}
          setReferenceNo={setReferenceNo}
          notes={notes}
          setNotes={setNotes}
        />
        <div className="mt-4 border-t border-line pt-3">
          {confirmRemove ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-ink-muted">Remove this expense from the tracker?</p>
              <Button size="sm" variant="danger" loading={pending} onClick={remove}>
                Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
              <Trash2 aria-hidden /> Remove expense
            </Button>
          )}
        </div>
      </Dialog>
    </>
  )
}

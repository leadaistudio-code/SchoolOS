'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { saveExpenseHeadAction } from '../actions'
import { EXPENSE_CATEGORIES, EXPENSE_NATURES } from '@/lib/finance/expense-options'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

export type HeadDraft = {
  id: string
  name: string
  nature: string
  category: string
  description: string | null
  isActive: boolean
  entries: number
}

export function HeadDialog({ head, defaultNature = 'INDIRECT' }: { head?: HeadDraft; defaultNature?: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState('')
  const [nature, setNature] = React.useState(defaultNature)
  const [category, setCategory] = React.useState('OTHER')
  const [description, setDescription] = React.useState('')
  const [isActive, setIsActive] = React.useState(true)

  const openDialog = () => {
    setName(head?.name ?? '')
    setNature(head?.nature ?? defaultNature)
    setCategory(head?.category ?? 'OTHER')
    setDescription(head?.description ?? '')
    setIsActive(head?.isActive ?? true)
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await saveExpenseHeadAction({
        ...(head ? { id: head.id, isActive } : {}),
        name: name.trim(),
        nature,
        category,
        description: description.trim(),
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Expense head saved', description: result.message })
      setOpen(false)
      router.refresh()
    })

  const natureChanged = head && head.nature !== nature && head.entries > 0

  return (
    <>
      {head ? (
        <IconButton label={`Edit ${head.name}`} onClick={openDialog}>
          <Pencil className="size-3.5" aria-hidden />
        </IconButton>
      ) : (
        <Button size="sm" onClick={openDialog}>
          <Plus aria-hidden /> New expense head
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={head ? `Edit ${head.name}` : 'New expense head'}
        description="A head is what you spend on (Electricity, Rent, Diesel ...). Its type decides where it lands in the Profit & Loss."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={name.trim().length < 2}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Name" htmlFor="head-name" required>
            <Input id="head-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diesel for generator" autoFocus />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">Type</legend>
            {EXPENSE_NATURES.map((n) => (
              <label
                key={n.value}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${
                  nature === n.value ? 'border-[var(--brand-500)] bg-[var(--brand-50)]' : 'border-[var(--border)]'
                }`}
              >
                <input type="radio" name="head-nature" value={n.value} checked={nature === n.value} onChange={() => setNature(n.value)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-ink">{n.label}</span>
                  <span className="block text-xs text-ink-muted">{n.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {natureChanged ? (
            <p className="rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">
              Every entry under this head will move to {nature === 'DIRECT' ? 'direct' : 'indirect'} expenses, and the P&amp;L will be restated for every period.
            </p>
          ) : null}
          <Field label="Report group" htmlFor="head-category">
            <Select id="head-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" htmlFor="head-desc">
            <Input id="head-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </Field>
          {head ? (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Available for new expenses
            </label>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}

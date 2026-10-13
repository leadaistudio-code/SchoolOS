'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { saveAccountAction } from '../actions'

type AccountValues = {
  id?: string
  code: string
  name: string
  type: string
  description: string | null
  /** Rupees on the natural side. */
  openingBalance: number
  isActive: boolean
  isSystem: boolean
  hasEntries: boolean
  expenseNature?: string | null
}

const TYPES = [
  { value: 'ASSET', label: 'Asset (cash, bank, receivables, furniture)' },
  { value: 'LIABILITY', label: 'Liability (advance fees, deposits, loans)' },
  { value: 'EQUITY', label: 'Capital / reserves' },
  { value: 'INCOME', label: 'Income (fees, donations, interest)' },
  { value: 'EXPENSE', label: 'Expense (salaries, rent, utilities)' },
]

export function AccountDialog({ values, trigger }: { values?: AccountValues; trigger: React.ReactNode }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<AccountValues>(
    values ?? {
      code: '', name: '', type: 'EXPENSE', description: '', openingBalance: 0, isActive: true, isSystem: false, hasEntries: false,
    },
  )
  const [pending, startTransition] = React.useTransition()
  const set = <K extends keyof AccountValues>(key: K, value: AccountValues[K]) => setForm((f) => ({ ...f, [key]: value }))
  const natural = form.type === 'ASSET' || form.type === 'EXPENSE' ? 'Dr' : 'Cr'

  const save = () =>
    startTransition(async () => {
      const result = await saveAccountAction({
        ...(form.id ? { id: form.id } : {}),
        code: form.code,
        name: form.name,
        type: form.type,
        description: form.description ?? '',
        openingBalance: form.openingBalance,
        isActive: form.isActive,
        ...(form.type === 'EXPENSE' ? { expenseNature: form.expenseNature || 'INDIRECT' } : {}),
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Not saved', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Account saved', description: result.message })
      setOpen(false)
      router.refresh()
    })

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? `Edit ${values?.code} ${values?.name}` : 'New ledger account'}
        footer={
          <>
            <Button loading={pending} onClick={save} disabled={!form.code.trim() || form.name.trim().length < 2}>
              Save account
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Field label="Code" htmlFor="acc-code" required>
            <Input id="acc-code" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="5010" />
          </Field>
          <Field label="Name" htmlFor="acc-name" required>
            <Input id="acc-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Building Rent" />
          </Field>
        </div>
        <Field
          label="Type"
          htmlFor="acc-type"
          required
          hint={form.isSystem ? 'System account: used by automatic posting.' : form.hasEntries ? 'Has entries, so the type is fixed.' : undefined}
        >
          <Select
            id="acc-type"
            value={form.type}
            disabled={form.isSystem || form.hasEntries}
            onChange={(e) => set('type', e.target.value)}
          >
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        {form.type === 'EXPENSE' ? (
          <Field
            label="Expense type"
            htmlFor="acc-nature"
            hint="Direct expenses are deducted first to show gross surplus; indirect expenses are running costs. Expense heads posting here follow this setting."
          >
            <Select id="acc-nature" value={form.expenseNature || 'INDIRECT'} onChange={(e) => set('expenseNature', e.target.value)}>
              <option value="DIRECT">Direct expense</option>
              <option value="INDIRECT">Indirect expense</option>
            </Select>
          </Field>
        ) : null}
        <Field label={`Opening balance (₹, ${natural})`} htmlFor="acc-opening" hint="Balance brought forward when you start using these books. Leave 0 if unsure.">
          <Input
            id="acc-opening"
            type="number"
            step="0.01"
            value={String(form.openingBalance)}
            onChange={(e) => set('openingBalance', Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Description" htmlFor="acc-desc">
          <Textarea id="acc-desc" rows={2} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        {form.id && !form.isSystem ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            Active (inactive accounts cannot be used in new vouchers)
          </label>
        ) : null}
      </Dialog>
    </>
  )
}

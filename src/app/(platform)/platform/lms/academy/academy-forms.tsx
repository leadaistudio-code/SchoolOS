'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { setAcademyPriceAction, setupAcademyAction } from './actions'

export function SetupAcademyForm({ plans }: { plans: { id: string; name: string }[] }) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = React.useTransition()
  const [form, setForm] = React.useState({ adminName: '', adminEmail: '', adminPassword: '', planId: plans[0]?.id ?? '' })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          const r = await setupAcademyAction(form)
          push({ tone: r.ok ? 'success' : 'error', title: r.message })
          if (r.ok) router.refresh()
        })
      }}
    >
      <Field label="Academy administrator" required htmlFor="a-name" hint="Runs live classes and reviews projects">
        <Input id="a-name" value={form.adminName} onChange={set('adminName')} />
      </Field>
      <Field label="Administrator email" required htmlFor="a-email">
        <Input id="a-email" type="email" value={form.adminEmail} onChange={set('adminEmail')} />
      </Field>
      <Field label="Password" required htmlFor="a-pass" hint="At least 10 characters">
        <Input id="a-pass" type="password" autoComplete="new-password" value={form.adminPassword} onChange={set('adminPassword')} />
      </Field>
      <Field label="Plan" required htmlFor="a-plan" hint="Only the LMS is used; it is switched on automatically">
        <Select id="a-plan" value={form.planId} onChange={set('planId')}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>Set up the Academy</Button>
      </div>
    </form>
  )
}

export function PriceInput({ courseId, priceMinor, title }: { courseId: string; priceMinor: number | null; title: string }) {
  const router = useRouter()
  const { push } = useToast()
  const initial = priceMinor === null ? '' : String(priceMinor / 100)
  const [value, setValue] = React.useState(initial)
  const [pending, startTransition] = React.useTransition()
  const changed = value.trim() !== initial

  return (
    <form
      className="flex items-center justify-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          const r = await setAcademyPriceAction(courseId, value)
          push({ tone: r.ok ? 'success' : 'error', title: r.message })
          if (r.ok) router.refresh()
        })
      }}
    >
      <span className="text-sm text-ink-muted">₹</span>
      <Input
        aria-label={`Academy price for ${title}`}
        className="w-28 text-right tnum"
        inputMode="decimal"
        placeholder="Not sold"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button type="submit" size="sm" variant={changed ? 'primary' : 'secondary'} disabled={!changed} loading={pending}>
        Save
      </Button>
    </form>
  )
}

export function CopyText({ text }: { text: string }) {
  const { push } = useToast()
  return (
    <span className="inline-flex items-center gap-2 max-w-full">
      <code className="rounded bg-surface-2 px-2 py-1 text-xs break-all">{text}</code>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Copy"
        onClick={() => navigator.clipboard.writeText(text).then(() => push({ tone: 'success', title: 'Copied' }))}
      >
        <Copy />
      </Button>
    </span>
  )
}

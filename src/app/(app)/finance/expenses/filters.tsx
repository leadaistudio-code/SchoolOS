'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { EXPENSE_NATURES, EXPENSE_PAYMENT_MODES } from '@/lib/finance/expense-options'
import { PERIOD_PRESETS } from '@/lib/periods'
import { Field, Select, Input } from '@/components/ui/input'
import type { HeadOption } from './expense-forms'

export function ExpenseFilters({ heads }: { heads: HeadOption[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }
  const nature = searchParams.get('nature') ?? ''

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Type" htmlFor="exp-nature">
        <Select id="exp-nature" value={nature} onChange={(e) => setParams({ nature: e.target.value, headId: '' })}>
          <option value="">Direct + indirect</option>
          {EXPENSE_NATURES.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Head" htmlFor="exp-head">
        <Select id="exp-head" value={searchParams.get('headId') ?? ''} onChange={(e) => setParams({ headId: e.target.value })}>
          <option value="">All heads</option>
          {heads
            .filter((h) => !nature || h.nature === nature)
            .map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Paid by" htmlFor="exp-mode">
        <Select id="exp-mode" value={searchParams.get('paymentMode') ?? ''} onChange={(e) => setParams({ paymentMode: e.target.value })}>
          <option value="">Any mode</option>
          {EXPENSE_PAYMENT_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Period" htmlFor="exp-preset">
        <Select
          id="exp-preset"
          value={searchParams.get('preset') ?? ''}
          onChange={(e) => setParams({ preset: e.target.value, from: '', to: '' })}
        >
          <option value="">Any time</option>
          {PERIOD_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="From" htmlFor="exp-from">
        <Input
          id="exp-from"
          type="date"
          value={searchParams.get('from') ?? ''}
          onChange={(e) => setParams({ from: e.target.value, preset: '' })}
        />
      </Field>
      <Field label="To" htmlFor="exp-to">
        <Input
          id="exp-to"
          type="date"
          value={searchParams.get('to') ?? ''}
          onChange={(e) => setParams({ to: e.target.value, preset: '' })}
        />
      </Field>
    </div>
  )
}

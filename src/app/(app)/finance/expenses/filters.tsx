'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { EXPENSE_NATURES, EXPENSE_PAYMENT_MODES } from '@/lib/finance/expense-options'
import { PERIOD_PRESETS } from '@/lib/periods'
import { Select, Input } from '@/components/ui/input'
import type { HeadOption } from './expense-forms'

export function ExpenseFilters({
  heads,
  recorders = [],
  spentByNames = [],
  sessionName = null,
}: {
  heads: HeadOption[]
  recorders?: { id: string; name: string }[]
  /** Distinct "Expense by" person names. */
  spentByNames?: string[]
  sessionName?: string | null
}) {
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
    <>
      <Select
        value={searchParams.get('preset') ?? (searchParams.get('from') || searchParams.get('to') ? 'custom' : '')}
        aria-label="Period"
        className="w-40"
        onChange={(e) =>
          e.target.value === 'custom'
            ? setParams({ preset: '' })
            : setParams({ preset: e.target.value, from: '', to: '' })
        }
      >
        <option value="">{sessionName ? `Session ${sessionName}` : 'Any time'}</option>
        {sessionName ? <option value="all">All dates</option> : null}
        {PERIOD_PRESETS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
        <option value="custom">Custom range</option>
      </Select>
      {!searchParams.get('preset') ? (
        <>
          <Input
            type="date"
            aria-label="From date"
            className="w-36"
            value={searchParams.get('from') ?? ''}
            onChange={(e) => setParams({ from: e.target.value, preset: '' })}
          />
          <Input
            type="date"
            aria-label="To date"
            className="w-36"
            value={searchParams.get('to') ?? ''}
            onChange={(e) => setParams({ to: e.target.value, preset: '' })}
          />
        </>
      ) : null}

      <Select
        value={searchParams.get('source') ?? ''}
        aria-label="Show"
        className="w-44"
        onChange={(e) => setParams({ source: e.target.value })}
      >
        <option value="">Expenses + vendors</option>
        <option value="expenses">Expenses only</option>
        <option value="vendors">Vendor payments only</option>
      </Select>

      <Select
        value={nature}
        aria-label="Type"
        className="w-36"
        onChange={(e) => setParams({ nature: e.target.value, headId: '' })}
      >
        <option value="">Direct + indirect</option>
        {EXPENSE_NATURES.map((n) => (
          <option key={n.value} value={n.value}>
            {n.label}
          </option>
        ))}
      </Select>

      <Select
        value={searchParams.get('headId') ?? ''}
        aria-label="Expense head / item"
        className="w-44"
        onChange={(e) => setParams({ headId: e.target.value })}
      >
        <option value="">All heads / items</option>
        {heads
          .filter((h) => !nature || h.nature === nature)
          .map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
      </Select>

      <Select
        value={searchParams.get('paymentMode') ?? ''}
        aria-label="Paid by"
        className="w-36"
        onChange={(e) => setParams({ paymentMode: e.target.value })}
      >
        <option value="">Any mode</option>
        {EXPENSE_PAYMENT_MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>

      {recorders.length > 0 ? (
        <Select
          value={searchParams.get('recordedById') ?? ''}
          aria-label="Recorded by"
          className="w-44"
          onChange={(e) => setParams({ recordedById: e.target.value })}
        >
          <option value="">Created by: anyone</option>
          {recorders.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      ) : null}

      {spentByNames.length > 0 ? (
        <Select
          value={searchParams.get('spentBy') ?? ''}
          aria-label="Expense by person"
          className="w-44"
          onChange={(e) => setParams({ spentBy: e.target.value })}
        >
          <option value="">Expense by: anyone</option>
          {spentByNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      ) : null}
    </>
  )
}

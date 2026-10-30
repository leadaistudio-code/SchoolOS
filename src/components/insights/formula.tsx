import * as React from 'react'
import { Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The rule behind a figure, written out with this record's own numbers. */
export function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-[var(--radius)] border border-[var(--brand-200)] bg-[var(--brand-50)] px-3.5 py-2.5 text-sm text-ink">
      <Calculator className="mt-0.5 size-4 shrink-0 text-[var(--brand-600)]" aria-hidden />
      <p className="tnum">{children}</p>
    </div>
  )
}

export type InputCell = { label: string; value: React.ReactNode; strong?: boolean }

/** The inputs a figure was computed from, side by side. */
export function InputGrid({ cells }: { cells: InputCell[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="bg-surface px-3 py-2">
          <dt className="text-xs text-ink-subtle">{c.label}</dt>
          <dd className={cn('mt-0.5 tnum', c.strong ? 'text-lg font-semibold text-ink' : 'text-base text-ink')}>{c.value}</dd>
        </div>
      ))}
    </dl>
  )
}

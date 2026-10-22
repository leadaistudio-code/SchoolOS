'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Checkboxes for choosing several sections at once. Submits each choice as
 * `sectionIds`; nothing chosen means the whole class.
 */
export function SectionPicker({
  sections,
  name = 'sectionIds',
}: {
  sections: { id: string; name: string }[]
  name?: string
}) {
  const [chosen, setChosen] = React.useState<string[]>([])
  const all = sections.length > 0 && chosen.length === sections.length

  if (sections.length === 0) {
    return <p className="text-sm text-ink-muted">This class has no sections, so the whole class is included.</p>
  }

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  const chip = (active: boolean) =>
    cn(
      'inline-flex items-center gap-2 rounded-[var(--radius)] border px-2.5 py-1.5 text-sm cursor-pointer select-none',
      active ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-ink' : 'border-line-strong text-ink-muted hover:text-ink',
    )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className={chip(chosen.length === 0)}>
          <input
            type="checkbox"
            checked={chosen.length === 0}
            onChange={() => setChosen([])}
            className="size-4 accent-[var(--brand-500)]"
          />
          Whole class
        </label>
        {sections.map((s) => (
          <label key={s.id} className={chip(chosen.includes(s.id))}>
            <input
              type="checkbox"
              name={name}
              value={s.id}
              checked={chosen.includes(s.id)}
              onChange={() => toggle(s.id)}
              className="size-4 accent-[var(--brand-500)]"
            />
            {s.name}
          </label>
        ))}
      </div>
      {sections.length > 1 ? (
        <button
          type="button"
          className="text-xs font-medium text-[var(--brand-600)] hover:underline"
          onClick={() => setChosen(all ? [] : sections.map((s) => s.id))}
        >
          {all ? 'Clear sections' : 'Select every section separately'}
        </button>
      ) : null}
      {chosen.length > 1 ? (
        <p className="text-xs text-ink-muted">A separate copy is created for each of the {chosen.length} sections, each with its own register.</p>
      ) : null}
    </div>
  )
}

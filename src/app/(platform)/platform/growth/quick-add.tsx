'use client'

import Link from 'next/link'
import { useState } from 'react'

const ITEMS = [
  { href: '/platform/growth/schools/new', label: 'New school' },
  { href: '/platform/growth/log?kind=call', label: 'Log call' },
  { href: '/platform/growth/log?kind=visit', label: 'Log visit' },
  { href: '/platform/growth/log?kind=note', label: 'Add note' },
  { href: '/platform/growth/log?kind=follow-up', label: 'Add follow-up' },
  { href: '/platform/growth/log?kind=meeting', label: 'Schedule meeting' },
  { href: '/platform/growth/log?kind=task', label: 'Add task' },
  { href: '/platform/growth/log?kind=message', label: 'Send message' },
]

export function GrowthQuickAdd() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        className="min-h-9 rounded-[var(--radius-sm)] bg-[var(--brand-500)] px-3 text-sm font-medium text-white"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        + Add
      </button>
      {open ? (
        <ul className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-[var(--radius)] border border-line bg-surface py-1 shadow-md">
          {ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block px-3 py-2 text-sm text-ink hover:bg-surface-2"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

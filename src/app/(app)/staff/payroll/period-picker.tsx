'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/input'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Which month payroll is being looked at. Kept in the URL so it is linkable. */
export function PeriodPicker({ year, month }: { year: number; month: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    next.set(key, value)
    router.push(`${pathname}?${next.toString()}`)
  }

  const thisYear = new Date().getFullYear()
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2]

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-line bg-surface px-3 py-2.5">
      <Select
        value={String(month)}
        aria-label="Payroll month"
        className="w-40"
        onChange={(e) => push('month', e.target.value)}
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </Select>
      <Select
        value={String(year)}
        aria-label="Payroll year"
        className="w-28"
        onChange={(e) => push('year', e.target.value)}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  )
}

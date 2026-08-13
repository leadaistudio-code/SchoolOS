'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input, Select } from '@/components/ui/input'

/**
 * Module and date filters.
 *
 * The module list is built from what this school's log actually contains
 * rather than from the full catalogue, so an empty option never appears — a
 * filter that always returns nothing is a filter nobody uses twice.
 */
export function AuditFilters({
  modules,
  module,
  from,
  to,
}: {
  modules: { module: string; count: number }[]
  module: string
  from: string
  to: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
      <Select
        value={module}
        aria-label="Filter by module"
        className="w-48"
        onChange={(e) => push('module', e.target.value)}
      >
        <option value="">Every module</option>
        {modules.map((m) => (
          <option key={m.module} value={m.module}>
            {m.module} ({m.count})
          </option>
        ))}
      </Select>

      <Input
        type="date"
        value={from}
        max={to || undefined}
        aria-label="From date"
        className="w-40"
        onChange={(e) => push('from', e.target.value)}
      />
      <span className="text-sm text-ink-subtle">to</span>
      <Input
        type="date"
        value={to}
        min={from || undefined}
        aria-label="To date"
        className="w-40"
        onChange={(e) => push('to', e.target.value)}
      />
    </div>
  )
}

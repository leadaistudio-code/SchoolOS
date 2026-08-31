'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { EXPENSE_CATEGORIES } from '@/server/modules/finance/expenses'
import { Field, Select, Input } from '@/components/ui/input'

export function ExpenseFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Category" htmlFor="exp-cat">
        <Select
          id="exp-cat"
          value={searchParams.get('category') ?? ''}
          onChange={(e) => setParam('category', e.target.value)}
        >
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="From" htmlFor="exp-from">
        <Input
          id="exp-from"
          type="date"
          value={searchParams.get('from') ?? ''}
          onChange={(e) => setParam('from', e.target.value)}
        />
      </Field>
      <Field label="To" htmlFor="exp-to">
        <Input
          id="exp-to"
          type="date"
          value={searchParams.get('to') ?? ''}
          onChange={(e) => setParam('to', e.target.value)}
        />
      </Field>
    </div>
  )
}

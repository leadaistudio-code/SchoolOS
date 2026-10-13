'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Field, Select } from '@/components/ui/input'

export type FilterDef = {
  param: string
  label: string
  allLabel: string
  options: Array<{ value: string; label: string }>
}

export function StoreFilters({ filters }: { filters: FilterDef[] }) {
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
      {filters.map((f) => (
        <Field key={f.param} label={f.label} htmlFor={`sf-${f.param}`}>
          <Select id={`sf-${f.param}`} value={searchParams.get(f.param) ?? ''} onChange={(e) => setParam(f.param, e.target.value)}>
            <option value="">{f.allLabel}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
      ))}
    </div>
  )
}

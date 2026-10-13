'use client'

import { useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Field, Select } from '@/components/ui/input'

type Option = { id: string; label: string }

/** Query-string driven selects for the report card engine tabs. */
export function EngineSelects({ fields }: { fields: Array<{ name: string; label: string; options: Option[]; value: string; resets?: string[] }> }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const set = (name: string, value: string, resets: string[] = []) => {
    const next = new URLSearchParams(searchParams.toString())
    if (value) next.set(name, value)
    else next.delete(name)
    for (const key of resets) next.delete(key)
    router.push(`${pathname}?${next.toString()}`)
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      {fields.map((f) => (
        <Field key={f.name} label={f.label} htmlFor={`rc-${f.name}`}>
          <Select id={`rc-${f.name}`} value={f.value} onChange={(e) => set(f.name, e.target.value, f.resets)} className="min-w-48">
            {f.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </Field>
      ))}
    </div>
  )
}

/** Opens the print dialog once, for "Download sample PDF". */
export function AutoPrint() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 600)
    return () => clearTimeout(timer)
  }, [])
  return null
}

'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input, Select } from '@/components/ui/input'

type ClassOption = { id: string; name: string; sections: { id: string; name: string }[] }

export function DuesFilters({ classes }: { classes: ClassOption[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const classLevelId = params.get('classLevelId') ?? ''
  const sections = classes.find((c) => c.id === classLevelId)?.sections ?? []
  const [minAmount, setMinAmount] = React.useState(params.get('minAmount') ?? '')

  const set = React.useCallback(
    (changes: Record<string, string>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      next.delete('page')
      router.push(`${pathname}?${next.toString()}`)
    },
    [params, pathname, router],
  )

  React.useEffect(() => {
    if (minAmount === (params.get('minAmount') ?? '')) return
    const t = setTimeout(() => set({ minAmount }), 500)
    return () => clearTimeout(t)
  }, [minAmount, params, set])

  return (
    <>
      <Select
        aria-label="Filter by class"
        className="w-40"
        value={classLevelId}
        onChange={(e) => set({ classLevelId: e.target.value, sectionId: '' })}
      >
        <option value="">All classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </Select>
      <Select
        aria-label="Filter by section"
        className="w-44"
        value={params.get('sectionId') ?? ''}
        disabled={sections.length === 0}
        onChange={(e) => set({ sectionId: e.target.value })}
      >
        <option value="">All sections</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </Select>
      <Select
        aria-label="Filter by how overdue"
        className="w-44"
        value={params.get('age') ?? ''}
        onChange={(e) => set({ age: e.target.value })}
      >
        <option value="">Any due date</option>
        <option value="overdue">Overdue</option>
        <option value="30">Overdue 30+ days</option>
        <option value="60">Overdue 60+ days</option>
        <option value="90">Overdue 90+ days</option>
        <option value="upcoming">Not yet overdue</option>
      </Select>
      <Input
        aria-label="Minimum amount due"
        type="number"
        inputMode="decimal"
        min={0}
        placeholder="Min. due amount"
        className="w-40"
        value={minAmount}
        onChange={(e) => setMinAmount(e.target.value)}
      />
    </>
  )
}

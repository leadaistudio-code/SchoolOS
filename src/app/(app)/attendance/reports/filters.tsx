'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input, Select } from '@/components/ui/input'

type ClassNode = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}

export function ReportFilters({
  classes,
  from,
  to,
}: {
  classes: ClassNode[]
  from: string
  to: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = (mutate: (n: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    router.push(`${pathname}?${next.toString()}`)
  }

  const classId = params.get('classLevelId') ?? ''
  const sections = classes.find((c) => c.id === classId)?.sections ?? []

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
      <Input
        type="date"
        value={from}
        max={to}
        aria-label="From date"
        className="w-40"
        onChange={(e) => push((n) => n.set('from', e.target.value))}
      />
      <span className="text-sm text-ink-subtle">to</span>
      <Input
        type="date"
        value={to}
        min={from}
        aria-label="To date"
        className="w-40"
        onChange={(e) => push((n) => n.set('to', e.target.value))}
      />

      <Select
        value={classId}
        aria-label="Filter by class"
        className="w-40"
        onChange={(e) =>
          push((n) => {
            if (e.target.value) n.set('classLevelId', e.target.value)
            else n.delete('classLevelId')
            n.delete('sectionId')
          })
        }
      >
        <option value="">All classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <Select
        value={params.get('sectionId') ?? ''}
        aria-label="Filter by section"
        className="w-36"
        disabled={!classId}
        onChange={(e) =>
          push((n) => (e.target.value ? n.set('sectionId', e.target.value) : n.delete('sectionId')))
        }
      >
        <option value="">All sections</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            Section {s.name}
          </option>
        ))}
      </Select>
    </div>
  )
}

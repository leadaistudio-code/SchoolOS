'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/input'
import { Input } from '@/components/ui/input'

export type SectionOption = {
  id: string
  name: string
  classLevel: { name: string; numeric: number }
  _count: { enrollments: number }
}

/**
 * Section and date selection. Both live in the URL so a teacher can bookmark
 * their class register and the back button behaves.
 */
export function SectionPicker({
  sections,
  sectionId,
  onDate,
  maxDate,
}: {
  sections: SectionOption[]
  sectionId?: string
  onDate: string
  maxDate: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = (mutate: (n: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
      <Select
        value={sectionId ?? ''}
        aria-label="Select section"
        className="w-56"
        onChange={(e) => push((n) => n.set('sectionId', e.target.value))}
      >
        <option value="">Select a class section</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.classLevel.name} · Section {s.name} ({s._count.enrollments})
          </option>
        ))}
      </Select>

      <Input
        type="date"
        value={onDate}
        max={maxDate}
        aria-label="Attendance date"
        className="w-44"
        onChange={(e) => push((n) => n.set('onDate', e.target.value))}
      />
    </div>
  )
}

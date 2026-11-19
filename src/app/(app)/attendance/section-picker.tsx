'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input, Select } from '@/components/ui/input'
import { SearchBar } from '@/components/search-bar'

export type SectionOption = {
  id: string
  name: string
  classLevel: { name: string; numeric: number }
  _count: { enrollments: number }
}

/**
 * Fees-style filter row for the day register: search, section, date, status.
 * Values live in the URL so a teacher can bookmark their class register.
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

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <SearchBar placeholder="Search student name, roll or admission no.">
      <Select
        value={sectionId ?? ''}
        aria-label="Select section"
        className="w-56"
        onChange={(e) => update({ sectionId: e.target.value })}
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
        className="w-40"
        onChange={(e) => update({ onDate: e.target.value })}
      />

      <Select
        value={params.get('status') ?? ''}
        aria-label="Filter by status"
        className="w-40"
        onChange={(e) => update({ status: e.target.value })}
      >
        <option value="">All statuses</option>
        <option value="unmarked">Unmarked only</option>
        <option value="PRESENT">Present</option>
        <option value="ABSENT">Absent</option>
        <option value="LATE">Late</option>
        <option value="HALF_DAY">Half day</option>
        <option value="LEAVE">Leave</option>
      </Select>
    </SearchBar>
  )
}

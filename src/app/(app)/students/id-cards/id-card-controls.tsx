'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'

type ClassOption = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}

export function IdCardFilters({
  classes,
  classLevelId,
  sectionId,
}: {
  classes: ClassOption[]
  classLevelId: string
  sectionId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const selectedClass = classes.find((item) => item.id === classLevelId)

  const push = (nextClassId: string, nextSectionId = '') => {
    const params = new URLSearchParams()
    if (nextClassId) params.set('class', nextClassId)
    if (nextSectionId) params.set('section', nextSectionId)
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ''}`)
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Select
        value={classLevelId}
        onChange={(event) => push(event.target.value)}
        aria-label="Select class"
        className="w-48"
      >
        <option value="">Select a class</option>
        {classes.map((item) => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </Select>
      <Select
        value={sectionId}
        onChange={(event) => push(classLevelId, event.target.value)}
        aria-label="Select section"
        className="w-48"
        disabled={!selectedClass}
      >
        <option value="">All sections</option>
        {selectedClass?.sections.map((section) => (
          <option key={section.id} value={section.id}>{section.name}</option>
        ))}
      </Select>
    </div>
  )
}

export function PrintIdCardsButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled}
      onClick={() => window.print()}
    >
      <Printer aria-hidden />
      Print ID cards
    </Button>
  )
}

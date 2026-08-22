'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableToolbar } from '@/components/ui/table'
import { BANDS } from '@/lib/score'

/**
 * Filters for the ranked list.
 *
 * In the URL, like every other list in the product: "show me everyone in 8B
 * who needs attention" is a link a principal sends to a class teacher, not a
 * sequence of clicks they describe over the phone.
 */
export function ScoreFilters({
  classes,
}: {
  classes: { id: string; name: string; sections: { id: string; name: string }[] }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, start] = React.useTransition()

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'classLevelId') next.delete('sectionId')
    start(() => router.push(`${pathname}?${next.toString()}`))
  }

  const classId = params.get('classLevelId') ?? ''
  const sections = classes.find((c) => c.id === classId)?.sections ?? []
  const active = ['classLevelId', 'sectionId', 'band'].filter((k) => params.get(k))

  return (
    <TableToolbar>
      <Select
        aria-label="Class"
        value={classId}
        onChange={(e) => set('classLevelId', e.target.value)}
        className="w-auto min-w-32"
      >
        <option value="">All classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Section"
        value={params.get('sectionId') ?? ''}
        disabled={sections.length === 0}
        onChange={(e) => set('sectionId', e.target.value)}
        className="w-auto min-w-28"
      >
        <option value="">All sections</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            Section {s.name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Band"
        value={params.get('band') ?? ''}
        onChange={(e) => set('band', e.target.value)}
        className="w-auto min-w-40"
      >
        <option value="">Every band</option>
        {BANDS.map((b) => (
          <option key={b.band} value={b.band}>
            {b.label}
          </option>
        ))}
      </Select>

      {active.length > 0 ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const next = new URLSearchParams(params.toString())
            active.forEach((k) => next.delete(k))
            start(() => router.push(`${pathname}?${next.toString()}`))
          }}
        >
          <X aria-hidden />
          Clear
        </Button>
      ) : null}
    </TableToolbar>
  )
}

'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { SearchInput, Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableToolbar } from '@/components/ui/table'
import { STUDENT_DOCUMENT_CATEGORIES } from '@/lib/student-documents'

export type DocumentClassOption = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}

const FILTER_KEYS = ['classLevelId', 'sectionId', 'category', 'verified', 'expiry'] as const

/**
 * Filter bar for the document list.
 *
 * Every filter lives in the URL for the same reason the student list does: a
 * registrar chasing expired medical certificates wants to send someone that
 * exact view, not a description of how to reach it.
 */
export function DocumentFilters({
  classes,
  children,
}: {
  classes: DocumentClassOption[]
  /** Upload button, supplied by the page so permission stays a server decision. */
  children?: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [search, setSearch] = React.useState(params.get('q') ?? '')
  const [, startTransition] = React.useTransition()

  const push = React.useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString())
      mutate(next)
      next.delete('page')
      startTransition(() => router.push(`${pathname}?${next.toString()}`))
    },
    [params, pathname, router],
  )

  React.useEffect(() => {
    const current = params.get('q') ?? ''
    if (search === current) return
    const t = setTimeout(() => {
      push((next) => {
        if (search) next.set('q', search)
        else next.delete('q')
      })
    }, 300)
    return () => clearTimeout(t)
  }, [search, params, push])

  const set = (key: string, value: string) =>
    push((next) => {
      if (value) next.set(key, value)
      else next.delete(key)
      // A section belongs to a class; keeping a stale one would filter to
      // nothing without saying why.
      if (key === 'classLevelId') next.delete('sectionId')
    })

  const classId = params.get('classLevelId') ?? ''
  const sections = classes.find((c) => c.id === classId)?.sections ?? []
  const active = FILTER_KEYS.filter((k) => params.get(k))

  return (
    <TableToolbar>
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Student, admission number or document name"
        aria-label="Search documents"
      />

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
        aria-label="Document type"
        value={params.get('category') ?? ''}
        onChange={(e) => set('category', e.target.value)}
        className="w-auto min-w-40"
      >
        <option value="">All types</option>
        {STUDENT_DOCUMENT_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Checked"
        value={params.get('verified') ?? ''}
        onChange={(e) => set('verified', e.target.value)}
        className="w-auto min-w-32"
      >
        <option value="">Checked or not</option>
        <option value="yes">Checked</option>
        <option value="no">Not checked</option>
      </Select>

      <Select
        aria-label="Expiry"
        value={params.get('expiry') ?? ''}
        onChange={(e) => set('expiry', e.target.value)}
        className="w-auto min-w-36"
      >
        <option value="">Any expiry</option>
        <option value="expired">Expired</option>
        <option value="soon">Expiring soon</option>
      </Select>

      {active.length > 0 ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => push((next) => active.forEach((k) => next.delete(k)))}
        >
          <X aria-hidden />
          Clear
        </Button>
      ) : null}

      <div className="ms-auto">{children}</div>
    </TableToolbar>
  )
}

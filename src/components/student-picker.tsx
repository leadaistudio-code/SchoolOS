'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { SearchInput } from '@/components/ui/input'
import { Avatar } from '@/components/ui/identity'

export type StudentHit = {
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  photoUrl?: string | null
  className?: string | null
  sectionName?: string | null
}

/** Name or admission-number search over the student directory. */
export function StudentPicker({
  value,
  onChange,
  placeholder = 'Search by name or admission no.',
  autoFocus,
}: {
  value: StudentHit | null
  onChange: (student: StudentHit | null) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<StudentHit[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (value || query.trim().length < 2) {
      setHits([])
      return
    }
    const controller = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/v1/students?q=${encodeURIComponent(query)}&pageSize=8`, {
          signal: controller.signal,
        })
        const json = await res.json()
        setHits((json.data ?? []) as StudentHit[])
      } catch {
        /* aborted */
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(t)
    }
  }, [query, value])

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 py-2">
        <Avatar firstName={value.firstName} lastName={value.lastName} avatarUrl={value.photoUrl ?? null} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {value.firstName} {value.lastName}
          </p>
          <p className="truncate text-xs text-ink-subtle">
            {value.admissionNo}
            {value.className ? ` · ${value.className}${value.sectionName ? ` - ${value.sectionName}` : ''}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null)
            setQuery('')
          }}
          className="grid size-8 place-items-center rounded-[8px] text-ink-muted hover:bg-surface-2 hover:text-ink"
          aria-label="Change student"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Search student"
      />
      {query.trim().length >= 2 ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-[var(--radius-sm)] border border-line bg-surface py-1 shadow-[var(--shadow-pop)]">
          {hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-subtle">{loading ? 'Searching…' : 'No students found'}</p>
          ) : (
            hits.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s)
                  setHits([])
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2"
              >
                <Avatar firstName={s.firstName} lastName={s.lastName} avatarUrl={s.photoUrl ?? null} className="size-7" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {s.firstName} {s.lastName}
                  </span>
                  <span className="block truncate text-xs text-ink-subtle">
                    {s.admissionNo}
                    {s.className ? ` · ${s.className}${s.sectionName ? ` - ${s.sectionName}` : ''}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

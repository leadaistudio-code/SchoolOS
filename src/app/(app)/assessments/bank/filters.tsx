'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Select } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { QUESTION_TYPE_LABEL } from '@/lib/questions'

/**
 * Bank filters.
 *
 * State lives in the URL rather than in the component, so a filtered bank is a
 * link a teacher can keep — and the page stays a server component that queries
 * once instead of fetching after it renders.
 */
export function BankFilters({
  subjects,
  current,
}: {
  subjects: { id: string; label: string }[]
  current: Record<string, string | undefined>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [text, setText] = React.useState(current.q ?? '')

  const apply = React.useCallback(
    (changes: Record<string, string | undefined>) => {
      const next = new URLSearchParams()
      const merged = { ...current, ...changes, page: undefined }
      for (const [key, value] of Object.entries(merged)) {
        if (value) next.set(key, value)
      }
      router.push(`${pathname}?${next.toString()}`)
    },
    [current, pathname, router],
  )

  const active = Object.entries(current).filter(
    ([key, value]) => value && !['page', 'pageSize', 'sort', 'dir'].includes(key),
  ).length

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      onSubmit={(event) => {
        event.preventDefault()
        apply({ q: text.trim() || undefined })
      }}
    >
      <SearchInput
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search question text"
        aria-label="Search question text"
        className="sm:w-64"
      />

      <Select
        aria-label="Class and subject"
        value={current.classSubjectId ?? ''}
        onChange={(event) => apply({ classSubjectId: event.target.value || undefined })}
      >
        <option value="">All subjects</option>
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.label}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Question type"
        value={current.type ?? ''}
        onChange={(event) => apply({ type: event.target.value || undefined })}
      >
        <option value="">All types</option>
        {Object.entries(QUESTION_TYPE_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Difficulty"
        value={current.difficulty ?? ''}
        onChange={(event) => apply({ difficulty: event.target.value || undefined })}
      >
        <option value="">Any difficulty</option>
        <option value="EASY">Easy</option>
        <option value="MEDIUM">Medium</option>
        <option value="HARD">Hard</option>
      </Select>

      <Select
        aria-label="Status"
        value={current.status ?? ''}
        onChange={(event) => apply({ status: event.target.value || undefined })}
      >
        <option value="">Any status</option>
        <option value="APPROVED">Approved</option>
        <option value="DRAFT">Draft</option>
        <option value="ARCHIVED">Archived</option>
      </Select>

      <Select
        aria-label="Author"
        value={current.mine ?? ''}
        onChange={(event) => apply({ mine: event.target.value || undefined })}
      >
        <option value="">Anyone</option>
        <option value="true">Added by me</option>
      </Select>

      {active > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          Clear {active}
        </Button>
      )}
    </form>
  )
}

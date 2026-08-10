'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { SearchInput, Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableToolbar } from '@/components/ui/table'

export type ClassOption = {
  id: string
  name: string
  sections: { id: string; name: string; capacity: number; _count: { enrollments: number } }[]
}

/**
 * Filter bar.
 *
 * Filters live in the URL, so a filtered view is shareable and bookmarkable,
 * the back button behaves, and the server does the querying. Search is
 * debounced to avoid a request per keystroke.
 */
export function StudentFilters({ classes }: { classes: ClassOption[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [search, setSearch] = React.useState(params.get('q') ?? '')
  const [pending, startTransition] = React.useTransition()

  const push = React.useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString())
      mutate(next)
      next.delete('page') // any filter change returns to the first page
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

  const classId = params.get('classLevelId') ?? ''
  const sections = classes.find((c) => c.id === classId)?.sections ?? []
  const activeFilters = ['classLevelId', 'sectionId', 'status', 'gender', 'hasDues'].filter((k) =>
    params.get(k),
  )

  return (
    <TableToolbar>
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, admission no. or guardian"
        aria-label="Search students"
      />

      <Select
        value={classId}
        aria-label="Filter by class"
        className="w-36"
        onChange={(e) =>
          push((next) => {
            if (e.target.value) next.set('classLevelId', e.target.value)
            else next.delete('classLevelId')
            next.delete('sectionId')
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
          push((next) => {
            if (e.target.value) next.set('sectionId', e.target.value)
            else next.delete('sectionId')
          })
        }
      >
        <option value="">All sections</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            Section {s.name} ({s._count.enrollments}/{s.capacity})
          </option>
        ))}
      </Select>

      <Select
        value={params.get('status') ?? ''}
        aria-label="Filter by status"
        className="w-36"
        onChange={(e) =>
          push((next) => {
            if (e.target.value) next.set('status', e.target.value)
            else next.delete('status')
          })
        }
      >
        <option value="">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="ALUMNI">Alumni</option>
        <option value="TRANSFERRED">Transferred</option>
        <option value="WITHDRAWN">Withdrawn</option>
        <option value="SUSPENDED">Suspended</option>
      </Select>

      <Select
        value={params.get('hasDues') ?? ''}
        aria-label="Filter by fee dues"
        className="w-36"
        onChange={(e) =>
          push((next) => {
            if (e.target.value) next.set('hasDues', e.target.value)
            else next.delete('hasDues')
          })
        }
      >
        <option value="">Any fee status</option>
        <option value="yes">Has dues</option>
        <option value="no">Fully paid</option>
      </Select>

      {activeFilters.length > 0 || search ? (
        <Button
          variant="ghost"
          size="sm"
          loading={pending}
          onClick={() => {
            setSearch('')
            startTransition(() => router.push(pathname))
          }}
        >
          <X aria-hidden />
          Clear
        </Button>
      ) : null}
    </TableToolbar>
  )
}

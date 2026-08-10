'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type ClassNode = { id: string; name: string; sections: { id: string; name: string }[] }

export function HomeworkFilters({
  classes,
  showClassFilter,
}: {
  classes: ClassNode[]
  showClassFilter: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = (mutate: (n: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }

  const classId = params.get('classLevelId') ?? ''
  const sections = classes.find((c) => c.id === classId)?.sections ?? []

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
      <Select
        value={params.get('status') ?? ''}
        aria-label="Filter by due status"
        className="w-40"
        onChange={(e) =>
          push((n) => (e.target.value ? n.set('status', e.target.value) : n.delete('status')))
        }
      >
        <option value="">All homework</option>
        <option value="upcoming">Due soon</option>
        <option value="overdue">Past due</option>
      </Select>

      {showClassFilter ? (
        <>
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
              push((n) =>
                e.target.value ? n.set('sectionId', e.target.value) : n.delete('sectionId'),
              )
            }
          >
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                Section {s.name}
              </option>
            ))}
          </Select>
        </>
      ) : null}

      {params.toString() ? (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          <X aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}

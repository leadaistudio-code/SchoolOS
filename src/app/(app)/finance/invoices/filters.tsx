'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/input'

type ClassNode = { id: string; name: string; sections: { id: string; name: string }[] }

export function InvoiceFilters({ classes }: { classes: ClassNode[] }) {
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
    <>
      <Select
        value={params.get('status') ?? ''}
        aria-label="Filter by status"
        className="w-40"
        onChange={(e) =>
          push((n) => (e.target.value ? n.set('status', e.target.value) : n.delete('status')))
        }
      >
        <option value="">All statuses</option>
        <option value="ISSUED">Issued</option>
        <option value="PARTIALLY_PAID">Partly paid</option>
        <option value="PAID">Paid</option>
        <option value="OVERDUE">Overdue</option>
        <option value="CANCELLED">Cancelled</option>
      </Select>

      <Select
        value={classId}
        aria-label="Filter by class"
        className="w-36"
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
        className="w-32"
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
  )
}

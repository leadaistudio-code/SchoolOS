'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export function LeaveFilters({ canApprove }: { canApprove: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = (mutate: (n: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }

  const hasFilters = ['status', 'applicantType'].some((k) => params.get(k))

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
      <Select
        value={params.get('status') ?? ''}
        aria-label="Filter by status"
        className="w-40"
        onChange={(e) =>
          push((n) => (e.target.value ? n.set('status', e.target.value) : n.delete('status')))
        }
      >
        <option value="">All statuses</option>
        <option value="PENDING">Pending</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
        <option value="CANCELLED">Cancelled</option>
      </Select>

      {canApprove ? (
        <Select
          value={params.get('applicantType') ?? ''}
          aria-label="Filter by applicant"
          className="w-40"
          onChange={(e) =>
            push((n) =>
              e.target.value ? n.set('applicantType', e.target.value) : n.delete('applicantType'),
            )
          }
        >
          <option value="">Students and staff</option>
          <option value="STUDENT">Students</option>
          <option value="STAFF">Staff</option>
        </Select>
      ) : null}

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          <X className="size-4" aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}

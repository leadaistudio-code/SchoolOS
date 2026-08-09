'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export function Pagination({
  total,
  page,
  pageSize,
  label,
}: {
  total: number
  page: number
  pageSize: number
  label: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null

  const goto = (next: number) => {
    const p = new URLSearchParams(params.toString())
    p.set('page', String(next))
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-line">
      <p className="text-[12.5px] text-ink-muted">
        Showing <span className="tnum">{(page - 1) * pageSize + 1}</span>–
        <span className="tnum">{Math.min(page * pageSize, total)}</span> of{' '}
        <span className="tnum">{total}</span> {label}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          disabled={page <= 1}
          onClick={() => goto(page - 1)}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'disabled:opacity-45')}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </button>
        <span className="text-[12.5px] text-ink-muted px-2 tnum">
          {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => goto(page + 1)}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'disabled:opacity-45')}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}

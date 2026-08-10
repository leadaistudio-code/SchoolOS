'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

/**
 * List pagination.
 *
 * The page lives in the URL so a position is shareable and the back button
 * behaves. The count is stated in full — an administrator reconciling a roll
 * needs the total, not just the arrows.
 */
export function Pagination({
  total,
  page,
  pageSize,
  label,
  onNavigate,
}: {
  total: number
  page: number
  pageSize: number
  label: string
  /** Overrides URL navigation where the caller owns the query state. */
  onNavigate?: (page: number) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null

  const goto = (next: number) => {
    if (onNavigate) return onNavigate(next)
    const p = new URLSearchParams(params.toString())
    p.set('page', String(next))
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-line">
      <p className="text-xs text-ink-subtle">
        <span className="tnum">{(page - 1) * pageSize + 1}</span>–
        <span className="tnum">{Math.min(page * pageSize, total)}</span> of{' '}
        <span className="tnum text-ink-muted font-medium">{total}</span> {label}
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => goto(page - 1)}
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          aria-label="Previous page"
        >
          <ChevronLeft aria-hidden />
          Previous
        </button>
        <span className="text-xs text-ink-subtle px-2 tnum">
          {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => goto(page + 1)}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
          aria-label="Next page"
        >
          Next
          <ChevronRight aria-hidden />
        </button>
      </div>
    </div>
  )
}

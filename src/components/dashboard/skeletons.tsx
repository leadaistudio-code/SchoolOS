import * as React from 'react'
import { Skeleton } from '@/components/ui/states'

/**
 * Loading states.
 *
 * Each skeleton matches the dimensions of the thing it stands in for, so the
 * page does not jump when the data lands. A skeleton that is the wrong height
 * is worse than a blank space: it promises a layout it will not deliver.
 */

export function StatCardSkeleton() {
  return (
    <div className="widget p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2.5 h-7 w-20" />
        </div>
        <Skeleton className="size-10 rounded-[12px]" />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  )
}

export function WidgetSkeleton({ bodyHeight = 200 }: { bodyHeight?: number }) {
  return (
    <div className="widget overflow-hidden">
      <div className="flex min-h-[52px] items-center justify-between border-b border-line px-4 py-2.5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="p-4" style={{ height: bodyHeight + 32 }}>
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  )
}

export function ListWidgetSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="widget overflow-hidden">
      <div className="flex min-h-[52px] items-center justify-between border-b border-line px-4 py-2.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-14" />
      </div>
      <ul className="divide-y divide-[var(--border)] px-4">
        {Array.from({ length: rows }).map((_, index) => (
          <li key={index} className="flex items-center gap-3 py-2.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="mt-1.5 h-2.5 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The whole page, for the Suspense boundary around the dashboard. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading dashboard">
      <Skeleton className="h-[136px] rounded-[var(--radius-lg)]" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <WidgetSkeleton bodyHeight={300} />
        <WidgetSkeleton bodyHeight={190} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <ListWidgetSkeleton />
        <WidgetSkeleton bodyHeight={230} />
        <ListWidgetSkeleton rows={4} />
      </div>
    </div>
  )
}

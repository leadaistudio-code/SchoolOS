import { Skeleton } from '@/components/ui/states'

export default function InboxLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Opening the mailbox">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Skeleton className="h-64 w-full" />
        <div className="space-y-2 rounded-[var(--radius-md,10px)] border border-line bg-surface p-3">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

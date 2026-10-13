import { Skeleton } from '@/components/ui/states'

export default function MessageLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Opening the message">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-9 w-full" />
      <div className="space-y-4 rounded-[var(--radius-md,10px)] border border-line bg-surface p-5">
        <Skeleton className="h-6 w-2/3" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-[50vh] w-full" />
      </div>
    </div>
  )
}

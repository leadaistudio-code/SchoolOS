import * as React from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 mb-5', className)}>
      <div className="min-w-0">
        <h1 className="text-[19px] sm:text-[21px] font-bold text-ink tracking-tight">{title}</h1>
        {description ? <p className="text-[12.5px] text-ink-muted mt-0.5">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  )
}

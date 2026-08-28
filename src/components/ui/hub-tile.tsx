import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Icon } from '@/components/shell/icon'
import { seriesToneClass, type SeriesKey } from '@/lib/chart-tones'
import { cn } from '@/lib/utils'

export type HubTileProps = {
  href: string
  title: string
  description: string
  icon: string
  tone: SeriesKey
}

/**
 * A navigation tile with a tinted icon — same language as dashboard quick actions,
 * sized for settings hubs and report grids.
 */
export function HubTile({ href, title, description, icon, tone }: HubTileProps) {
  return (
    <Link
      href={href}
      className="widget lift group flex h-full gap-3 p-4 transition-colors hover:bg-surface-2/80"
    >
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-[12px] transition-transform duration-150 group-hover:scale-105',
          seriesToneClass(tone),
        )}
        aria-hidden
      >
        <Icon name={icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-base font-medium text-ink">
          {title}
          <ArrowRight
            className="size-3.5 text-ink-subtle transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
        <span className="mt-0.5 block text-sm text-ink-muted">{description}</span>
      </span>
    </Link>
  )
}

export function HubTileGrid({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

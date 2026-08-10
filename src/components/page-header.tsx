import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type Crumb = { label: string; href?: string }

/**
 * Page header.
 *
 * Title, one line of context that carries real information (counts, dates,
 * identifiers — not a description of what the page is for), and the primary
 * action. Breadcrumbs appear only where a page sits inside a record or a
 * multi-level module.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: {
  title: string
  /**
   * One line of factual context — counts, session, identifiers, dates. Not a
   * description of what the page does.
   */
  description?: React.ReactNode
  breadcrumbs?: Crumb[]
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4', className)}>
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-1.5">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
            {breadcrumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <span aria-hidden>/</span> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-ink truncate">{title}</h1>
          {description ? <p className="text-sm text-ink-muted mt-0.5">{description}</p> : null}
        </div>
        {actions ? (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>
    </div>
  )
}

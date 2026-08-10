import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageHeader, type Crumb } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/shell/icon'
import { UnderConstructionScene } from '@/components/illustrations/school-scene'

export type PlaceholderLink = { label: string; href: string; description?: string }

/**
 * A destination whose module is not built yet.
 *
 * The navigation lists these because the shape of the product is a promise
 * worth showing; landing on a 404 is not. So the page says plainly what is
 * coming, which release phase owns it, and — where the answer exists today —
 * points at the screen that does part of the job now.
 *
 * It is deliberately not a fake module: no empty tables, no disabled toolbar,
 * nothing that could be mistaken for a feature that is merely broken.
 */
export function ModulePlaceholder({
  title,
  icon,
  phase,
  summary,
  planned,
  related,
  breadcrumbs,
}: {
  title: string
  icon: string
  /** Roadmap phase that delivers this, e.g. "Phase 6 — Operations". */
  phase: string
  summary: string
  /** What the finished module will do. Concrete, not marketing. */
  planned: string[]
  /** Screens that already do part of this job. */
  related?: PlaceholderLink[]
  breadcrumbs?: Crumb[]
}) {
  return (
    <div>
      <PageHeader
        title={title}
        description={phase}
        breadcrumbs={breadcrumbs}
        actions={<Badge tone="warning">Not built yet</Badge>}
      />

      <Card className="overflow-hidden">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-center">
          <div className="min-w-0">
            <span className="mb-3 inline-flex size-11 items-center justify-center rounded-[var(--radius)] bg-[var(--product-50)] text-[var(--product-600)]">
              <Icon name={icon} className="size-5" />
            </span>

            <h2 className="text-xl font-semibold text-ink">{title} is on the way</h2>
            <p className="mt-1.5 max-w-xl text-base text-ink-muted">{summary}</p>

            <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
              {planned.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-ink-muted">
                  <span
                    className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--product-500)]"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>

            {related?.length ? (
              <div className="mt-6 border-t border-line pt-4">
                <p className="caption mb-2">Available now</p>
                <div className="flex flex-wrap gap-2">
                  {related.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="lift group flex items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <span>
                        {link.label}
                        {link.description ? (
                          <span className="block text-xs text-ink-subtle">{link.description}</span>
                        ) : null}
                      </span>
                      <ArrowRight
                        className="size-3.5 text-ink-subtle transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <UnderConstructionScene className="mx-auto w-full max-w-56" />
        </div>
      </Card>
    </div>
  )
}

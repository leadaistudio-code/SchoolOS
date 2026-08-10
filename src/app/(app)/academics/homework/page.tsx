import Link from 'next/link'
import { Paperclip, Plus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listHomework, homeworkFilterSchema } from '@/server/modules/homework/service'
import { getClassTree } from '@/server/modules/academics/service'
import { parseListQuery } from '@/lib/query'
import { formatDay } from '@/lib/dates'
import { isSelfScoped } from '@/lib/rbac/roles'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { buttonVariants } from '@/components/ui/button-variants'
import { HomeworkFilters } from './filters'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Homework' }

export default async function HomeworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('homework.view')
  const params = await searchParams

  const query = parseListQuery(params)
  const filter = homeworkFilterSchema.parse(params)
  const [{ rows, total }, classes] = await Promise.all([
    listHomework(ctx, query, filter),
    getClassTree(ctx),
  ])

  const portalView = isSelfScoped(ctx.user.roleKeys)

  return (
    <div>
      <PageHeader
        title="Homework"
        description={`${total} assignment${total === 1 ? '' : 's'}`}
        actions={
          ctx.can('homework.create') ? (
            <Link href="/academics/homework/new" className={buttonVariants({ size: 'sm' })}>
              <Plus aria-hidden />
              Set homework
            </Link>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <HomeworkFilters classes={classes} showClassFilter={!portalView} />

        {rows.length === 0 ? (
          <EmptyState
            title={Object.keys(params).length ? 'Nothing matches these filters' : 'No homework yet'}
            description={
              ctx.can('homework.create')
                ? 'Set homework for a class and it will appear here with submission progress.'
                : 'Homework set by your teachers will appear here.'
            }
            action={
              ctx.can('homework.create') ? (
                <Link href="/academics/homework/new" className={buttonVariants({ size: 'sm' })}>
                  Set homework
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-[var(--border)]">
              {rows.map((h) => {
                const progress = h.expected > 0 ? Math.round((h.submitted / h.expected) * 100) : 0
                const mine = h.mySubmission
                const done = mine?.status === 'SUBMITTED' || mine?.status === 'REVIEWED'

                return (
                  <li key={h.id} className="p-4 hover:bg-surface-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/academics/homework/${h.id}`}
                          className="text-base font-medium text-ink hover:text-[var(--brand-600)]"
                        >
                          {h.title}
                        </Link>
                        <p className="text-xs text-ink-subtle mt-0.5">
                          {h.subject} · {h.className}
                          {h.sectionName ? ` ${h.sectionName}` : ''} · {h.teacher}
                          {h.attachmentCount > 0 ? (
                            <span className="inline-flex items-center gap-1 ml-1.5">
                              <Paperclip className="size-3" aria-hidden />
                              {h.attachmentCount}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-ink-muted mt-1">
                          Set {formatDay(h.assignedOn, 'd MMM')} · due{' '}
                          <span className={cn(h.isOverdue && 'text-[var(--danger)] font-medium')}>
                            {formatDay(h.dueOn, 'd MMM yyyy')}
                          </span>
                          {h.maxScore ? ` · out of ${h.maxScore}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!h.isPublished ? <Badge tone="neutral">draft</Badge> : null}

                        {portalView ? (
                          <Badge tone={done ? 'success' : h.isOverdue ? 'danger' : 'warning'}>
                            {mine?.status?.toLowerCase() ?? 'pending'}
                            {mine?.score !== null && mine?.score !== undefined
                              ? ` · ${mine.score}${h.maxScore ? `/${h.maxScore}` : ''}`
                              : ''}
                          </Badge>
                        ) : (
                          <div className="text-right">
                            <p className="text-xs text-ink-muted tnum">
                              {h.submitted}/{h.expected} handed in
                            </p>
                            {/* Progress bar: the question a teacher is scanning
                                this list to answer. */}
                            <div className="h-1.5 w-28 rounded-full bg-surface-2 mt-1 overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  progress >= 90
                                    ? 'bg-[var(--success)]'
                                    : progress >= 50
                                      ? 'bg-[var(--brand-500)]'
                                      : 'bg-[var(--warning)]',
                                )}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
            <Pagination
              total={total}
              page={query.page}
              pageSize={query.pageSize}
              label="homework items"
            />
          </>
        )}
      </Card>
    </div>
  )
}

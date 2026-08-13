import { requireContext } from '@/server/context'
import { listClasswork } from '@/server/modules/academics/content-service'
import { teachableSubjects } from '@/server/modules/homework/service'
import { parseListQuery } from '@/lib/query'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { LogClassworkButton } from './log-classwork'

export const metadata = { title: 'Classwork' }

export default async function ClassworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('classwork.view')
  const params = await searchParams
  const query = parseListQuery(params)

  const canLog = ctx.can('classwork.create')

  const [{ rows, total }, subjects] = await Promise.all([
    listClasswork(ctx, query, {
      classLevelId: params.classLevelId,
      sectionId: params.sectionId,
      subjectId: params.subjectId,
    }),
    canLog ? teachableSubjects(ctx) : Promise.resolve([]),
  ])

  const teachable = subjects.map((s) => ({
    id: s.id,
    label: `${s.classLevel.name} · ${s.subject.name}`,
    sections: s.classLevel.sections,
  }))

  // Group by day: a lesson log reads as a diary, not a table.
  const byDate = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = formatDay(row.onDate, 'yyyy-MM-dd')
    byDate.set(key, [...(byDate.get(key) ?? []), row])
  }

  return (
    <div>
      <PageHeader
        title="Classwork"
        description={`${total} lessons logged`}
        actions={canLog ? <LogClassworkButton subjects={teachable} /> : null}
      />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search topic or notes" />

        {rows.length === 0 ? (
          <EmptyState
            title={params.q ? 'Nothing matches that search' : 'No classwork logged'}
            description={
              canLog && teachable.length === 0
                ? 'Assign a subject to a class under Subjects first — a lesson log hangs off that pairing.'
                : 'Teachers record the topic covered in each lesson here. Parents of the class can read it.'
            }
            action={
              canLog && teachable.length > 0 && !params.q ? (
                <LogClassworkButton subjects={teachable} label="Log the first lesson" />
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="divide-y divide-[var(--border)]">
              {[...byDate.entries()].map(([date, items]) => (
                <div key={date} className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">
                    {formatDay(items[0]!.onDate, 'EEEE, d MMMM yyyy')}
                  </p>
                  <ul className="space-y-3">
                    {items.map((c) => (
                      <li key={c.id} className="flex gap-3">
                        <span className="w-1 rounded-full bg-[var(--brand-500)] shrink-0" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-base font-medium text-ink">{c.topic}</p>
                          <p className="text-xs text-ink-subtle">
                            {c.subject} · {c.className}
                            {c.sectionName ? ` ${c.sectionName}` : ''} · {c.teacher}
                          </p>
                          {c.notes ? (
                            <p className="text-sm text-ink-muted mt-1 whitespace-pre-wrap">
                              {c.notes}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <Pagination
              total={total}
              page={query.page}
              pageSize={query.pageSize}
              label="lessons"
            />
          </>
        )}
      </Card>
    </div>
  )
}

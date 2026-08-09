import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getClassTree } from '@/server/modules/academics/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Classes & sections' }

export default async function ClassesPage() {
  const ctx = await requireContext('academics.view')
  const classes = await getClassTree(ctx)

  const totalStudents = classes.reduce(
    (sum, c) => sum + c.sections.reduce((s, sec) => s + sec._count.enrollments, 0),
    0,
  )

  return (
    <div>
      <PageHeader
        title="Classes & sections"
        description={`${classes.length} classes · ${totalStudents} enrolled students in the current session`}
      />

      {classes.length === 0 ? (
        <Card>
          <EmptyState
            title="No classes yet"
            description="Create an academic session and its classes in Settings to begin."
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const enrolled = c.sections.reduce((s, sec) => s + sec._count.enrollments, 0)
            const capacity = c.sections.reduce((s, sec) => s + sec.capacity, 0)

            return (
              <Card key={c.id}>
                <CardHeader>
                  <div>
                    <CardTitle>{c.name}</CardTitle>
                    <p className="text-[13px] text-ink-muted mt-0.5">
                      {enrolled}/{capacity} seats · {c._count.subjects} subjects
                    </p>
                  </div>
                  {c.stream ? <Badge tone="neutral">{c.stream}</Badge> : null}
                </CardHeader>
                <CardContent className="pt-0">
                  {c.sections.length === 0 ? (
                    <p className="text-[13px] text-ink-subtle">No sections</p>
                  ) : (
                    <ul className="space-y-2">
                      {c.sections.map((s) => {
                        const full = s._count.enrollments >= s.capacity
                        const pct = Math.min(
                          100,
                          Math.round((s._count.enrollments / s.capacity) * 100),
                        )
                        return (
                          <li key={s.id}>
                            <div className="flex items-center justify-between gap-2">
                              <Link
                                href={`/students?classLevelId=${c.id}&sectionId=${s.id}`}
                                className="text-[13.5px] text-ink hover:text-[var(--brand-600)]"
                              >
                                Section {s.name}
                              </Link>
                              <span
                                className={cn(
                                  'text-[12.5px] tnum',
                                  full ? 'text-[var(--danger)] font-medium' : 'text-ink-muted',
                                )}
                              >
                                {s._count.enrollments}/{s.capacity}
                              </span>
                            </div>
                            {/* Occupancy bar: capacity pressure is the thing an
                                admin is scanning for on this page. */}
                            <div className="h-1.5 rounded-full bg-surface-2 mt-1 overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  full
                                    ? 'bg-[var(--danger)]'
                                    : pct > 85
                                      ? 'bg-[var(--warning)]'
                                      : 'bg-[var(--brand-500)]',
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-[11.5px] text-ink-subtle mt-0.5">
                              {s.classTeacher
                                ? `${s.classTeacher.firstName} ${s.classTeacher.lastName}`
                                : 'No class teacher'}
                              {s.roomName ? ` · ${s.roomName}` : ''}
                            </p>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

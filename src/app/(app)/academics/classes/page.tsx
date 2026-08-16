import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getClassTree } from '@/server/modules/academics/service'
import { teacherOptions } from '@/server/modules/people/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import { AddSectionButton, EditClassButton, EditSectionButton, NewClassButton } from './class-forms'

export const metadata = { title: 'Classes & sections' }

/**
 * Sections are named A, B, C… almost everywhere, so the dialog opens with the
 * next free letter rather than a blank field. Anything already using its own
 * scheme falls back to a blank, which is better than proposing a name that
 * does not fit the school's convention.
 */
function nextSectionName(existing: string[]): string {
  const letters = existing.filter((name) => /^[A-Z]$/i.test(name)).map((n) => n.toUpperCase())
  if (existing.length > 0 && letters.length !== existing.length) return ''

  for (let i = 0; i < 26; i += 1) {
    const candidate = String.fromCharCode(65 + i)
    if (!letters.includes(candidate)) return candidate
  }
  return ''
}

export default async function ClassesPage() {
  const ctx = await requireContext('academics.view')
  const canManage = ctx.can('academics.manage')

  const [classes, teachers] = await Promise.all([
    getClassTree(ctx),
    canManage ? teacherOptions(ctx) : Promise.resolve([]),
  ])

  const totalStudents = classes.reduce(
    (sum, c) => sum + c.sections.reduce((s, sec) => s + sec._count.enrollments, 0),
    0,
  )

  // The ladder position a new class would take: one above the highest in use,
  // capped at the schema's ceiling.
  const nextNumeric = Math.min(20, classes.reduce((max, c) => Math.max(max, c.numeric), -1) + 1)

  return (
    <div>
      <PageHeader
        title="Classes & sections"
        description={`${classes.length} classes · ${totalStudents} enrolled students in the current session`}
        actions={canManage ? <NewClassButton nextNumeric={nextNumeric} /> : null}
      />

      {classes.length === 0 ? (
        <Card>
          <EmptyState
            title="No classes yet"
            description={
              canManage
                ? 'Add the classes this school runs, then give each one its sections. Attendance, timetables and fees all read from this tree.'
                : 'Nobody has set up classes for the current session yet. An administrator can add them here.'
            }
            action={canManage ? <NewClassButton nextNumeric={0} label="Create the first class" /> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const enrolled = c.sections.reduce((s, sec) => s + sec._count.enrollments, 0)
            const capacity = c.sections.reduce((s, sec) => s + sec.capacity, 0)

            return (
              <Card key={c.id} className="flex flex-col">
                <CardHeader>
                  <div>
                    <CardTitle>{c.name}</CardTitle>
                    <p className="text-sm text-ink-muted mt-0.5">
                      {enrolled}/{capacity} seats · {c._count.subjects} subjects
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.stream ? <Badge tone="neutral">{c.stream}</Badge> : null}
                    {canManage ? (
                      <EditClassButton
                        id={c.id}
                        name={c.name}
                        numeric={c.numeric}
                        stream={c.stream}
                      />
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="py-1 flex-1">
                  {c.sections.length === 0 ? (
                    <p className="text-sm text-ink-subtle">
                      No sections — students cannot be enrolled until there is one.
                    </p>
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
                                className="text-sm text-ink hover:text-[var(--brand-600)]"
                              >
                                Section {s.name}
                              </Link>
                              <span className="flex items-center gap-1 shrink-0">
                                <span
                                  className={cn(
                                    'text-xs tnum',
                                    full ? 'text-[var(--danger)] font-medium' : 'text-ink-muted',
                                  )}
                                >
                                  {s._count.enrollments}/{s.capacity}
                                </span>
                                {canManage ? (
                                  <EditSectionButton
                                    id={s.id}
                                    classLabel={c.name}
                                    name={s.name}
                                    capacity={s.capacity}
                                    roomName={s.roomName}
                                    classTeacherId={s.classTeacher?.id ?? null}
                                    enrolled={s._count.enrollments}
                                    teachers={teachers}
                                  />
                                ) : null}
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
                            <p className="text-xs text-ink-subtle mt-0.5">
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

                {canManage ? (
                  <CardFooter className="mt-3">
                    <AddSectionButton
                      classLevelId={c.id}
                      classLabel={c.name}
                      teachers={teachers}
                      suggestedName={nextSectionName(c.sections.map((s) => s.name))}
                    />
                  </CardFooter>
                ) : null}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

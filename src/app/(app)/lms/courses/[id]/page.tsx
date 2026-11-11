import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Eye, Pencil } from 'lucide-react'
import { requireLms } from '@/server/modules/lms/access'
import { classOptions, courseAssignments, courseProgress } from '@/server/modules/lms/school'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { Metric } from '@/components/ui/metric'
import { Progress } from '@/components/ui/progress'
import { LinkTabs } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { CourseOutline } from '@/components/lms/course-outline'
import { LessonText } from '@/components/lms/lesson-text'
import { gradeRange, lmsCategory, lmsLevelLabel } from '@/lib/lms/options'
import { AssignPanel } from './assign-panel'

export const metadata = { title: 'Course · Robotics & AI' }

const shortDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

export default async function LmsCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; class?: string }>
}) {
  const ctx = await requireLms('lms.view')
  const [{ id }, query] = await Promise.all([params, searchParams])
  const progress = await courseProgress(ctx, id).catch(() => null)
  if (!progress) notFound()
  const { course, rows, totals } = progress
  const [assignments, classes] = await Promise.all([courseAssignments(ctx, id), classOptions(ctx)])

  const own = course.tenantId === ctx.tenant.id
  const canManage = ctx.can('lms.manage')
  const lessons = course.modules.flatMap((m) => m.lessons)
  const minutes = lessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0)
  const category = lmsCategory(course.category)
  const grades = gradeRange(course.gradeFrom, course.gradeTo)
  const tab = query.tab === 'outline' ? 'outline' : 'progress'
  const classNames = [...new Set(rows.map((r) => r.className).filter(Boolean))]
  const visibleRows = query.class ? rows.filter((r) => r.className === query.class) : rows
  const firstLesson = lessons[0]

  return (
    <div className="space-y-4">
      <PageHeader
        title={course.title}
        description={
          <>
            {category.label} · {lmsLevelLabel(course.level)}
            {grades ? ` · ${grades}` : ''} · {lessons.length} lessons{minutes ? ` · about ${minutes} min` : ''}
            {own ? ' · Your school\u2019s course' : ' · MyCampusView library'}
          </>
        }
        breadcrumbs={[{ label: 'Robotics & AI', href: '/lms' }, { label: course.title }]}
        actions={
          <>
            {firstLesson ? (
              <Link href={`/lms/courses/${id}/preview/${firstLesson.id}`} className={buttonVariants({ variant: 'secondary' })}>
                <Eye /> Preview as student
              </Link>
            ) : null}
            {own && canManage ? (
              <Link href={`/lms/courses/${id}/edit`} className={buttonVariants({ variant: 'primary' })}>
                <Pencil /> Edit course
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Who can take it</CardTitle>
            {own ? <StatusBadge status={course.status} /> : null}
          </CardHeader>
          <CardContent>
            <AssignPanel
              courseId={id}
              published={course.status === 'PUBLISHED'}
              assignments={assignments}
              classes={classes}
              canManage={canManage}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid grid-cols-3 gap-3">
            <Metric label="Students" value={String(totals.students)} />
            <Metric label="Started" value={String(totals.started)} />
            <Metric label="Finished" value={String(totals.completed)} sub={totals.students ? `avg ${totals.averagePercent}%` : undefined} />
          </CardContent>
        </Card>
      </div>

      {course.subtitle || course.description || course.outcomes.length ? (
        <Card>
          <CardContent className="space-y-3">
            {course.subtitle ? <p className="text-base font-medium text-ink">{course.subtitle}</p> : null}
            {course.description ? <LessonText text={course.description} /> : null}
            {course.outcomes.length ? (
              <div>
                <p className="text-sm font-semibold text-ink">Students will learn to</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink">
                  {course.outcomes.map((o) => <li key={o}>{o}</li>)}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <LinkTabs
        label="Course sections"
        items={[
          { label: 'Student progress', href: `/lms/courses/${id}`, active: tab === 'progress', count: rows.length },
          { label: 'Lessons', href: `/lms/courses/${id}?tab=outline`, active: tab === 'outline', count: lessons.length },
        ]}
      />

      {tab === 'outline' ? (
        <CourseOutline modules={course.modules} lessonHref={(lessonId) => `/lms/courses/${id}/preview/${lessonId}`} />
      ) : (
        <Card className="overflow-hidden">
          {classNames.length > 1 ? (
            <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
              {[{ label: 'All classes', value: '' }, ...classNames.map((c) => ({ label: c, value: c }))].map((c) => (
                <Link
                  key={c.label}
                  href={`/lms/courses/${id}${c.value ? `?class=${encodeURIComponent(c.value)}` : ''}`}
                  className={buttonVariants({ variant: (query.class ?? '') === c.value ? 'subtle' : 'ghost', size: 'sm' })}
                >
                  {c.label}
                </Link>
              ))}
            </div>
          ) : null}
          {visibleRows.length === 0 ? (
            <EmptyState
              title="No students yet"
              description="Open the course to a class and its students appear here with their progress."
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Student</TH>
                    <TH>Class</TH>
                    <TH className="w-56">Progress</TH>
                    <TH align="right">Quiz average</TH>
                    <TH align="right">Last active</TH>
                  </tr>
                </THead>
                <TBody>
                  {visibleRows.map((r) => (
                    <TR key={r.studentId}>
                      <TD>
                        <p className="font-medium text-ink">{r.name}</p>
                        <p className="text-xs text-ink-subtle">{r.admissionNo}</p>
                      </TD>
                      <TD>
                        {r.className}
                        {r.sectionName ? ` – ${r.sectionName}` : ''}
                      </TD>
                      <TD>
                        {r.started ? (
                          <div className="flex items-center gap-2">
                            <Progress value={r.percent} tone={r.completedAt ? 'success' : 'brand'} />
                            <span className="w-16 text-right text-xs tnum">
                              {r.completed}/{r.total}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-subtle">Not started</span>
                        )}
                      </TD>
                      <TD align="right">{r.quizAverage !== null ? `${r.quizAverage}%` : '—'}</TD>
                      <TD align="right">
                        {r.completedAt ? (
                          <span className="text-success">Finished {shortDate(r.completedAt)}</span>
                        ) : r.lastActivityAt ? (
                          shortDate(r.lastActivityAt)
                        ) : (
                          '—'
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      )}
    </div>
  )
}

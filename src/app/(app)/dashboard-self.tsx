import Link from 'next/link'
import { formatDay } from '@/lib/dates'
import { format, subDays } from 'date-fns'
import { requireContext } from '@/server/context'
import { scopedStudents } from '@/server/scope'
import { PageHeader } from '@/components/page-header'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'
import { PersonCell } from '@/components/ui/identity'
import { ChildSwitcher } from '@/components/dashboard/child-switcher'

/**
 * Student and parent home.
 *
 * A parent has one account for all their children and switches between them
 * here; every figure below is recomputed for the selected child, and the list
 * of children comes from the scoping layer rather than from a query string.
 */
export async function SelfDashboard({ childId }: { childId?: string } = {}) {
  const ctx = await requireContext('dashboard.view')
  const children = await scopedStudents(ctx)

  if (children.length === 0) {
    return (
      <EmptyState
        title="No student linked to this account"
        description="Your account is not linked to a student record yet. Please contact the school office."
      />
    )
  }

  const active = children.find((c) => c.id === childId) ?? children[0]!
  const today = new Date()

  const [attendanceRows, invoices, homework, notices, results] = await Promise.all([
    ctx.db.studentAttendance.groupBy({
      by: ['status'],
      where: { studentId: active.id, onDate: { gte: subDays(today, 30) } },
      _count: { _all: true },
    }),
    ctx.db.feeInvoice.findMany({
      where: { studentId: active.id, status: { notIn: ['CANCELLED', 'DRAFT'] } },
      orderBy: { dueOn: 'asc' },
      take: 5,
      select: {
        id: true,
        number: true,
        title: true,
        dueOn: true,
        totalMinor: true,
        balanceMinor: true,
      },
    }),
    ctx.db.homework.findMany({
      where: {
        isPublished: true,
        deletedAt: null,
        dueOn: { gte: subDays(today, 3) },
        classLevel: { enrollments: { some: { studentId: active.id, isCurrent: true } } },
      },
      orderBy: { dueOn: 'asc' },
      take: 5,
      select: {
        id: true,
        title: true,
        dueOn: true,
        classSubject: { select: { subject: { select: { name: true } } } },
        submissions: { where: { studentId: active.id }, select: { status: true }, take: 1 },
      },
    }),
    ctx.db.notice.findMany({
      where: { isPublished: true, deletedAt: null, publishOn: { lte: today } },
      orderBy: [{ pinned: 'desc' }, { publishOn: 'desc' }],
      take: 5,
      select: { id: true, title: true, publishOn: true },
    }),
    ctx.db.result.findMany({
      where: { studentId: active.id, publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: { id: true, percentage: true, exam: { select: { name: true } } },
    }),
  ])

  const counts = Object.fromEntries(
    attendanceRows.map((r) => [r.status, r._count._all]),
  ) as Record<string, number | undefined>
  const present = (counts.PRESENT ?? 0) + (counts.LATE ?? 0) + (counts.HALF_DAY ?? 0)
  const totalMarked = attendanceRows.reduce((sum, r) => sum + r._count._all, 0)
  const attendancePct = totalMarked ? Math.round((present / totalMarked) * 1000) / 10 : null

  const dueMinor = invoices.reduce((sum, i) => sum + i.balanceMinor, 0)
  const nextDue = invoices.find((i) => i.balanceMinor > 0)
  const pendingHomework = homework.filter(
    (h) => h.submissions[0]?.status !== 'SUBMITTED' && h.submissions[0]?.status !== 'REVIEWED',
  ).length

  return (
    <div className="space-y-4">
      <PageHeader title="Overview" description={format(today, 'EEEE d MMMM yyyy')} />

      {children.length > 1 ? <ChildSwitcher students={children} activeId={active.id} /> : null}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <PersonCell
            firstName={active.firstName}
            lastName={active.lastName}
            secondary={`Admission no. ${active.admissionNo}`}
            avatarUrl={active.photoUrl}
          />
          <span className="text-sm text-ink-muted">
            {active.className ?? 'Class not assigned'}
            {active.sectionName ? ` · Section ${active.sectionName}` : ''}
            {active.rollNumber ? ` · Roll ${active.rollNumber}` : ''}
          </span>
          <Link
            href={`/students/${active.id}`}
            className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} ml-auto shrink-0`}
          >
            View profile
          </Link>
        </CardContent>
      </Card>

      <MetricRow>
        <Metric
          label="Attendance, last 30 days"
          value={attendancePct === null ? 'No data' : `${attendancePct}%`}
          sub={totalMarked ? `${present} of ${totalMarked} days present` : 'Not marked yet'}
          emphasis={attendancePct !== null && attendancePct < 75 ? 'warning' : undefined}
          href="/attendance"
        />
        <Metric
          label="Fees due"
          value={formatMoney(dueMinor, ctx.tenant.currency)}
          sub={nextDue ? `Next due ${formatDay(nextDue.dueOn, 'd MMM yyyy')}` : 'All cleared'}
          emphasis={dueMinor > 0 ? 'danger' : undefined}
          href="/finance"
        />
        <Metric
          label="Homework pending"
          value={String(pendingHomework)}
          sub={`${homework.length} assigned recently`}
          href="/academics/homework"
        />
        <Metric
          label="Latest result"
          value={results[0] ? `${Math.round(results[0].percentage)}%` : 'Awaited'}
          sub={results[0]?.exam.name ?? 'No published results yet'}
          href="/exams/results"
        />
      </MetricRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Homework</CardTitle>
            <Link
              href="/academics/homework"
              className="text-xs text-[var(--brand-600)] hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="py-1">
            {homework.length === 0 ? (
              <EmptyState
                title="No homework right now"
                description="New assignments will appear here."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {homework.map((h) => {
                  const status = h.submissions[0]?.status ?? 'PENDING'
                  const done = status === 'SUBMITTED' || status === 'REVIEWED'
                  return (
                    <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-ink truncate">{h.title}</p>
                        <p className="text-xs text-ink-subtle">
                          {h.classSubject.subject.name} {'·'} due {formatDay(h.dueOn, 'd MMM')}
                        </p>
                      </div>
                      <StatusBadge status={done ? status : 'PENDING'} />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fees</CardTitle>
            <Link href="/finance" className="text-xs text-[var(--brand-600)] hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="py-1">
            {invoices.length === 0 ? (
              <EmptyState
                title="No invoices yet"
                description="Fee invoices will appear here once issued."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{i.title}</p>
                      <p className="text-xs text-ink-subtle">
                        {i.number} {'·'} due {formatDay(i.dueOn, 'd MMM yyyy')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium tnum text-ink">
                        {formatMoney(i.balanceMinor, ctx.tenant.currency)}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        of {formatMoney(i.totalMinor, ctx.tenant.currency)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notices</CardTitle>
          <Link
            href="/communication/notices"
            className="text-xs text-[var(--brand-600)] hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent className="py-1">
          {notices.length === 0 ? (
            <EmptyState title="No notices" description="School announcements will appear here." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {notices.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 py-2">
                  <p className="text-sm text-ink truncate">{n.title}</p>
                  <span className="text-xs text-ink-subtle shrink-0">
                    {formatDay(n.publishOn, 'd MMM')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

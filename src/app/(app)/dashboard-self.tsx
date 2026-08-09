import Link from 'next/link'
import { formatDay } from '@/lib/dates'
import { format, subDays } from 'date-fns'
import { requireContext } from '@/server/context'
import { scopedStudents } from '@/server/scope'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney, fullName, initials } from '@/lib/utils'
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
    <div className="space-y-5">
      <PageHeader
        title={`Hello, ${ctx.user.firstName}`}
        description={format(today, 'EEEE, d MMMM yyyy')}
      />

      {children.length > 1 ? <ChildSwitcher students={children} activeId={active.id} /> : null}

      <Card>
        <CardContent className="pt-5 flex items-center gap-4">
          <span className="size-14 rounded-full bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center text-lg font-semibold shrink-0">
            {initials(active.firstName, active.lastName)}
          </span>
          <div className="min-w-0">
            <p className="text-[17px] font-semibold text-ink truncate">{fullName(active)}</p>
            <p className="text-[13px] text-ink-muted">
              {active.className ?? 'Class not assigned'}
              {active.sectionName ? ` · Section ${active.sectionName}` : ''}
              {active.rollNumber ? ` · Roll ${active.rollNumber}` : ''}
            </p>
            <p className="text-[12px] text-ink-subtle mt-0.5">
              Admission no. {active.admissionNo}
            </p>
          </div>
          <Link
            href={`/students/${active.id}`}
            className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} ml-auto shrink-0`}
          >
            View profile
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Attendance (30 days)"
          value={attendancePct === null ? 'No data' : `${attendancePct}%`}
          sub={totalMarked ? `${present} of ${totalMarked} days present` : 'Not marked yet'}
          icon="CalendarCheck"
          tone={attendancePct !== null && attendancePct < 75 ? 'warning' : 'success'}
          href="/attendance"
        />
        <StatCard
          label="Fees due"
          value={formatMoney(dueMinor, ctx.tenant.currency)}
          sub={nextDue ? `Next due ${formatDay(nextDue.dueOn, 'd MMM yyyy')}` : 'All cleared'}
          icon="Wallet"
          tone={dueMinor > 0 ? 'danger' : 'success'}
          href="/finance"
        />
        <StatCard
          label="Homework due"
          value={String(pendingHomework)}
          sub={`${homework.length} assigned recently`}
          icon="ClipboardList"
          href="/academics/homework"
        />
        <StatCard
          label="Latest result"
          value={results[0] ? `${Math.round(results[0].percentage)}%` : 'Awaited'}
          sub={results[0]?.exam.name ?? 'No published results yet'}
          icon="Trophy"
          tone="info"
          href="/exams/results"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Homework</CardTitle>
            <Link
              href="/academics/homework"
              className="text-[12.5px] text-[var(--brand-600)] hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
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
                    <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[13.5px] text-ink truncate">{h.title}</p>
                        <p className="text-[12px] text-ink-subtle">
                          {h.classSubject.subject.name} {'·'} due {formatDay(h.dueOn, 'd MMM')}
                        </p>
                      </div>
                      <Badge tone={done ? 'success' : 'warning'}>{status.toLowerCase()}</Badge>
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
            <Link href="/finance" className="text-[12.5px] text-[var(--brand-600)] hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {invoices.length === 0 ? (
              <EmptyState
                title="No invoices yet"
                description="Fee invoices will appear here once issued."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px] text-ink truncate">{i.title}</p>
                      <p className="text-[12px] text-ink-subtle">
                        {i.number} {'·'} due {formatDay(i.dueOn, 'd MMM yyyy')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13.5px] font-medium tnum text-ink">
                        {formatMoney(i.balanceMinor, ctx.tenant.currency)}
                      </p>
                      <p className="text-[11.5px] text-ink-subtle">
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
            className="text-[12.5px] text-[var(--brand-600)] hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {notices.length === 0 ? (
            <EmptyState title="No notices" description="School announcements will appear here." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {notices.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 py-2.5">
                  <p className="text-[13.5px] text-ink truncate">{n.title}</p>
                  <span className="text-[12px] text-ink-subtle shrink-0">
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

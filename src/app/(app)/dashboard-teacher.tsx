import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getTeacherDashboard } from '@/server/modules/dashboard/service'
import { WelcomeBanner } from '@/components/dashboard/welcome-banner'
import { StatCard } from '@/components/dashboard/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney, formatNumber } from '@/lib/utils'

export async function TeacherDashboard() {
  const ctx = await requireContext('dashboard.view')
  const data = await getTeacherDashboard(ctx)
  const currency = ctx.tenant.currency
  const schoolName = ctx.tenant.school?.name ?? ctx.tenant.name

  const headline =
    data.studentCount > 0
      ? `You have ${formatNumber(data.studentCount)} students across ${formatNumber(data.classCount)} classes.`
      : 'No classes are assigned to you yet. Ask the administrator to link subjects to your staff profile.'

  return (
    <div className="space-y-4">
      <WelcomeBanner
        firstName={ctx.user.firstName}
        schoolName={schoolName}
        headline={headline}
        bannerUrl={ctx.tenant.school?.loginBannerUrl}
        action={
          ctx.can('attendance.mark')
            ? { label: 'Mark attendance', href: '/attendance' }
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="My students"
          value={formatNumber(data.studentCount)}
          icon="GraduationCap"
          tone="students"
          href="/students"
          delayMs={0}
        />
        <StatCard
          label="My classes"
          value={formatNumber(data.classCount)}
          icon="Layers"
          tone="admissions"
          href="/academics/classes"
          sub={`${formatNumber(data.sectionCount)} sections`}
          delayMs={40}
        />
        <StatCard
          label="Fee outstanding"
          value={formatMoney(data.outstandingMinor, currency)}
          icon="Wallet"
          tone="fees"
          href="/finance/invoices"
          sub={data.overdueCount > 0 ? `${formatNumber(data.overdueCount)} overdue invoices` : 'All clear'}
          delayMs={80}
        />
        <StatCard
          label="Subjects"
          value={formatNumber(data.subjects.length)}
          icon="BookOpen"
          tone="staff"
          href="/academics/subjects"
          delayMs={120}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>My classes</CardTitle>
          </CardHeader>
          <CardContent>
            {data.classes.length === 0 ? (
              <p className="text-sm text-ink-muted">No classes assigned yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.classes.map((c) => (
                  <li key={c.id}>
                    <Link href="/academics/classes" className="font-medium text-ink hover:underline">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {ctx.can('students.view') ? (
              <Link href="/students" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                Students
              </Link>
            ) : null}
            {ctx.can('fees.view') ? (
              <Link href="/finance/invoices" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                Fee invoices
              </Link>
            ) : null}
            {ctx.can('exams.marks') ? (
              <Link href="/exams/marks" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                Enter marks
              </Link>
            ) : null}
            {ctx.can('homework.view') ? (
              <Link href="/academics/homework" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                Homework
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

import Link from 'next/link'
import { requirePlatformContext } from '@/server/context'
import { platformUsage } from '@/server/modules/lms/insights'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { Metric } from '@/components/ui/metric'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIst } from '@/lib/ist-clock'

export const metadata = { title: 'LMS usage · Platform' }

export default async function PlatformLmsUsagePage() {
  await requirePlatformContext('platform.lms')
  const { totals, schools, courses } = await platformUsage()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Robotics & AI usage"
        description="Every school with the add-on switched on, and how much they use it."
        breadcrumbs={[{ label: 'Courses', href: '/platform/lms' }, { label: 'Usage' }]}
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Metric label="Schools with the add-on" value={String(totals.schools)} sub={`${totals.activeSchools} active this week`} />
        <Metric label="Learners" value={String(totals.learners)} />
        <Metric label="Courses finished" value={String(totals.finished)} />
        <Metric label="Certificates" value={String(totals.certificates)} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Schools</CardTitle>
        </CardHeader>
        {schools.length === 0 ? (
          <EmptyState title="No school has the add-on yet" description="Switch it on from a school's page under Add-on modules." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>School</TH>
                  <TH align="right">Learners</TH>
                  <TH align="right">Active 7 days</TH>
                  <TH align="right">Finished</TH>
                  <TH align="right">Own courses</TH>
                  <TH align="right">Live batches</TH>
                  <TH align="right">Kits out</TH>
                  <TH>Last activity</TH>
                </tr>
              </THead>
              <TBody>
                {schools.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <Link href={`/platform/tenants/${s.id}`} className="font-medium text-ink hover:text-[var(--brand-600)]">
                        {s.name}
                      </Link>
                      <span className="block text-xs text-ink-subtle">{s.slug}</span>
                    </TD>
                    <TD align="right">{s.learners}</TD>
                    <TD align="right">{s.active7}</TD>
                    <TD align="right">
                      {s.finished}
                      {s.certificates ? <span className="block text-xs text-ink-subtle">{s.certificates} certificates</span> : null}
                    </TD>
                    <TD align="right">{s.ownCourses}</TD>
                    <TD align="right">{s.batches}</TD>
                    <TD align="right">{s.kitsOut}</TD>
                    <TD className="whitespace-nowrap">{s.lastActivityAt ? formatIst(s.lastActivityAt, 'd MMM yyyy') : 'Not started'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Library courses</CardTitle>
        </CardHeader>
        {courses.length === 0 ? (
          <EmptyState title="No library courses yet" />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Course</TH>
                  <TH align="right">Schools using it</TH>
                  <TH align="right">Learners</TH>
                </tr>
              </THead>
              <TBody>
                {courses.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/platform/lms/${c.id}`} className="font-medium text-ink hover:text-[var(--brand-600)]">
                        {c.title}
                      </Link>{' '}
                      {c.status !== 'PUBLISHED' ? <StatusBadge status={c.status} /> : null}
                    </TD>
                    <TD align="right">{c.schools}</TD>
                    <TD align="right">{c.learners}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}

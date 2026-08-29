import Link from 'next/link'
import { BookOpen, Briefcase, CalendarDays, Plus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listStaff } from '@/server/modules/people/service'
import { parseListQuery } from '@/lib/query'
import { formatNumber } from '@/lib/utils'
import {
  ColorBanner,
  ColorTile,
  colorBannerPrimaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { StaffTypeFilter } from './type-filter'
import { PersonCell } from '@/components/ui/identity'
import { buttonVariants } from '@/components/ui/button-variants'
import { StaffTabs } from './tabs'

export const metadata = { title: 'Teachers & staff' }

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('staff.view')
  const params = await searchParams
  const query = parseListQuery(params)

  const [staffCounts, staffList] = await Promise.all([
    Promise.all([
      ctx.db.staff.count({ where: { deletedAt: null } }),
      ctx.db.staff.count({ where: { deletedAt: null, staffType: 'TEACHING' } }),
    ]),
    listStaff(ctx, query, { staffType: params.staffType }),
  ])
  const [totalStaff, teachingStaff] = staffCounts
  const { rows, total } = staffList

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="staff"
        eyebrow="Staff"
        title={
          totalStaff > 0
            ? `${formatNumber(totalStaff)} staff on file`
            : 'No staff yet'
        }
        description={
          totalStaff > 0
            ? `${formatNumber(teachingStaff)} teaching · directory, payroll and leave`
            : 'Add teaching and support staff to assign classes and run payroll.'
        }
        actions={
          ctx.can('staff.create') ? (
            <Link href="/staff/new" className={colorBannerPrimaryBtn()}>
              <Plus aria-hidden /> Add staff
            </Link>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Total staff"
          value={formatNumber(totalStaff)}
          sub="All staff types"
          tone="staff"
          icon={<Briefcase className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Teaching"
          value={formatNumber(teachingStaff)}
          sub="Teaching staff"
          tone="admissions"
          icon={<BookOpen className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Payroll & leave"
          value="Open"
          sub="Appraisals, payroll and leave"
          tone="leave"
          href="/staff/payroll"
          icon={<CalendarDays className="size-5" aria-hidden />}
          delayMs={120}
        />
      </div>

      <StaffTabs
        active="directory"
        ctxCan={{
          payroll: ctx.can('staff.payroll'),
          appraise: ctx.can('staff.appraise'),
          leave: ctx.can('leave.view'),
        }}
      />

      <Card variant="elevated" className="overflow-hidden">
        <SearchBar placeholder="Search name, employee code, phone or designation">
          <StaffTypeFilter />
        </SearchBar>

        {rows.length === 0 ? (
          <EmptyState
            title={params.q || params.staffType ? 'No staff match these filters' : 'No staff yet'}
            description="Add teaching and support staff to assign classes and subjects, run attendance, and manage salary and appraisals."
            action={
              ctx.can('staff.create') && !params.q && !params.staffType ? (
                <Link href="/staff/new" className={buttonVariants({ size: 'sm' })}>
                  Add the first staff member
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Staff member</TH>
                    <TH>Role</TH>
                    <TH>Contact</TH>
                    <TH>Assignments</TH>
                    <TH>Login</TH>
                    <TH align="right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((s) => (
                    <TR key={s.id}>
                      <TD>
                        <PersonCell
                          firstName={s.firstName}
                          lastName={s.lastName}
                          secondary={s.employeeCode}
                          href={`/staff/${s.id}`}
                        />
                      </TD>
                      <TD>
                        <span className="block text-sm text-ink first-letter:uppercase">
                          {s.designation ?? s.staffType.toLowerCase()}
                        </span>
                        {s.department ? (
                          <span className="block text-xs text-ink-subtle">{s.department}</span>
                        ) : null}
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {s.phone ? <span className="block">{s.phone}</span> : null}
                        {s.email ? (
                          <span className="block text-xs text-ink-subtle truncate max-w-52">
                            {s.email}
                          </span>
                        ) : null}
                        {!s.phone && !s.email ? '—' : null}
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {s.isClassTeacherOf ? (
                          <span className="block">Class teacher · {s.isClassTeacherOf}</span>
                        ) : null}
                        <span className="block text-xs text-ink-subtle">
                          {s.classCount} subject{s.classCount === 1 ? '' : 's'}
                        </span>
                      </TD>
                      <TD>
                        <Badge tone={s.hasLogin ? 'success' : 'neutral'}>
                          {s.hasLogin ? 'Active' : 'No login'}
                        </Badge>
                      </TD>
                      <TD align="right">
                        <Link
                          href={`/staff/${s.id}`}
                          className="text-sm text-[var(--brand-600)] hover:underline"
                        >
                          View
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="staff" />
          </>
        )}
      </Card>
    </div>
  )
}

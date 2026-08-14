import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listStaff } from '@/server/modules/people/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
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
  const { rows, total } = await listStaff(ctx, query, { staffType: params.staffType })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Teachers & staff"
        description={`${total} staff records`}
        actions={
          ctx.can('staff.create') ? (
            <Link href="/staff/new" className={buttonVariants({ size: 'sm' })}>
              <Plus aria-hidden /> Add staff
            </Link>
          ) : null
        }
      />

      <StaffTabs
        active="directory"
        ctxCan={{
          payroll: ctx.can('staff.payroll'),
          appraise: ctx.can('staff.appraise'),
          leave: ctx.can('leave.view'),
        }}
      />

      <Card className="overflow-hidden">
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

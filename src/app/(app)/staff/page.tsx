import Link from 'next/link'
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
import { initials } from '@/lib/utils'

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
    <div>
      <PageHeader
        title="Teachers & staff"
        description="Everyone employed by the school, their assignments and portal access."
      />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search name, employee code, phone or designation">
          <StaffTypeFilter />
        </SearchBar>

        {rows.length === 0 ? (
          <EmptyState
            title={params.q || params.staffType ? 'No staff match these filters' : 'No staff yet'}
            description="Add teaching and support staff to assign classes, subjects and attendance."
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
                        <Link href={`/staff/${s.id}`} className="flex items-center gap-2.5 group">
                          <span className="size-8 rounded-full bg-surface-2 border border-line grid place-items-center text-[11px] font-semibold text-ink-muted shrink-0">
                            {initials(s.firstName, s.lastName)}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13.5px] text-ink group-hover:text-[var(--brand-600)] truncate">
                              {s.firstName} {s.lastName}
                            </span>
                            <span className="block text-[12px] text-ink-subtle tnum">
                              {s.employeeCode}
                            </span>
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        <span className="block text-[13px] text-ink">
                          {s.designation ?? s.staffType.toLowerCase()}
                        </span>
                        {s.department ? (
                          <span className="block text-[12px] text-ink-subtle">{s.department}</span>
                        ) : null}
                      </TD>
                      <TD className="text-[13px] text-ink-muted">
                        {s.phone ? <span className="block">{s.phone}</span> : null}
                        {s.email ? (
                          <span className="block text-[12px] text-ink-subtle truncate max-w-52">
                            {s.email}
                          </span>
                        ) : null}
                        {!s.phone && !s.email ? '—' : null}
                      </TD>
                      <TD className="text-[13px] text-ink-muted">
                        {s.isClassTeacherOf ? (
                          <span className="block">Class teacher · {s.isClassTeacherOf}</span>
                        ) : null}
                        <span className="block text-[12px] text-ink-subtle">
                          {s.classCount} subject{s.classCount === 1 ? '' : 's'}
                        </span>
                      </TD>
                      <TD>
                        <Badge tone={s.hasLogin ? 'success' : 'neutral'}>
                          {s.hasLogin ? 'active' : 'none'}
                        </Badge>
                      </TD>
                      <TD align="right">
                        <Link
                          href={`/staff/${s.id}`}
                          className="text-[13px] text-[var(--brand-600)] hover:underline"
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

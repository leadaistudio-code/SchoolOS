import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listParents } from '@/server/modules/people/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { initials } from '@/lib/utils'

export const metadata = { title: 'Parents' }

export default async function ParentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('parents.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const { rows, total } = await listParents(ctx, query)

  return (
    <div>
      <PageHeader
        title="Parents"
        description="One account per parent, linked to every one of their children."
      />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search parent name, phone, email or child" />

        {rows.length === 0 ? (
          <EmptyState
            title={params.q ? 'No parents match that search' : 'No parents yet'}
            description={
              params.q
                ? 'Try a different name, phone number or child.'
                : 'Parents are created automatically when you admit a student with a guardian.'
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Parent</TH>
                    <TH>Contact</TH>
                    <TH>Children</TH>
                    <TH>Portal access</TH>
                    <TH align="right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((p) => (
                    <TR key={p.id}>
                      <TD>
                        <Link href={`/parents/${p.id}`} className="flex items-center gap-2.5 group">
                          <span className="size-8 rounded-full bg-surface-2 border border-line grid place-items-center text-[11px] font-semibold text-ink-muted shrink-0">
                            {initials(p.firstName, p.lastName)}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13.5px] text-ink group-hover:text-[var(--brand-600)] truncate">
                              {p.firstName} {p.lastName}
                            </span>
                            {p.occupation ? (
                              <span className="block text-[12px] text-ink-subtle">
                                {p.occupation}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </TD>
                      <TD className="text-[13px] text-ink-muted">
                        {p.phone ? <span className="block">{p.phone}</span> : null}
                        {p.email ? (
                          <span className="block text-[12px] text-ink-subtle truncate max-w-56">
                            {p.email}
                          </span>
                        ) : null}
                        {!p.phone && !p.email ? '—' : null}
                      </TD>
                      <TD className="text-[13px] text-ink-muted">
                        {p.childCount === 0 ? (
                          <span className="text-ink-subtle">None linked</span>
                        ) : (
                          <>
                            <span className="block">{p.children.slice(0, 2).join(', ')}</span>
                            {p.childCount > 2 ? (
                              <span className="block text-[12px] text-ink-subtle">
                                +{p.childCount - 2} more
                              </span>
                            ) : null}
                          </>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={p.hasLogin ? 'success' : 'neutral'}>
                          {p.hasLogin ? 'active' : 'no login'}
                        </Badge>
                      </TD>
                      <TD align="right">
                        <Link
                          href={`/parents/${p.id}`}
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
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="parents" />
          </>
        )}
      </Card>
    </div>
  )
}

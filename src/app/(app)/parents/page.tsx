import Link from 'next/link'
import { KeyRound, Link2, Users } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listParents } from '@/server/modules/people/service'
import { parseListQuery } from '@/lib/query'
import { formatNumber } from '@/lib/utils'
import { ColorBanner, ColorTile } from '@/components/dashboard/color-tiles'
import { ParentsBannerScene } from '@/components/illustrations/school-scene'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { PersonCell } from '@/components/ui/identity'

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

  const [parentTotal, withLogin, withChildren] = await Promise.all([
    ctx.db.parent.count({ where: { deletedAt: null } }),
    ctx.db.parent.count({ where: { deletedAt: null, userId: { not: null } } }),
    ctx.db.parent.count({
      where: { deletedAt: null, children: { some: {} } },
    }),
  ])
  const withoutLogin = Math.max(0, parentTotal - withLogin)

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="parents"
        eyebrow="Parents"
        title={
          parentTotal > 0
            ? `${formatNumber(parentTotal)} parent ${parentTotal === 1 ? 'account' : 'accounts'}`
            : 'No parents yet'
        }
        description={
          parentTotal > 0
            ? `${formatNumber(withLogin)} with portal access · ${formatNumber(withoutLogin)} still need a login`
            : 'Parents appear when you admit a student with a guardian.'
        }
        href={parentTotal === 0 ? '/students/new' : undefined}
        cta={parentTotal === 0 ? 'Admit a student' : undefined}
        media={<ParentsBannerScene className="h-28 w-28" />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Parents"
          value={formatNumber(parentTotal)}
          sub="On the school roll"
          tone="parents"
          href="/parents"
          icon={<Users className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Portal access"
          value={formatNumber(withLogin)}
          sub={
            withoutLogin > 0
              ? `${formatNumber(withoutLogin)} without a login`
              : 'Phone + first password ready'
          }
          tone="admissions"
          href="/parents"
          icon={<KeyRound className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Linked to children"
          value={formatNumber(withChildren)}
          sub="Can switch between students"
          tone="students"
          href="/students"
          icon={<Link2 className="size-5" aria-hidden />}
          delayMs={120}
        />
      </div>

      <Card variant="elevated" className="overflow-hidden">
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
                        <PersonCell
                          firstName={p.firstName}
                          lastName={p.lastName}
                          secondary={p.occupation ?? undefined}
                          href={`/parents/${p.id}`}
                        />
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {p.phone ? <span className="block">{p.phone}</span> : null}
                        {p.email ? (
                          <span className="block text-xs text-ink-subtle truncate max-w-56">
                            {p.email}
                          </span>
                        ) : null}
                        {!p.phone && !p.email ? '—' : null}
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {p.childCount === 0 ? (
                          <span className="text-ink-subtle">None linked</span>
                        ) : (
                          <>
                            <span className="block">{p.children.slice(0, 2).join(', ')}</span>
                            {p.childCount > 2 ? (
                              <span className="block text-xs text-ink-subtle">
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
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="parents" />
          </>
        )}
      </Card>
    </div>
  )
}

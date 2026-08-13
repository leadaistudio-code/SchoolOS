import Link from 'next/link'
import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Badge, humanizeStatus } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { listPlatformTickets } from '@/server/modules/platform/support'
import { EmptyState } from '@/components/ui/states'

export const metadata = { title: 'Support · Platform' }

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const ctx = await requirePlatformContext('platform.support')
  const sp = await searchParams
  const { rows: tickets } = await listPlatformTickets(ctx, {
    status: sp.status,
    page: 1,
    pageSize: 50,
  })

  return (
    <div className="space-y-4">
      <PageHeader title="Support queue" description="Tickets raised by schools." />

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle>Open tickets</CardTitle>
          <form method="get" className="flex gap-2">
            <select
              name="status"
              defaultValue={sp.status ?? ''}
              className="h-8 rounded-[var(--radius-sm)] border border-line px-2 text-sm"
            >
              <option value="">All</option>
              {['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'].map((s) => (
                <option key={s} value={s}>
                  {humanizeStatus(s)}
                </option>
              ))}
            </select>
            <button type="submit" className="text-sm text-[var(--brand-600)]">
              Filter
            </button>
          </form>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {tickets.length === 0 ? (
            <EmptyState
              title="Queue is empty"
              description="Tickets raised by schools appear here for triage."
            />
          ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Subject</TH>
                  <TH>School</TH>
                  <TH>Priority</TH>
                  <TH>Status</TH>
                  <TH>Updated</TH>
                  <TH align="right"> </TH>
                </tr>
              </THead>
              <TBody>
                {tickets.map((t) => (
                  <TR key={t.id}>
                    <TD className="text-sm">{t.subject}</TD>
                    <TD className="text-sm text-ink-muted">{t.tenant.name}</TD>
                    <TD>
                      <Badge tone={t.priority === 'URGENT' ? 'danger' : 'neutral'}>
                        {t.priority.toLowerCase()}
                      </Badge>
                    </TD>
                    <TD>{humanizeStatus(t.status)}</TD>
                    <TD className="text-sm text-ink-muted">{format(t.updatedAt, 'd MMM HH:mm')}</TD>
                    <TD align="right">
                      <Link
                        href={`/platform/support/${t.id}`}
                        className="text-sm text-[var(--brand-600)] hover:underline"
                      >
                        Open
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

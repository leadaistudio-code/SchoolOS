import { requireContext } from '@/server/context'
import { auditActivity, auditModules, listAuditLog } from '@/server/modules/settings/audit'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { AuditFilters } from './filters'

export const metadata = { title: 'Audit log' }

/**
 * The audit log.
 *
 * Append-only: nothing in the product edits or deletes a row, which is what
 * makes it worth anything when somebody asks who changed a mark or refunded a
 * payment. Newest first, because the question that brings people here is
 * almost always about something that just happened.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('audit.view')
  const params = await searchParams
  const query = parseListQuery(params)

  const [{ rows, total }, modules, activity] = await Promise.all([
    listAuditLog(ctx, query, {
      module: params.module,
      from: params.from,
      to: params.to,
    }),
    auditModules(ctx),
    auditActivity(ctx),
  ])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description={`${activity.total} recorded events · append-only`}
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Audit log' }]}
      />

      <MetricRow>
        <Metric label="Last 24 hours" value={String(activity.today)} sub="Recorded events" />
        <Metric label="Last 7 days" value={String(activity.week)} sub="Recorded events" />
        <Metric
          label="People active"
          value={String(activity.activeActors)}
          sub="Made a change this week"
        />
        <Metric label="All time" value={String(activity.total)} sub="Since the school opened" />
      </MetricRow>

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search summary, person or record id" />
        <AuditFilters
          modules={modules}
          module={params.module ?? ''}
          from={params.from ?? ''}
          to={params.to ?? ''}
        />

        {rows.length === 0 ? (
          <EmptyState
            title={params.q || params.module ? 'Nothing matches those filters' : 'Nothing recorded'}
            description="Sensitive changes — marks, money, permissions, deletions — are written here as they happen."
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>When</TH>
                    <TH>Who</TH>
                    <TH>What happened</TH>
                    <TH>Module</TH>
                    <TH>Record</TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD className="whitespace-nowrap text-xs tnum text-ink-muted">
                        {row.createdAt.toLocaleString()}
                      </TD>
                      <TD className="text-sm text-ink">
                        {row.actorLabel ?? <span className="text-ink-subtle">System</span>}
                        {row.ip ? (
                          <span className="block text-xs tnum text-ink-subtle">{row.ip}</span>
                        ) : null}
                      </TD>
                      <TD className="text-sm text-ink">
                        {row.summary ?? row.action}
                        <span className="block text-xs tnum text-ink-subtle">{row.action}</span>
                      </TD>
                      <TD>
                        <Badge tone="neutral">{row.module}</Badge>
                      </TD>
                      <TD className="text-xs tnum text-ink-subtle">
                        {row.entityType ? (
                          <>
                            {row.entityType}
                            {row.entityId ? (
                              <span className="block">{row.entityId.slice(0, 12)}…</span>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="events" />
          </>
        )}
      </Card>
    </div>
  )
}

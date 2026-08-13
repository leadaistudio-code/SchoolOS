import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { getSystemHealth } from '@/server/modules/platform/health'
import { formatNumber } from '@/lib/utils'

export const metadata = { title: 'Health · Platform' }

export default async function HealthPage() {
  const ctx = await requirePlatformContext('platform.health')
  const health = await getSystemHealth(ctx)

  const tenantTotal = Object.values(health.tenants).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="System health"
        description={`Last checked ${format(new Date(health.checkedAt), 'd MMM yyyy HH:mm:ss')}`}
      />

      <MetricRow>
        <Metric
          label="Database"
          value={health.database.ok ? 'Healthy' : 'Down'}
          sub={`${health.database.latencyMs}ms`}
        />
        <Metric label="Schools" value={formatNumber(tenantTotal)} sub="By status below" />
        <Metric label="Open tickets" value={formatNumber(health.openTickets)} sub="OPEN + PENDING" />
        <Metric
          label="Failed jobs"
          value={formatNumber(health.failedJobs.length)}
          sub={`${health.failedDeliveries.length} failed deliveries`}
        />
      </MetricRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tenants by status</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line text-sm">
              {Object.entries(health.tenants).map(([status, count]) => (
                <li key={status} className="flex justify-between py-2">
                  <span>{status.toLowerCase().replace('_', ' ')}</span>
                  <Badge tone="neutral">{count}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent platform audit</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line text-sm">
              {health.recentAudit.map((a) => (
                <li key={a.id} className="py-2">
                  <p>{a.summary ?? a.action}</p>
                  <p className="text-xs text-ink-subtle">{format(a.createdAt, 'd MMM HH:mm')}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Failed notification deliveries</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Channel</TH>
                  <TH>Tenant</TH>
                  <TH>Error</TH>
                  <TH>When</TH>
                </tr>
              </THead>
              <TBody>
                {health.failedDeliveries.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-sm text-ink-muted text-center py-6">
                      None
                    </TD>
                  </TR>
                ) : (
                  health.failedDeliveries.map((d) => (
                    <TR key={d.id}>
                      <TD>{d.channel}</TD>
                      <TD className="text-xs">{d.tenantId.slice(0, 8)}…</TD>
                      <TD className="text-sm text-ink-muted max-w-md truncate">{d.lastError}</TD>
                      <TD className="text-sm">{format(d.createdAt, 'd MMM HH:mm')}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Failed jobs</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Queue</TH>
                  <TH>Attempts</TH>
                  <TH>Error</TH>
                </tr>
              </THead>
              <TBody>
                {health.failedJobs.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-sm text-ink-muted text-center py-6">
                      None
                    </TD>
                  </TR>
                ) : (
                  health.failedJobs.map((j) => (
                    <TR key={j.id}>
                      <TD>{j.name}</TD>
                      <TD>{j.queue}</TD>
                      <TD>{j.attempts}</TD>
                      <TD className="text-sm text-ink-muted max-w-md truncate">{j.lastError}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  )
}

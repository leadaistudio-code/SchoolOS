import Link from 'next/link'
import { requireContext } from '@/server/context'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { schoolAiUsageDashboard } from '@/server/modules/ai-assessment/usage'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, Notice } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'

export const metadata = { title: 'AI Usage' }

function formatLimit(current: number, limit: number | null) {
  if (limit == null) return `${current} · unlimited`
  return `${current} / ${limit}`
}

export default async function AiUsagePage() {
  const ctx = await requireContext('assessments.view')
  const licensed = await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)

  if (!licensed) {
    return (
      <div>
        <PageHeader title="AI Usage" />
        <Card>
          <EmptyState title="Not included in this plan" description="Enable AI Assist to track usage." />
        </Card>
      </div>
    )
  }

  const data = await schoolAiUsageDashboard(ctx)

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Usage"
        description="Month-to-date evaluation pages and question generation against your plan limits."
        breadcrumbs={[
          { label: 'Assessments', href: '/assessments' },
          { label: 'Intelligence', href: '/assessments/intelligence' },
          { label: 'Usage' },
        ]}
        actions={
          <Link href="/assessments/intelligence" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Intelligence hub
          </Link>
        }
      />

      <Notice tone="info" title="Calendar month">
        Counters reset on the 1st of each month. Platform administrators can raise limits per school.
      </Notice>

      <MetricRow columns={2}>
        <Metric
          label="Eval pages"
          value={String(data.evaluationPages)}
          sub={formatLimit(data.evaluationPages, data.evaluationLimit)}
        />
        <Metric
          label="Questions generated"
          value={String(data.generateUnits)}
          sub={formatLimit(data.generateUnits, data.generateLimit)}
        />
      </MetricRow>

      {data.byDay.length === 0 ? (
        <Card>
          <EmptyState
            title="No usage this month"
            description="Upload answer sheets or generate questions to see activity here."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Daily activity</CardTitle>
          </CardHeader>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Day</TH>
                  <TH align="right">Eval pages</TH>
                  <TH align="right">Questions generated</TH>
                </tr>
              </THead>
              <TBody>
                {data.byDay.map((row) => (
                  <TR key={row.day}>
                    <TD className="text-sm tabular-nums">{row.day}</TD>
                    <TD align="right" className="text-sm tabular-nums">
                      {row.evaluationPages}
                    </TD>
                    <TD align="right" className="text-sm tabular-nums">
                      {row.generate}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      )}

      {data.recent.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Recent events</CardTitle>
          </CardHeader>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>Kind</TH>
                  <TH align="right">Units</TH>
                  <TH>Model</TH>
                </tr>
              </THead>
              <TBody>
                {data.recent.map((row) => (
                  <TR key={row.id}>
                    <TD className="text-sm tabular-nums">
                      {new Date(row.createdAt).toLocaleString()}
                    </TD>
                    <TD className="text-sm">{row.kind}</TD>
                    <TD align="right" className="text-sm tabular-nums">
                      {row.units}
                    </TD>
                    <TD className="text-sm text-[var(--muted)]">{row.model ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      ) : null}

      <CardContent className="px-0">
        <div className="flex flex-wrap gap-2">
          <Link href="/assessments/evaluation" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            AI Evaluation
          </Link>
          <Link href="/assessments/bank/generate" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Generate questions
          </Link>
        </div>
      </CardContent>
    </div>
  )
}

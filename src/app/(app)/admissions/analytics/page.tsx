import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getAdmissionsAnalytics } from '@/server/modules/admissions/service'
import { STAGE_LABELS, type LeadStage } from '@/lib/admissions'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = { title: 'Admissions analytics' }

export default async function AdmissionsAnalyticsPage() {
  const ctx = await requireContext('admissions.view')
  const stats = await getAdmissionsAnalytics(ctx)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admissions analytics"
        description="Enquiry volume, conversion and overdue follow-ups."
        actions={
          <Link href="/admissions" className="text-sm text-[var(--brand-600)] hover:underline">
            Pipeline
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Total leads', stats.total],
          ['Open', stats.open],
          ['Enrolled', stats.enrolled],
          ['Conversion', stats.conversionRate == null ? '—' : `${stats.conversionRate}%`],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="pt-5">
              <p className="text-xs uppercase tracking-wide text-ink-subtle">{label}</p>
              <p className="mt-1 text-2xl font-semibold tnum text-ink">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-sm text-ink-muted">
        Overdue follow-ups: <span className="font-medium text-ink tnum">{stats.overdueFollowUps}</span>
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(stats.byStage).map(([stage, count]) => (
              <div key={stage} className="flex justify-between text-sm">
                <span>{STAGE_LABELS[stage as LeadStage] ?? stage}</span>
                <span className="tnum text-ink-muted">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(stats.bySource).map(([source, count]) => (
              <div key={source} className="flex justify-between text-sm">
                <span>{source.replaceAll('_', ' ')}</span>
                <span className="tnum text-ink-muted">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

import Link from 'next/link'
import { requireContext } from '@/server/context'
import { formatNumber } from '@/lib/utils'
import { PageBanner } from '@/components/page-banner'
import { StatCard } from '@/components/dashboard/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { listLeadSetup, listLeadsByStage } from '@/server/modules/admissions/service'
import { AdmissionsBoard } from './board'
import { CreateLeadForm } from './create-lead-form'

export const metadata = { title: 'Admission pipeline' }

export default async function AdmissionsPage() {
  const ctx = await requireContext('admissions.view')
  const [board, setup] = await Promise.all([listLeadsByStage(ctx), listLeadSetup(ctx)])

  const allLeads = Object.values(board).flat()
  const openLeads = allLeads.filter((l) => l.stage !== 'ENROLLED' && l.stage !== 'LOST').length
  const enrolled = allLeads.filter((l) => l.stage === 'ENROLLED').length
  const followUpsDue = allLeads.filter(
    (l) => l.nextFollowUpOn && new Date(l.nextFollowUpOn) <= new Date(),
  ).length

  return (
    <div className="space-y-4">
      <PageBanner
        title="Admission pipeline"
        description={`${formatNumber(openLeads)} open enquiries · ${formatNumber(enrolled)} enrolled this cycle`}
        tone="admissions"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admissions/followups"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Follow-ups
            </Link>
            <Link href="/admissions/analytics" className={buttonVariants({ size: 'sm' })}>
              Analytics
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Open enquiries"
          value={formatNumber(openLeads)}
          icon="UserSearch"
          tone="admissions"
          sub="Not yet enrolled or lost"
          delayMs={40}
        />
        <StatCard
          label="Enrolled"
          value={formatNumber(enrolled)}
          icon="UserCheck"
          tone="students"
          sub="Converted to students"
          delayMs={80}
        />
        <StatCard
          label="Follow-ups due"
          value={formatNumber(followUpsDue)}
          icon="Bell"
          tone={followUpsDue > 0 ? 'overdue' : 'pending'}
          sub="Need a call or visit today"
          href="/admissions/followups"
          delayMs={120}
        />
      </div>

      <Card variant="elevated" className="overflow-hidden">
        <CardHeader>
          <CardTitle>Kanban</CardTitle>
        </CardHeader>
        <CardContent>
          <AdmissionsBoard board={board} canManage={ctx.can('admissions.manage')} />
        </CardContent>
      </Card>

      {ctx.can('admissions.manage') ? (
        <Card variant="elevated" className="max-w-xl">
          <CardHeader>
            <CardTitle>New enquiry</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateLeadForm classes={setup.classes} staff={setup.staff} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

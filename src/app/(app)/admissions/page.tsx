import Link from 'next/link'
import { Bell, UserCheck, UserSearch } from 'lucide-react'
import { requireContext } from '@/server/context'
import { formatNumber } from '@/lib/utils'
import {
  ColorBanner,
  ColorTile,
  colorBannerPrimaryBtn,
  colorBannerSecondaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
      <ColorBanner
        tone="admissions"
        eyebrow="Admissions"
        title={
          openLeads > 0
            ? `${formatNumber(openLeads)} open enquiries`
            : 'Admission pipeline'
        }
        description={`${formatNumber(enrolled)} enrolled this cycle · chase follow-ups from the board`}
        actions={
          <>
            <Link href="/admissions/followups" className={colorBannerSecondaryBtn()}>
              Follow-ups
            </Link>
            <Link href="/admissions/analytics" className={colorBannerPrimaryBtn()}>
              Analytics
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Open enquiries"
          value={formatNumber(openLeads)}
          sub="Not yet enrolled or lost"
          tone="admissions"
          icon={<UserSearch className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Enrolled"
          value={formatNumber(enrolled)}
          sub="Converted to students"
          tone="students"
          icon={<UserCheck className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Follow-ups due"
          value={formatNumber(followUpsDue)}
          sub="Need a call or visit today"
          tone={followUpsDue > 0 ? 'overdue' : 'pending'}
          href="/admissions/followups"
          icon={<Bell className="size-5" aria-hidden />}
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

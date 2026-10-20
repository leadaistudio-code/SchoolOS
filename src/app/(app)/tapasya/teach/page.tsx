import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { Notice } from '@/components/ui/states'
import { requireContext } from '@/server/context'
import { classProgress, teacherAssignedTasks } from '@/server/modules/tapasya/tasks'
import { getSchoolPolicy, limitsFor } from '@/server/modules/tapasya/config'
import { TeachBoard } from './teach-board'

export const metadata = { title: 'Class progress · Tapasya' }

export default async function TapasyaTeachPage() {
  const ctx = await requireContext()
  if (!ctx.can('tapasya.teach')) redirect(ctx.can('tapasya.manage') ? '/tapasya/settings' : '/403')
  const [progress, assigned, policy, { limits }] = await Promise.all([classProgress(ctx, null), teacherAssignedTasks(ctx), getSchoolPolicy(ctx), limitsFor(ctx)])

  return (
    <div>
      <PageHeader title="Class progress" description="Assign study tasks and see how much focused work your students are putting in this week." />
      {!policy.enabled ? <Notice tone="warning" className="mb-4" title="Tapasya Mode is switched off for this school">You can review history but cannot assign new tasks.</Notice> : null}
      <TeachBoard
        progress={progress}
        assigned={assigned}
        limits={{ minFocusMinutes: limits.minFocusMinutes, maxFocusMinutes: limits.maxFocusMinutes, minBreakMinutes: limits.minBreakMinutes, maxBreakMinutes: limits.maxBreakMinutes }}
        enabled={policy.enabled}
      />
    </div>
  )
}

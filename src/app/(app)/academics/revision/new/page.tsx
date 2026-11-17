import { requireContext } from '@/server/context'
import { revisionPlanClassOptions } from '@/server/modules/revision/service'
import { PageHeader } from '@/components/page-header'
import { RevisionPlanForm } from '../revision-plan-form'

export const metadata = { title: 'New revision plan' }

export default async function NewRevisionPlanPage() {
  const ctx = await requireContext('exams.manage')
  const classes = await revisionPlanClassOptions(ctx)

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="New revision plan" description="Define the date range, then add daily revision slots on the next screen." />
      <RevisionPlanForm classes={classes} mode="create" />
    </div>
  )
}
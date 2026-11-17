import { notFound, redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import { getPlan, revisionPlanClassOptions } from '@/server/modules/revision/service'
import { toDateInput } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { RevisionPlanForm } from '../../revision-plan-form'

export const metadata = { title: 'Edit revision plan' }

export default async function EditRevisionPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('exams.manage')
  const plan = await getPlan(ctx, id)

  if (plan.publishedAt) redirect(`/academics/revision/${id}`)

  const classes = await revisionPlanClassOptions(ctx)
  if (!classes.length) notFound()

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="Edit revision plan" />
      <RevisionPlanForm
        mode="edit"
        classes={classes}
        initial={{
          id: plan.id,
          name: plan.name,
          classLevelId: plan.classLevelId,
          startsOn: toDateInput(plan.startsOn),
          endsOn: toDateInput(plan.endsOn),
          notes: plan.notes,
        }}
      />
    </div>
  )
}
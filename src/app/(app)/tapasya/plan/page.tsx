import { PageHeader } from '@/components/page-header'
import { listTasks, todayView } from '@/server/modules/tapasya/tasks'
import { StudentTabs } from '../_components/student-tabs'
import { requireStudentPage } from '../_components/student-page'
import { PlanBoard } from './plan-board'

export const metadata = { title: 'Plan & Frogs · Tapasya' }

export default async function TapasyaPlanPage() {
  const { ctx, student } = await requireStudentPage()
  const [today, tasks] = await Promise.all([todayView(ctx, student.id), listTasks(ctx, student.id, 'open')])
  return (
    <div>
      <PageHeader title="Plan & Frogs" description={`${tasks.length} open task${tasks.length === 1 ? '' : 's'} · ${today.today}`} />
      <StudentTabs active="/tapasya/plan" />
      <PlanBoard tasks={tasks} frogIds={today.frogs.map((f) => f.id)} primaryId={today.primaryFrog?.id ?? null} />
    </div>
  )
}

import { PageHeader } from '@/components/page-header'
import { listPresets } from '@/server/modules/tapasya/presets'
import { getActiveSession } from '@/server/modules/tapasya/sessions'
import { listTasks } from '@/server/modules/tapasya/tasks'
import { getSchoolPolicy } from '@/server/modules/tapasya/config'
import { StudentTabs } from '../_components/student-tabs'
import { requireStudentPage } from '../_components/student-page'
import { FocusRoom } from './focus-room'

export const metadata = { title: 'Focus Room · Tapasya' }

export default async function TapasyaFocusPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { ctx, student } = await requireStudentPage()
  const { task } = await searchParams
  const [presets, active, tasks, policy] = await Promise.all([
    listPresets(ctx),
    getActiveSession(ctx),
    listTasks(ctx, student.id, 'open'),
    getSchoolPolicy(ctx),
  ])
  return (
    <div>
      <PageHeader title="Focus Room" description={active ? 'Session in progress' : `${presets.personal.length} saved preset${presets.personal.length === 1 ? '' : 's'}`} />
      <StudentTabs active="/tapasya/focus" />
      <FocusRoom
        presets={presets}
        active={active}
        tasks={tasks.map((t) => ({ id: t.id, title: t.title, requiredFocusMinutes: t.requiredFocusMinutes, isMandatory: t.isMandatory, isPrimaryFrog: t.isPrimaryFrog }))}
        initialTaskId={task && tasks.some((t) => t.id === task) ? task : null}
        enabled={policy.enabled}
      />
    </div>
  )
}

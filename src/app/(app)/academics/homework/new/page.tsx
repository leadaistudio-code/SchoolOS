import { requireContext } from '@/server/context'
import { teachableSubjects } from '@/server/modules/homework/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { HomeworkForm } from './homework-form'

export const metadata = { title: 'Set homework' }

export default async function NewHomeworkPage() {
  const ctx = await requireContext('homework.create')
  const subjects = await teachableSubjects(ctx)

  if (subjects.length === 0) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Set homework" />
        <Card>
          <EmptyState
            title="No subjects assigned to you"
            description="You can set homework for subjects you teach. Ask an administrator to assign you a subject."
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Set homework"
        description="Publishing notifies the class and their parents straight away."
      />
      <HomeworkForm
        subjects={subjects.map((s) => ({
          id: s.id,
          label: `${s.classLevel.name} · ${s.subject.name}`,
          sections: s.classLevel.sections,
        }))}
      />
    </div>
  )
}

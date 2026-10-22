import { requireContext } from '@/server/context'
import { classTestSubjects } from '@/server/modules/class-tests/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { ClassTestForm } from './class-test-form'

export const metadata = { title: 'New class test' }

export default async function NewClassTestPage() {
  const ctx = await requireContext('exams.class_tests')
  const subjects = await classTestSubjects(ctx)

  return (
    <div className="max-w-2xl">
      <PageHeader title="New class test" />
      {subjects.length === 0 ? (
        <Card>
          <EmptyState
            title="No subjects assigned to you"
            description="You can set class tests for subjects you teach. Ask an administrator to assign you a subject."
          />
        </Card>
      ) : (
        <ClassTestForm
          subjects={subjects.map((s) => ({
            id: s.id,
            label: `${s.classLevel.name} · ${s.subject.name}`,
            sections: s.classLevel.sections,
          }))}
        />
      )}
    </div>
  )
}

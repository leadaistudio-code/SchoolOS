import { requireContext } from '@/server/context'
import { getClassTest } from '@/server/modules/class-tests/service'
import { formatDay } from '@/lib/dates'
import { CLASS_TEST_MARKABLE, CLASS_TEST_OPTIONS } from '@/lib/registers'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusRegister } from '@/components/status-register'
import { Button } from '@/components/ui/button'
import { deleteClassTestAction, saveClassTestResultsAction } from '../actions'

export const metadata = { title: 'Class test' }

export default async function ClassTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('exams.class_tests')
  const { test, roster } = await getClassTest(ctx, id)

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        title={test.title}
        description={`${test.classSubject.subject.name} · ${test.classLevel.name}${
          test.section ? ` ${test.section.name}` : ' (all sections)'
        } · ${formatDay(test.heldOn, 'd MMMM yyyy')}${test.maxMarks ? ` · out of ${test.maxMarks}` : ''}${
          test.passingMarks !== null ? ` · pass mark ${test.passingMarks}` : ''
        }`}
        actions={
          <form action={deleteClassTestAction.bind(null, test.id)}>
            <Button type="submit" size="sm" variant="ghost">Delete</Button>
          </form>
        }
      />

      {test.syllabus ? (
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-ink whitespace-pre-wrap">{test.syllabus}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Results</CardTitle>
            <p className="text-sm text-ink-muted mt-0.5">
              Mark each student as completed, absent or not applicable
              {test.maxMarks ? ', and enter marks for those who took it' : ''}
              {test.passingMarks !== null ? '. Pass or fail is worked out from the passing marks' : ''}. Students do not need
              to do anything on the portal.
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-0">
          <StatusRegister
            rows={roster}
            options={CLASS_TEST_OPTIONS}
            countAs={['COMPLETED']}
            countLabel="completed"
            maxMarks={test.maxMarks}
            passingMarks={test.passingMarks}
            markable={CLASS_TEST_MARKABLE}
            onSave={saveClassTestResultsAction.bind(null, test.id)}
          />
        </CardContent>
      </Card>
    </div>
  )
}

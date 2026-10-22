import { requireContext } from '@/server/context'
import { getClassTest } from '@/server/modules/class-tests/service'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TickRegister } from '@/components/tick-register'
import { Button } from '@/components/ui/button'
import { deleteClassTestAction, saveClassTestResultsAction } from '../actions'

export const metadata = { title: 'Class test' }

export default async function ClassTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('exams.class_tests')
  const { test, roster } = await getClassTest(ctx, id)

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={test.title}
        description={`${test.classSubject.subject.name} · ${test.classLevel.name}${
          test.section ? ` ${test.section.name}` : ' (all sections)'
        } · ${formatDay(test.heldOn, 'd MMMM yyyy')}${test.maxMarks ? ` · out of ${test.maxMarks}` : ''}`}
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
            <CardTitle>Who completed it</CardTitle>
            <p className="text-sm text-ink-muted mt-0.5">
              Tick each student who took the test{test.maxMarks ? ', and enter marks if you have them' : ''}. Students do not
              need to do anything on the portal.
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-0">
          <TickRegister
            rows={roster}
            maxMarks={test.maxMarks}
            doneLabel="completed"
            onSave={saveClassTestResultsAction.bind(null, test.id)}
          />
        </CardContent>
      </Card>
    </div>
  )
}

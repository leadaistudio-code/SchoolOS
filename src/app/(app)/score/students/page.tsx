import { requireContext } from '@/server/context'
import { scoreStudents } from '@/server/modules/score/service'
import { getClassOptions } from '@/server/modules/students/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { LinkTabs } from '@/components/ui/tabs'
import { BandBar } from '../score-ui'
import { scoreTabs } from '../tabs'
import { ScoreFilters } from './score-filters'
import { StudentScoreTable } from './student-score-table'
import { bandCounts } from '@/lib/score'

export const metadata = { title: 'Student scores' }

type SearchParams = Promise<Record<string, string | undefined>>

export default async function StudentScoresPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const ctx = await requireContext('score.view')
  const params = await searchParams

  const [{ students }, classes] = await Promise.all([
    scoreStudents(ctx, {
      classLevelId: params.classLevelId || undefined,
      sectionId: params.sectionId || undefined,
    }),
    getClassOptions(ctx),
  ])

  const band = params.band
  const filtered = band ? students.filter((s) => s.composed.band === band) : students
  const counts = bandCounts(students.map((s) => s.composed.score))

  return (
    <div>
      <PageHeader
        title="Student scores"
        description={`${students.length} student${students.length === 1 ? '' : 's'} in this view, ranked highest first`}
        breadcrumbs={[{ label: 'Health score', href: '/score' }, { label: 'Students' }]}
      />

      <LinkTabs
        label="Health score views"
        className="mb-3"
        items={scoreTabs('/score/students', ctx)}
      />

      {students.length > 0 ? (
        <Card className="mb-3">
          <div className="p-4">
            <BandBar counts={counts} total={students.length} />
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <ScoreFilters
          classes={classes.map((c) => ({
            id: c.id,
            name: c.name,
            sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
          }))}
        />
        <StudentScoreTable
          rows={filtered.map((s) => ({
            studentId: s.studentId,
            admissionNo: s.admissionNo,
            firstName: s.firstName,
            lastName: s.lastName,
            className: s.className,
            sectionName: s.sectionName,
            rollNumber: s.rollNumber,
            composed: s.composed,
          }))}
        />
      </Card>
    </div>
  )
}

import { requireContext } from '@/server/context'
import { studentIdCardSetup } from '@/server/modules/students/id-cards'
import { buildStudentCards } from '@/server/modules/id-cards/cards'
import { loadIdCardSettings } from '@/server/modules/id-cards/settings'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { IdCardStudio } from '@/components/id-card/id-card-studio'
import { IdCardFilters } from './id-card-controls'
import { saveStudentIdCardDesignAction } from './actions'

export const metadata = { title: 'Student ID cards' }

export default async function StudentIdCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('students.id_cards')
  const query = await searchParams
  const [setup, settings] = await Promise.all([
    studentIdCardSetup(ctx),
    loadIdCardSettings(ctx, 'student'),
  ])
  const data = query.class ? await buildStudentCards(ctx, query.class, query.section) : null

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
          title="Student ID cards"
          description="Pick a class, choose a design in the studio, then print front and back on CR80 card sheets."
        />
      </div>

      <Card className="no-print">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <IdCardFilters
            classes={setup.classes}
            classLevelId={query.class ?? ''}
            sectionId={query.section ?? ''}
          />
          <p className="text-sm text-ink-muted">
            {data ? `${data.people.length} card${data.people.length === 1 ? '' : 's'} · ${setup.session.name}` : 'Choose a class to begin'}
          </p>
        </CardContent>
      </Card>

      {!data ? (
        <Card className="no-print">
          <EmptyState
            title="Choose a class"
            description="Cards use the current enrolment, student photo, parent contact and school branding (logo and principal signature from Settings → Branding)."
          />
        </Card>
      ) : (
        <IdCardStudio
          key={`${query.class}-${query.section ?? ''}`}
          kind="student"
          people={data.people}
          school={data.school}
          initialSettings={settings}
          canSave
          saveAction={saveStudentIdCardDesignAction}
        />
      )}
    </div>
  )
}

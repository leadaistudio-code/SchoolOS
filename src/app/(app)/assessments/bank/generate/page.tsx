import { requireContext } from '@/server/context'
import { listCoverage } from '@/server/modules/curriculum/service'
import { assistantConfigured } from '@/server/assistant/providers'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { listTextbooks } from '@/server/modules/questions/textbooks'
import { listAssessmentTypes } from '@/server/modules/assessments/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState, Notice } from '@/components/ui/states'
import { GenerateForm } from './generate-form'

export const metadata = { title: 'Generate questions with AI' }

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireContext('questionbank.generate')
  const raw = await searchParams
  const pick = (key: string) => {
    const value = raw[key]
    return Array.isArray(value) ? value[0] : value
  }
  const [coverage, licensed, textbooks, assessmentTypes] = await Promise.all([
    listCoverage(ctx),
    hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST),
    listTextbooks(ctx),
    listAssessmentTypes(ctx),
  ])

  const configured = assistantConfigured()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Generate questions with AI"
        description="Create draft questions from your syllabus or textbook pages. Every item stays in draft until you approve it."
        breadcrumbs={[
          { label: 'Assessments', href: '/assessments' },
          { label: 'Question bank', href: '/assessments/bank' },
          { label: 'Generate' },
        ]}
      />

      {!configured ? (
        <Card>
          <EmptyState
            title="AI generation is not configured"
            description="An administrator must set AI_DRIVER and AI_API_KEY on the deployment before this can be used."
          />
        </Card>
      ) : !licensed ? (
        <Card>
          <EmptyState
            title="Not included in this plan"
            description="Question generation needs the AI module on your school's subscription."
          />
        </Card>
      ) : coverage.length === 0 ? (
        <Card>
          <EmptyState
            title="No subjects assigned to you"
            description="Assign a class and subject before uploading a textbook or generating questions."
          />
        </Card>
      ) : (
        <>
          <Notice tone="info" title="Drafts only — nothing reaches students yet">
            Generated questions arrive as drafts. Review each one, then approve the ones worth
            keeping. Off-source or duplicate drafts are discarded automatically.
          </Notice>

          <GenerateForm
            subjects={coverage.map((row) => ({
              id: row.classSubjectId,
              label: `${row.classLevel.name} · ${row.subject.name}`,
              hasSyllabus: Boolean(row.curriculum?.isPublished),
            }))}
            initialTextbooks={textbooks.map((book) => ({
              id: book.id,
              classSubjectId: book.classSubjectId,
              board: book.board,
              title: book.title,
              pageCount: book.pageCount,
              status: book.status,
            }))}
            assessmentTypes={assessmentTypes.map((type) => ({
              id: type.id,
              name: type.name,
              marks: type.marks,
              minutes: type.minutes,
            }))}
            canCreatePaper={ctx.can('assessments.create')}
            initialClassSubjectId={pick('classSubjectId')}
            initialAssessmentTypeId={pick('assessmentTypeId')}
            initialCount={pick('count')}
            initialTitle={pick('title')}
            initialTotalMarks={pick('totalMarks')}
            initialDurationMinutes={pick('durationMinutes')}
            initialInstructions={pick('instructions')}
            initialEasyPct={pick('easyPct')}
            initialMediumPct={pick('mediumPct')}
            initialHardPct={pick('hardPct')}
            initialCreatePaper={pick('createPaper') === '1'}
            initialChapterIds={
              pick('chapterIds')
                ? pick('chapterIds')!.split(',').filter(Boolean)
                : undefined
            }
            initialChapterWeights={
              pick('chapterWeights')
                ? pick('chapterWeights')!
                    .split(',')
                    .map((pair) => {
                      const [chapterId, percent] = pair.split(':')
                      return {
                        chapterId: chapterId!,
                        percent: Number(percent) || 0,
                      }
                    })
                    .filter((w) => w.chapterId && w.percent > 0)
                : undefined
            }
          />
        </>
      )}
    </div>
  )
}

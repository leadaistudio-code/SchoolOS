import { requireContext } from '@/server/context'
import { blueprintOf, getAssessment } from '@/server/modules/assessments/service'
import { PrintBar } from './print-bar'

export const metadata = { title: 'Print' }

type PlacedOption = { text: string; isCorrect?: boolean; matchWith?: string | null }

/**
 * The printable paper.
 *
 * Three documents from one route, chosen by `?key=`: the paper alone, the paper
 * with its answer key, or the key alone. That is the split every school
 * actually needs — the invigilator prints one, the marker prints another — and
 * it costs one query parameter rather than three templates.
 *
 * Answers are rendered from the placement snapshot, never from the bank, so a
 * key printed today matches the paper as it was set.
 */
export default async function PrintPaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ key?: string }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await requireContext('assessments.export')
  const assessment = await getAssessment(ctx, id)
  const blueprint = blueprintOf(assessment)

  const mode = query.key === 'only' ? 'key-only' : query.key === '1' ? 'with-key' : 'paper'
  const showPaper = mode !== 'key-only'
  const showKey = mode !== 'paper'

  const template = assessment.template
  const schoolName =
    template?.headingOverride ?? ctx.tenant.school?.name ?? ctx.tenant.name

  let number = 0

  return (
    <div className="mx-auto max-w-[210mm] px-6 py-8 print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm 14mm; }
          .no-print { display: none !important; }
          .page-break { break-before: page; }
          body { background: #fff; }
        }
        .paper { font-family: Georgia, 'Times New Roman', serif; color: #000; }
        .paper h1, .paper h2 { font-weight: 700; }
      `}</style>

      <PrintBar assessmentId={assessment.id} mode={mode} />

      <div className="paper">
        {showPaper && (
          <section>
            <header className="border-b-2 border-black pb-3 text-center">
              <h1 className="text-xl uppercase tracking-wide">{schoolName}</h1>
              <h2 className="mt-1 text-base">{assessment.title}</h2>
              <p className="mt-0.5 text-sm">
                {assessment.type.name} · {assessment.classSubject.classLevel.name}
                {assessment.section ? `-${assessment.section.name}` : ''} ·{' '}
                {assessment.classSubject.subject.name}
              </p>
            </header>

            <div className="mt-2 flex justify-between text-sm">
              <span>Time: {formatDuration(assessment.durationMinutes)}</span>
              <span>Maximum Marks: {assessment.totalMarks}</span>
            </div>

            {(template?.showStudentName || template?.showRollNumber || template?.showDate) && (
              <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 border-b border-black pb-3 text-sm">
                {template?.showStudentName !== false && <span>Name: ______________________</span>}
                {template?.showRollNumber !== false && <span>Roll No: ____________</span>}
                {template?.showDate !== false && <span>Date: ____________</span>}
              </div>
            )}

            {(assessment.instructions || template?.generalInstructions) && (
              <div className="mt-3 text-sm">
                <p className="font-semibold">General Instructions:</p>
                <p className="whitespace-pre-wrap">
                  {assessment.instructions ?? template?.generalInstructions}
                </p>
              </div>
            )}

            {assessment.sections.map((section) => (
              <div key={section.id} className="mt-5">
                <div className="flex items-baseline justify-between border-b border-black pb-1">
                  <h3 className="text-sm font-bold uppercase">{section.title}</h3>
                  <span className="text-sm">
                    {section.questions.length} ×{' '}
                    {section.questions.length > 0
                      ? `${section.questions[0]!.marks} = ${section.questions.reduce((sum, q) => sum + q.marks, 0)}`
                      : 0}{' '}
                    Marks
                  </span>
                </div>
                {section.instructions && (
                  <p className="mt-1 text-sm italic">{section.instructions}</p>
                )}

                <ol className="mt-2 space-y-3">
                  {section.questions.map((placement) => {
                    number += 1
                    const options = asOptions(placement.optionsSnapshot)
                    return (
                      <li key={placement.id} className="text-sm">
                        <div className="flex gap-2">
                          <span className="font-medium">{number}.</span>
                          <span className="flex-1 whitespace-pre-wrap">
                            {placement.textSnapshot}
                          </span>
                          <span className="whitespace-nowrap">[{placement.marks}]</span>
                        </div>
                        {options.length > 0 && (
                          <div className="ml-6 mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                            {options.map((option, index) => (
                              <span key={index}>
                                ({String.fromCharCode(97 + index)}) {option.text}
                                {option.matchWith ? ` — ${option.matchWith}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))}

            {template?.footerNote && (
              <p className="mt-6 border-t border-black pt-2 text-center text-xs">
                {template.footerNote}
              </p>
            )}
          </section>
        )}

        {showKey && (
          <section className={showPaper ? 'page-break mt-10' : ''}>
            <header className="border-b-2 border-black pb-3 text-center">
              <h1 className="text-xl uppercase tracking-wide">{schoolName}</h1>
              <h2 className="mt-1 text-base">{assessment.title} — Answer Key</h2>
              <p className="mt-0.5 text-sm">
                {assessment.classSubject.classLevel.name} · {assessment.classSubject.subject.name} ·{' '}
                {blueprint.placed} marks
              </p>
            </header>

            {assessment.answerKeyNotes && (
              <p className="mt-3 whitespace-pre-wrap text-sm italic">{assessment.answerKeyNotes}</p>
            )}

            {(() => {
              let keyNumber = 0
              return assessment.sections.map((section) => (
                <div key={section.id} className="mt-4">
                  <h3 className="text-sm font-bold uppercase">{section.title}</h3>
                  <ol className="mt-2 space-y-2">
                    {section.questions.map((placement) => {
                      keyNumber += 1
                      const options = asOptions(placement.optionsSnapshot)
                      const correct = options.filter((option) => option.isCorrect)
                      return (
                        <li key={placement.id} className="text-sm">
                          <span className="font-medium">{keyNumber}.</span>{' '}
                          {correct.length > 0 ? (
                            <span>{correct.map((option) => option.text).join(', ')}</span>
                          ) : placement.answerSnapshot ? (
                            <span className="whitespace-pre-wrap">{placement.answerSnapshot}</span>
                          ) : (
                            <span className="italic">
                              No marking scheme recorded — mark on merit.
                            </span>
                          )}
                          <span className="ml-2">[{placement.marks}]</span>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))
            })()}
          </section>
        )}
      </div>
    </div>
  )
}

function asOptions(value: unknown): PlacedOption[] {
  return Array.isArray(value) ? (value as PlacedOption[]) : []
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const hourLabel = `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  return rest === 0 ? hourLabel : `${hourLabel} ${rest} minutes`
}

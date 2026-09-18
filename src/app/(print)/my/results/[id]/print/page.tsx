import { requireContext } from '@/server/context'
import { redirect } from 'next/navigation'
import { attemptLearningFeedback } from '@/server/modules/ai-assessment/insights'
import { SimplePrintBar } from '../../../../simple-print-bar'

export const metadata = { title: 'Print learning feedback' }

export default async function PrintLearningFeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireContext()
  if (!ctx.can('assessments.attempt') && !ctx.can('results.view')) {
    redirect('/403')
  }

  const feedback = await attemptLearningFeedback(ctx, id)
  const schoolName = ctx.tenant.school?.name ?? ctx.tenant.name

  return (
    <div className="mx-auto max-w-[210mm] px-6 py-8 print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm 14mm; }
          .no-print { display: none !important; }
          body { background: #fff; }
        }
      `}</style>

      <SimplePrintBar backHref={`/my/results/${id}`} backLabel="Back to result" />

      <article className="font-serif text-black">
        <header className="border-b-2 border-black pb-3 text-center">
          <h1 className="text-xl uppercase tracking-wide">{schoolName}</h1>
          <h2 className="mt-1 text-base">{feedback.title}</h2>
          <p className="mt-0.5 text-sm">
            {feedback.className} · {feedback.subject} · Learning feedback
          </p>
        </header>

        <section className="mt-4">
          <p className="text-sm">
            <strong>Score:</strong>{' '}
            {feedback.score == null ? '—' : `${feedback.score} / ${feedback.totalMarks}`}
            {feedback.percent != null ? ` (${feedback.percent}%)` : ''}
          </p>
          <p className="mt-3 text-sm leading-relaxed">{feedback.summary}</p>
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide">Strengths</h3>
            {feedback.strengths.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-600">None tagged on this paper.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {feedback.strengths.map((t) => (
                  <li key={t.id}>
                    {t.name} ({t.chapter}) — {t.successRate}%
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide">Worth another look</h3>
            {feedback.weakTopics.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-600">No weak topics on this paper.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {feedback.weakTopics.map((t) => (
                  <li key={t.id}>
                    {t.name} ({t.chapter}) — {t.successRate}%
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mt-5">
          <h3 className="text-sm font-bold uppercase tracking-wide">Practice</h3>
          <p className="mt-1 text-sm leading-relaxed">{feedback.practiceNote}</p>
        </section>

        <p className="mt-8 text-xs text-neutral-500">
          Observations from one marked paper — not a full-term report or diagnosis.
        </p>
      </article>
    </div>
  )
}

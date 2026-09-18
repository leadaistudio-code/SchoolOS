import { requireContext } from '@/server/context'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { learningInsightsOverview } from '@/server/modules/ai-assessment/insights'
import { redirect } from 'next/navigation'
import { SimplePrintBar } from '../../../simple-print-bar'

export const metadata = { title: 'Print learning insights' }

export default async function PrintInsightsPage() {
  const ctx = await requireContext('assessments.view')
  const licensed = await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)
  if (!licensed) redirect('/assessments/insights')

  const data = await learningInsightsOverview(ctx)
  const schoolName = ctx.tenant.school?.name ?? ctx.tenant.name

  return (
    <div className="mx-auto max-w-[210mm] px-6 py-8 print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          .no-print { display: none !important; }
          body { background: #fff; }
        }
      `}</style>

      <SimplePrintBar backHref="/assessments/insights" backLabel="Back to insights" />

      <article className="font-serif text-black">
        <header className="border-b-2 border-black pb-3 text-center">
          <h1 className="text-xl uppercase tracking-wide">{schoolName}</h1>
          <h2 className="mt-1 text-base">Learning Insights</h2>
          <p className="mt-0.5 text-sm">Last {data.windowDays} days · published marked papers</p>
        </header>

        <p className="mt-3 text-sm leading-relaxed">{data.note}</p>

        <section className="mt-5">
          <h3 className="text-sm font-bold uppercase tracking-wide">Weakest topics</h3>
          {data.schoolGaps.length === 0 ? (
            <p className="mt-1 text-sm text-neutral-600">No topic gaps in this window.</p>
          ) : (
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="py-1 pr-2">Topic</th>
                  <th className="py-1 pr-2">Chapter</th>
                  <th className="py-1 text-right">Marks earned</th>
                </tr>
              </thead>
              <tbody>
                {data.schoolGaps.slice(0, 20).map((t) => (
                  <tr key={t.id} className="border-b border-neutral-300">
                    <td className="py-1 pr-2">{t.name}</td>
                    <td className="py-1 pr-2">{t.chapter}</td>
                    <td className="py-1 text-right tabular-nums">
                      {t.successRate == null ? '—' : `${t.successRate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {data.papersWithGaps.length > 0 ? (
          <section className="mt-6">
            <h3 className="text-sm font-bold uppercase tracking-wide">Papers with gaps</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {data.papersWithGaps.slice(0, 12).map((p) => (
                <li key={p.assignmentId}>
                  {p.title} ({p.className} · {p.subject}) —{' '}
                  {p.gaps
                    .slice(0, 3)
                    .map((g) => g.name)
                    .join(', ')}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </div>
  )
}

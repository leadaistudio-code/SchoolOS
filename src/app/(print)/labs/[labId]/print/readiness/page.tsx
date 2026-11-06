import { requireLabs } from '@/server/modules/labs/access'
import { getLab, infraAnswers, readinessFor, templateOf } from '@/server/modules/labs/service'
import { registerRows } from '@/server/modules/labs/stock'
import { infraCheckPassed } from '@/lib/labs/readiness'
import { schoolToday } from '@/lib/periods'
import { fmtQty, LabPrintShell } from '../../../print-shell'

export const metadata = { title: 'Print lab readiness report' }

const BAND = { ready: 'Ready for inspection', nearly: 'Nearly ready', 'not-ready': 'Not ready' } as const

export default async function PrintReadinessPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const template = templateOf(lab)
  const schoolName = ctx.tenant.school?.name ?? ctx.tenant.name
  const backHref = `/labs/${lab.id}/prints`

  if (!template) {
    return (
      <LabPrintShell schoolName={schoolName} title="Lab Readiness Report" subtitle={lab.name} backHref={backHref}>
        <p className="text-sm">This lab does not follow a standard template, so there is no readiness score.</p>
      </LabPrintShell>
    )
  }

  const [readiness, shortRows] = await Promise.all([
    readinessFor(ctx, [lab]).then((m) => m.get(lab.id)!),
    registerRows(ctx, labId, 'shortfall'),
  ])
  const answers = infraAnswers(lab)
  const groups = [...new Set(template.infrastructure.map((c) => c.group))]

  return (
    <LabPrintShell
      schoolName={schoolName}
      title="Lab Readiness Report"
      subtitle={`${lab.name}${lab.room ? ` · ${lab.room}` : ''} · ${template.name} · as on ${schoolToday()}`}
      backHref={backHref}
    >
      <section className="flex items-center justify-between rounded border-2 border-black px-4 py-3">
        <div>
          <p className="text-sm">Overall readiness</p>
          <p className="text-3xl font-bold">{readiness!.score}%</p>
        </div>
        <p className="text-lg font-semibold">{BAND[readiness!.band]}</p>
      </section>
      <p className="mt-1 text-xs">Measured against {template.source}.</p>

      <table className="lab-table mt-4">
        <thead>
          <tr>
            <th>Area</th>
            <th className="num">Weight</th>
            <th className="num">Score</th>
            <th>Gaps</th>
          </tr>
        </thead>
        <tbody>
          {readiness!.sections.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td className="num">{s.weight}%</td>
              <td className="num">{Math.round(s.score * 100)}%</td>
              <td>{s.gaps.length ? s.gaps.slice(0, 8).join('; ') + (s.gaps.length > 8 ? ` and ${s.gaps.length - 8} more` : '') : 'None'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-5 text-sm font-bold uppercase tracking-wide">Infrastructure checklist</h3>
      <table className="lab-table mt-1">
        <thead>
          <tr>
            <th>Requirement</th>
            <th>School has</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupInfra key={g} group={g} checks={template.infrastructure.filter((c) => c.group === g)} answers={answers} />
          ))}
        </tbody>
      </table>

      <h3 className="mt-5 text-sm font-bold uppercase tracking-wide">Items below the requirement ({shortRows.length})</h3>
      {shortRows.length === 0 ? (
        <p className="text-sm">Every required item is in stock.</p>
      ) : (
        <table className="lab-table mt-1">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Required</th>
              <th className="num">In stock</th>
              <th className="num">To buy</th>
            </tr>
          </thead>
          <tbody>
            {shortRows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="num">
                  {fmtQty(r.requiredQty)} {r.unit}
                </td>
                <td className="num">{fmtQty(r.quantity)}</td>
                <td className="num">{fmtQty(r.shortfall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </LabPrintShell>
  )
}

function GroupInfra({
  group,
  checks,
  answers,
}: {
  group: string
  checks: { code: string; label: string; min?: number; unit?: string }[]
  answers: ReturnType<typeof infraAnswers>
}) {
  return (
    <>
      <tr>
        <td colSpan={3} style={{ background: '#fafafa', fontWeight: 700 }}>
          {group}
        </td>
      </tr>
      {checks.map((c) => {
        const a = answers[c.code]
        const ok = infraCheckPassed(c, a)
        return (
          <tr key={c.code}>
            <td>
              {c.label}
              {c.min ? ` (min ${c.min}${c.unit ? ` ${c.unit}` : ''})` : ''}
            </td>
            <td>
              {typeof a?.value === 'number' ? `${a.value}${c.unit ? ` ${c.unit}` : ''}` : a ? (a.ok ? 'Yes' : 'No') : 'Not answered'}
              {a?.note ? ` · ${a.note}` : ''}
            </td>
            <td>{ok ? 'Meets' : 'Gap'}</td>
          </tr>
        )
      })}
    </>
  )
}

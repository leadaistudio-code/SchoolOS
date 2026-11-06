import { requireLabs } from '@/server/modules/labs/access'
import { getLab, templateOf } from '@/server/modules/labs/service'
import { listInspections } from '@/server/modules/labs/safety'
import { INSPECTION_TYPES, labelOf } from '@/lib/labs/types'
import { schoolToday } from '@/lib/periods'
import { LabPrintShell } from '../../../print-shell'

export const metadata = { title: 'Print inspection register' }

export default async function PrintInspectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ labId: string }>
  searchParams: Promise<{ blank?: string }>
}) {
  const [{ labId }, { blank }] = await Promise.all([params, searchParams])
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const template = templateOf(lab)
  const inspections = await listInspections(ctx, labId, 200)
  const schoolName = ctx.tenant.school?.name ?? ctx.tenant.name

  if (blank && template) {
    const spec = template.inspections.find((s) => s.type === blank) ?? template.inspections[0]!
    return (
      <LabPrintShell schoolName={schoolName} title={`${spec.label} Checklist`} subtitle={lab.name} backHref={`/labs/${lab.id}/prints`}>
        <p className="mb-2 text-sm">Date: ____________ &nbsp;&nbsp; Inspected by: ______________________</p>
        <table className="lab-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Check</th>
              <th style={{ width: 60 }}>OK</th>
              <th style={{ width: 60 }}>Not OK</th>
              <th style={{ width: 160 }}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {spec.items.map((item, i) => (
              <tr key={item.code}>
                <td className="num">{i + 1}</td>
                <td>{item.label}</td>
                <td />
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </LabPrintShell>
    )
  }

  return (
    <LabPrintShell schoolName={schoolName} title="Lab Inspection Register" subtitle={`${lab.name} · printed ${schoolToday()}`} backHref={`/labs/${lab.id}/prints`}>
      {inspections.length === 0 ? (
        <p className="text-sm">No inspections recorded.</p>
      ) : (
        <table className="lab-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th className="num">Passed</th>
              <th className="num">Failed</th>
              <th>Issues found</th>
              <th>Inspected by</th>
              <th>Next due</th>
            </tr>
          </thead>
          <tbody>
            {inspections.map((i) => (
              <tr key={i.id}>
                <td>{i.inspectedOn.toISOString().slice(0, 10)}</td>
                <td>{template?.inspections.find((s) => s.type === i.type)?.label ?? labelOf(INSPECTION_TYPES, i.type)}</td>
                <td className="num">{i.passed}</td>
                <td className="num">{i.failed}</td>
                <td>{i.issues ?? ''}</td>
                <td>{i.inspectorName ?? ''}</td>
                <td>{i.nextDueOn ? i.nextDueOn.toISOString().slice(0, 10) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </LabPrintShell>
  )
}

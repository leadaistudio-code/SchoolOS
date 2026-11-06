import { requireLabs } from '@/server/modules/labs/access'
import { getLab } from '@/server/modules/labs/service'
import { listIncidents } from '@/server/modules/labs/safety'
import { studentNames } from '@/server/modules/labs/stock'
import { INCIDENT_SEVERITIES, INCIDENT_TYPES, labelOf } from '@/lib/labs/types'
import { schoolToday } from '@/lib/periods'
import { LabPrintShell } from '../../../print-shell'

export const metadata = { title: 'Print incident register' }

export default async function PrintIncidentsPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const incidents = await listIncidents(ctx, labId, 500)
  const names = await studentNames(ctx, incidents.flatMap((i) => i.studentIds))

  return (
    <LabPrintShell
      schoolName={ctx.tenant.school?.name ?? ctx.tenant.name}
      title="Lab Accident & Incident Register"
      subtitle={`${lab.name} · printed ${schoolToday()}`}
      backHref={`/labs/${lab.id}/prints`}
      landscape
    >
      {incidents.length === 0 ? (
        <p className="text-sm">No incidents recorded.</p>
      ) : (
        <table className="lab-table">
          <thead>
            <tr>
              <th>Date & time</th>
              <th>Type</th>
              <th>Severity</th>
              <th>What happened</th>
              <th>Students involved</th>
              <th>First aid</th>
              <th>Parents told</th>
              <th>Action taken</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id}>
                <td>{i.occurredAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>{labelOf(INCIDENT_TYPES, i.type)}</td>
                <td>{labelOf(INCIDENT_SEVERITIES, i.severity)}</td>
                <td>{i.description}</td>
                <td>{i.studentIds.map((s) => names.get(s) ?? '').filter(Boolean).join(', ')}</td>
                <td>{i.firstAidGiven ? 'Yes' : 'No'}</td>
                <td>{i.parentInformed ? 'Yes' : 'No'}</td>
                <td>{i.actionTaken ?? ''}</td>
                <td>{i.status === 'OPEN' ? 'Open' : 'Closed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </LabPrintShell>
  )
}

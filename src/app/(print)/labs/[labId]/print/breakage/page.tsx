import { requireLabs } from '@/server/modules/labs/access'
import { getLab } from '@/server/modules/labs/service'
import { listMovements, studentNames } from '@/server/modules/labs/stock'
import { formatMoney } from '@/lib/utils'
import { schoolToday } from '@/lib/periods'
import { fmtQty, LabPrintShell } from '../../../print-shell'

export const metadata = { title: 'Print breakage register' }

export default async function PrintBreakagePage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const rows = await listMovements(ctx, labId, { type: 'BREAKAGE', take: 1000 })
  const names = await studentNames(ctx, rows.map((r) => r.studentId ?? ''))
  const recovered = rows.reduce((sum, r) => sum + (r.chargeMinor ?? 0), 0)

  return (
    <LabPrintShell
      schoolName={ctx.tenant.school?.name ?? ctx.tenant.name}
      title="Breakage Register"
      subtitle={`${lab.name} · printed ${schoolToday()}`}
      backHref={`/labs/${lab.id}/prints`}
    >
      {rows.length === 0 ? (
        <p className="text-sm">No breakages recorded.</p>
      ) : (
        <table className="lab-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Date</th>
              <th>Item</th>
              <th className="num">Qty</th>
              <th>Student</th>
              <th>Reason</th>
              <th className="num">Recovered</th>
              <th>Recorded by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="num">{i + 1}</td>
                <td>{r.createdAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}</td>
                <td>{r.item.name}</td>
                <td className="num">
                  {fmtQty(Math.abs(r.quantity))} {r.item.unit}
                </td>
                <td>{r.studentId ? (names.get(r.studentId) ?? '') : ''}</td>
                <td>{r.reason ?? ''}</td>
                <td className="num">{r.chargeMinor ? formatMoney(r.chargeMinor) : ''}</td>
                <td>{r.actorLabel ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {recovered ? <p className="mt-2 text-xs">Total recovered from students: {formatMoney(recovered)}</p> : null}
    </LabPrintShell>
  )
}

import { requireLabs } from '@/server/modules/labs/access'
import { getLab } from '@/server/modules/labs/service'
import { registerRows } from '@/server/modules/labs/stock'
import { HAZARDS, labelOf } from '@/lib/labs/types'
import { schoolToday } from '@/lib/periods'
import { fmtQty, LabPrintShell } from '../../../print-shell'

export const metadata = { title: 'Print chemical register' }

export default async function PrintChemicalsPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const rows = await registerRows(ctx, labId, 'chemicals')

  return (
    <LabPrintShell
      schoolName={ctx.tenant.school?.name ?? ctx.tenant.name}
      title="Chemical & Hazardous Substances Register"
      subtitle={`${lab.name} · as on ${schoolToday()}`}
      backHref={`/labs/${lab.id}/prints`}
      landscape
    >
      <table className="lab-table">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Chemical</th>
            <th>Hazard</th>
            <th className="num">Quantity</th>
            <th>Storage</th>
            <th>Expiry</th>
            <th>Safety data sheet</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="num">{i + 1}</td>
              <td>{r.name}</td>
              <td>{r.hazards.map((h) => labelOf(HAZARDS, h)).join(', ') || '—'}</td>
              <td className="num">
                {fmtQty(r.quantity)} {r.unit}
              </td>
              <td>{r.storageLocation ?? ''}</td>
              <td>
                {r.expiresOn ? r.expiresOn.toISOString().slice(0, 10) : ''}
                {r.expired ? ' (expired)' : r.expiring ? ' (due soon)' : ''}
              </td>
              <td>{r.msdsKey ? 'On file' : 'Missing'}</td>
              <td style={{ width: 120 }} />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed">
        Flammable, corrosive and toxic substances must be kept in the locked, ventilated chemical cupboard, away from heat and direct
        sunlight, and labelled with their hazard. Expired chemicals go to the waste disposal log, not the drain.
      </p>
    </LabPrintShell>
  )
}

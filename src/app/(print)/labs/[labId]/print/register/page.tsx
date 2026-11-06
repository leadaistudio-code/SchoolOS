import { requireLabs } from '@/server/modules/labs/access'
import { getLab } from '@/server/modules/labs/service'
import { registerRows } from '@/server/modules/labs/stock'
import { ITEM_CATEGORIES } from '@/lib/labs/types'
import { schoolToday } from '@/lib/periods'
import { fmtQty, LabPrintShell } from '../../../print-shell'

export const metadata = { title: 'Print stock register' }

export default async function PrintRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ labId: string }>
  searchParams: Promise<{ kind?: string }>
}) {
  const [{ labId }, { kind }] = await Promise.all([params, searchParams])
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const filter = kind === 'consumables' ? 'consumables' : kind === 'non-consumables' ? 'non-consumables' : 'all'
  const rows = await registerRows(ctx, labId, filter)
  const title =
    filter === 'consumables' ? 'Consumables Stock Register' : filter === 'non-consumables' ? 'Non-consumables (Dead Stock) Register' : 'Lab Stock Register'

  const groups = ITEM_CATEGORIES.map((c) => ({ label: c.label, rows: rows.filter((r) => r.category === c.value) })).filter((g) => g.rows.length)

  return (
    <LabPrintShell
      schoolName={ctx.tenant.school?.name ?? ctx.tenant.name}
      title={title}
      subtitle={`${lab.name}${lab.room ? ` · ${lab.room}` : ''} · as on ${schoolToday()}`}
      backHref={`/labs/${lab.id}/prints`}
      landscape
    >
      <table className="lab-table">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Item</th>
            <th>Unit</th>
            <th className="num">Required</th>
            <th className="num">In stock</th>
            <th className="num">Shortfall</th>
            <th>Location</th>
            <th>Expiry</th>
            <th>Physically verified</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.label} label={g.label} rows={g.rows} />
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs">
        {rows.length} items · {rows.filter((r) => r.shortfall > 0).length} below the required quantity.
      </p>
    </LabPrintShell>
  )
}

function GroupRows({ label, rows }: { label: string; rows: Awaited<ReturnType<typeof registerRows>> }) {
  return (
    <>
      <tr>
        <td colSpan={9} style={{ background: '#fafafa', fontWeight: 700 }}>
          {label}
        </td>
      </tr>
      {rows.map((r, i) => (
        <tr key={r.id}>
          <td className="num">{i + 1}</td>
          <td>{r.name}</td>
          <td>{r.unit}</td>
          <td className="num">{r.requiredQty ? fmtQty(r.requiredQty) : '—'}</td>
          <td className="num">{fmtQty(r.quantity)}</td>
          <td className="num">{r.shortfall > 0 ? fmtQty(r.shortfall) : ''}</td>
          <td>{r.storageLocation ?? ''}</td>
          <td>{r.expiresOn ? r.expiresOn.toISOString().slice(0, 10) : ''}</td>
          <td style={{ width: 90 }} />
        </tr>
      ))}
    </>
  )
}

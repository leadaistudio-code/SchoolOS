'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { createJournalAction } from '../../actions'

type Account = { id: string; code: string; name: string; type: string }
type Line = { key: number; accountId: string; debit: string; credit: string; memo: string }

const GROUPS: { type: string; label: string }[] = [
  { type: 'ASSET', label: 'Assets' },
  { type: 'LIABILITY', label: 'Liabilities' },
  { type: 'EQUITY', label: 'Capital' },
  { type: 'INCOME', label: 'Income' },
  { type: 'EXPENSE', label: 'Expenses' },
]

const HINTS: Record<string, string> = {
  JOURNAL: 'Adjustments, depreciation, transfers between income or expense heads.',
  RECEIPT: 'Money received other than fees, e.g. donation or interest: Dr Cash/Bank, Cr Income.',
  PAYMENT: 'Money paid out not recorded as an expense, e.g. loan repayment: Dr Liability, Cr Cash/Bank.',
  CONTRA: 'Cash deposited in bank or withdrawn: between cash and bank accounts only.',
}

function toMinor(v: string) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function JournalForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter()
  const toast = useToast()
  const [voucherType, setVoucherType] = React.useState('JOURNAL')
  const [date, setDate] = React.useState(todayIso())
  const [reference, setReference] = React.useState('')
  const [narration, setNarration] = React.useState('')
  const nextKey = React.useRef(3)
  const [lines, setLines] = React.useState<Line[]>([
    { key: 1, accountId: '', debit: '', credit: '', memo: '' },
    { key: 2, accountId: '', debit: '', credit: '', memo: '' },
  ])
  const [pending, startTransition] = React.useTransition()

  const debit = lines.reduce((t, l) => t + toMinor(l.debit), 0)
  const credit = lines.reduce((t, l) => t + toMinor(l.credit), 0)
  const diff = debit - credit
  const fmt = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const fillBalance = (key: number) => {
    const line = lines.find((l) => l.key === key)
    if (!line) return
    const others = lines.filter((l) => l.key !== key)
    const d = others.reduce((t, l) => t + toMinor(l.debit), 0)
    const c = others.reduce((t, l) => t + toMinor(l.credit), 0)
    if (d > c) update(key, { credit: ((d - c) / 100).toFixed(2), debit: '' })
    else if (c > d) update(key, { debit: ((c - d) / 100).toFixed(2), credit: '' })
  }

  const submit = () =>
    startTransition(async () => {
      const result = await createJournalAction({
        date,
        voucherType,
        reference,
        narration,
        lines: lines
          .filter((l) => l.accountId && (toMinor(l.debit) || toMinor(l.credit)))
          .map((l) => ({ accountId: l.accountId, debit: l.debit || 0, credit: l.credit || 0, memo: l.memo })),
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Voucher not posted', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Voucher posted', description: result.message })
      router.push(result.data ? `/accounts/journals/${result.data.id}` : '/accounts/journals')
    })

  const options = (
    <>
      <option value="">Choose account…</option>
      {GROUPS.map((g) => (
        <optgroup key={g.type} label={g.label}>
          {accounts.filter((a) => a.type === g.type).map((a) => (
            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
          ))}
        </optgroup>
      ))}
    </>
  )

  return (
    <Card className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Voucher type" htmlFor="jv-type" required hint={HINTS[voucherType]}>
          <Select id="jv-type" value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>
            <option value="JOURNAL">Journal (JV)</option>
            <option value="RECEIPT">Receipt</option>
            <option value="PAYMENT">Payment</option>
            <option value="CONTRA">Contra</option>
          </Select>
        </Field>
        <Field label="Date" htmlFor="jv-date" required>
          <Input id="jv-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Reference" htmlFor="jv-ref" hint="Bill no., cheque no. or bank ref (optional)">
          <Input id="jv-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
        </Field>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="py-2 pr-2">Account</th>
              <th className="w-36 py-2 pr-2 text-right">Debit (₹)</th>
              <th className="w-36 py-2 pr-2 text-right">Credit (₹)</th>
              <th className="py-2 pr-2">Line note</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="align-top">
                <td className="py-1 pr-2">
                  <Select aria-label="Account" value={l.accountId} onChange={(e) => update(l.key, { accountId: e.target.value })}>
                    {options}
                  </Select>
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label="Debit"
                    type="number"
                    min="0"
                    step="0.01"
                    className="text-right"
                    value={l.debit}
                    onChange={(e) => update(l.key, { debit: e.target.value, credit: e.target.value ? '' : l.credit })}
                    onDoubleClick={() => fillBalance(l.key)}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label="Credit"
                    type="number"
                    min="0"
                    step="0.01"
                    className="text-right"
                    value={l.credit}
                    onChange={(e) => update(l.key, { credit: e.target.value, debit: e.target.value ? '' : l.debit })}
                    onDoubleClick={() => fillBalance(l.key)}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input aria-label="Line note" value={l.memo} onChange={(e) => update(l.key, { memo: e.target.value })} maxLength={200} />
                </td>
                <td className="py-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Remove line"
                    disabled={lines.length <= 2}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border)] font-semibold">
              <td className="py-2 pr-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLines((ls) => [...ls, { key: nextKey.current++, accountId: '', debit: '', credit: '', memo: '' }])}
                >
                  <Plus className="size-4" aria-hidden /> Add line
                </Button>
              </td>
              <td className="py-2 pr-2 text-right tnum">{fmt(debit)}</td>
              <td className="py-2 pr-2 text-right tnum">{fmt(credit)}</td>
              <td colSpan={2} className={`py-2 text-sm ${diff === 0 && debit > 0 ? 'text-success' : 'text-[var(--danger)]'}`}>
                {debit === 0 ? 'Enter amounts' : diff === 0 ? 'Balanced' : `Difference ${fmt(Math.abs(diff))} (${diff > 0 ? 'more debit' : 'more credit'})`}
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-1 text-xs text-ink-subtle">Tip: double-click an amount box to fill the balancing figure.</p>
      </div>

      <Field label="Narration" htmlFor="jv-narration" required>
        <Textarea
          id="jv-narration"
          rows={2}
          value={narration}
          onChange={(e) => setNarration(e.target.value)}
          placeholder="Being cash deposited in SBI current account"
          maxLength={500}
        />
      </Field>

      <div className="flex gap-2">
        <Button loading={pending} disabled={diff !== 0 || debit === 0 || narration.trim().length < 3} onClick={submit}>
          Post voucher
        </Button>
        <Button variant="ghost" onClick={() => router.push('/accounts/journals')}>Cancel</Button>
      </div>
      <p className="text-xs text-ink-subtle">
        Posted vouchers cannot be edited or deleted. A mistake is corrected by reversing the voucher, which keeps the audit trail.
      </p>
    </Card>
  )
}

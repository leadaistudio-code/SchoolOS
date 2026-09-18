import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FeeSettingsForms } from './settings-forms'

export const metadata = { title: 'Advanced fee settings' }

export default async function FeeSettingsPage() {
  const ctx = await requireContext('fees.settings')
  const [reminders, lateFees, stops, feeHeads, transportRates] = await Promise.all([
    ctx.db.feeReminderRule.findMany({ orderBy: [{ offsetType: 'asc' }, { offsetDays: 'asc' }] }),
    ctx.db.feePenaltyRule.findMany({ orderBy: { name: 'asc' } }),
    ctx.db.busStop.findMany({ orderBy: [{ route: { name: 'asc' } }, { sortOrder: 'asc' }], include: { route: true } }),
    ctx.db.feeHead.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ctx.db.transportFeeRate.findMany({ include: { stop: { include: { route: true } }, feeHead: true }, orderBy: { effectiveFrom: 'desc' } }),
  ])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Advanced fee settings"
        description="Reminder automation, late fees and exception policies"
        breadcrumbs={[{ label: 'Fees', href: '/finance' }, { label: 'Settings' }]}
      />
      <FeeSettingsForms
        stops={stops.map((stop) => ({ id: stop.id, label: `${stop.route.name} — ${stop.name}` }))}
        feeHeads={feeHeads}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Reminder rules</CardTitle></CardHeader>
          <CardContent className="py-1">
            <ul className="divide-y divide-[var(--border)]">
              {reminders.map((rule) => (
                <li key={rule.id} className="flex items-center justify-between gap-3 py-2">
                  <div><p className="text-sm text-ink">{rule.name}</p><p className="text-xs text-ink-subtle">{rule.offsetDays} day(s) {rule.offsetType.toLowerCase().replace('_', ' ')}</p></div>
                  <Badge tone={rule.isActive ? 'success' : 'neutral'}>{rule.isActive ? 'active' : 'disabled'}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Late fee rules</CardTitle></CardHeader>
          <CardContent className="py-1">
            <ul className="divide-y divide-[var(--border)]">
              {lateFees.map((rule) => (
                <li key={rule.id} className="flex items-center justify-between gap-3 py-2">
                  <div><p className="text-sm text-ink">{rule.name}</p><p className="text-xs text-ink-subtle">{rule.graceDays} grace days · {rule.kind.toLowerCase()}</p></div>
                  <Badge tone={rule.isActive ? 'success' : 'neutral'}>{rule.isActive ? 'active' : 'disabled'}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Transport fee rates</CardTitle></CardHeader>
        <CardContent className="py-1">
          <ul className="divide-y divide-[var(--border)]">
            {transportRates.map((rate) => (
              <li key={rate.id} className="flex items-center justify-between gap-3 py-2">
                <div><p className="text-sm text-ink">{rate.stop.route.name} — {rate.stop.name}</p><p className="text-xs text-ink-subtle">{rate.feeHead.name}</p></div>
                <p className="text-sm font-medium tnum">₹{(rate.amountMinor / 100).toLocaleString('en-IN')}/month</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

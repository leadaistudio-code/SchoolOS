import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import { FEATURE } from '@/lib/features'
import { listPlans } from '@/server/modules/platform/plans'
import { createPlanAction } from '../actions'

export const metadata = { title: 'Plans · Platform' }

export default async function PlansPage() {
  const ctx = await requirePlatformContext('platform.plans')
  const plans = await listPlans(ctx)
  const modules = Object.values(FEATURE).filter((k) => k.startsWith('module.'))
  const limits = Object.values(FEATURE).filter((k) => k.startsWith('limit.'))

  return (
    <div className="space-y-4">
      <PageHeader title="Plans" description="Commercial tiers and entitlement matrix." />

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <p className="text-sm text-ink-muted">{plan.code} · {plan.tier}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xl font-semibold tnum">
                {formatMoney(plan.priceMinor, plan.currency)}
                <span className="text-sm text-ink-subtle">/{plan.cycle.toLowerCase()}</span>
              </p>
              <p className="text-sm text-ink-muted">
                {plan._count.subscriptions} school{plan._count.subscriptions === 1 ? '' : 's'} ·{' '}
                {plan.trialDays}-day trial
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer text-ink-muted">Entitlements</summary>
                <ul className="mt-2 space-y-1 max-h-48 overflow-auto">
                  {plan.entitlements.map((e) => (
                    <li key={e.featureKey} className="flex justify-between gap-2">
                      <span className="truncate">{e.featureKey}</span>
                      <span>{e.enabled ? e.limitValue ?? 'on' : 'off'}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New plan</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPlanAction} className="grid gap-3 sm:grid-cols-3">
            <Input name="code" placeholder="CODE" required />
            <Input name="name" placeholder="Display name" required />
            <select name="tier" className="h-9 rounded-[var(--radius-sm)] border border-line px-2 text-sm" required>
              {['STARTER', 'PRO', 'ENTERPRISE', 'CUSTOM'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input name="priceMinor" type="number" placeholder="Price (minor units)" required />
            <Input name="trialDays" type="number" defaultValue={14} placeholder="Trial days" />
            <select name="cycle" className="h-9 rounded-[var(--radius-sm)] border border-line px-2 text-sm">
              <option value="YEARLY">Yearly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
            </select>
            <Button type="submit" className="sm:col-span-3 w-fit">
              Create plan
            </Button>
          </form>
          <p className="text-xs text-ink-subtle mt-3">
            New plans are created with default entitlements for every feature key.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

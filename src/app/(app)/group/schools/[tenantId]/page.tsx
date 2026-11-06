import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireGroupOwner } from '@/server/modules/group/access'
import { groupFigures, groupTrend } from '@/server/modules/group/figures'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { BalancesCard, ExpenseCategoriesCard, HeadlineTiles, MoneyCard, PeriodTabs, resolvePeriod, TrendCard } from '../../parts'

export const metadata = { title: 'School · Group overview' }

export default async function GroupSchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>
  searchParams: Promise<{ period?: string }>
}) {
  const [{ scope }, { tenantId }, { period: raw }] = await Promise.all([requireGroupOwner(), params, searchParams])
  const school = scope.schools.find((s) => s.tenantId === tenantId)
  if (!school) notFound()
  const period = resolvePeriod(raw)
  const [{ total, expenseByCategory }, trend] = await Promise.all([groupFigures([school], period.range), groupTrend([tenantId])])

  return (
    <div className="space-y-4">
      <Link href={`/group?period=${period.key}`} className="text-sm text-[var(--brand-600)] hover:underline">
        ← Group overview
      </Link>
      <ColorBanner tone="admissions" eyebrow={scope.groupName} title={school.name} description="This school's figures within the group." />

      <PeriodTabs base={`/group/schools/${tenantId}`} active={period.key} />

      <HeadlineTiles total={total} periodLabel={period.label} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <MoneyCard total={total} periodLabel={period.label} />
        <BalancesCard total={total} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <TrendCard months={trend} />
        <ExpenseCategoriesCard rows={expenseByCategory} periodLabel={period.label} />
      </div>
    </div>
  )
}

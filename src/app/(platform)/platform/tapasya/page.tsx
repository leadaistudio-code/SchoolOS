import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Metric, MetricRow } from '@/components/ui/metric'
import { listSeasons, moderationList, platformOverview, recentAudit, scoringVersions } from '@/server/modules/tapasya/admin'
import { TapasyaConsole } from './tapasya-console'

export const metadata = { title: 'Tapasya · Platform' }

export default async function PlatformTapasyaPage() {
  await requirePlatformContext('platform.tapasya')
  const [overview, versions, seasons, profiles, audit] = await Promise.all([platformOverview(), scoringVersions(), listSeasons(), moderationList({}), recentAudit()])
  const xp = (status: string) => overview.xp7d.find((x) => x.status === status)
  const profileTotal = Object.values(overview.profiles).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tapasya Mode"
        description={`Global XP rules v${overview.scoring.version} · leaderboard ${overview.settings.leaderboardEnabled ? 'open' : 'paused'} · counts below are aggregates, never student identities`}
      />
      <MetricRow columns={4}>
        <Metric label="Visible profiles" value={String(overview.profiles.ACTIVE ?? 0)} sub={`${profileTotal} total · ${overview.profiles.PENDING_GUARDIAN ?? 0} awaiting guardian · ${overview.participatingSchools} schools`} />
        <Metric label="Sessions, 7 days" value={String(overview.sessions7d)} />
        <Metric label="XP validated, 7 days" value={String(xp('VALIDATED')?.points ?? 0)} sub={`${xp('PENDING')?.events ?? 0} pending · ${xp('REJECTED')?.events ?? 0} rejected`} />
        <Metric label="Capped awards, 7 days" value={String(overview.cappedEvents7d)} />
      </MetricRow>
      <TapasyaConsole overview={overview} versions={versions} seasons={seasons} profiles={profiles} audit={audit} />
    </div>
  )
}

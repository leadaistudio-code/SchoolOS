import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, Section } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { LinkTabs } from '@/components/ui/tabs'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { requireContext } from '@/server/context'
import { getBoard } from '@/server/modules/tapasya/leaderboard'
import { getOwnProfile } from '@/server/modules/tapasya/profiles'
import { schoolBoard } from '@/server/modules/tapasya/admin'
import { getGlobalSettings, getSchoolPolicy } from '@/server/modules/tapasya/config'
import { demoLeaderboard } from '@/lib/tapasya/demo'
import type { GlobalLeaderboardPeriod } from '@prisma/client'
import { StudentTabs } from '../_components/student-tabs'
import { findStudent } from '../_components/student-page'
import { AliasAvatar } from '../_components/alias-avatar'
import { ProfilePanel } from './profile-panel'

export const metadata = { title: 'Leaderboard · Tapasya' }

const PERIODS: { key: GlobalLeaderboardPeriod; label: string }[] = [
  { key: 'DAILY', label: 'Today' },
  { key: 'WEEKLY', label: 'This week' },
  { key: 'MONTHLY', label: 'This month' },
  { key: 'SEASON', label: 'Season' },
  { key: 'ALL_TIME', label: 'All time' },
]

type View = GlobalLeaderboardPeriod | 'SCHOOL' | 'PREVIEW'

export default async function TapasyaLeaderboardPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  const ctx = await requireContext()
  if (!ctx.canAny('tapasya.use', 'tapasya.guardian', 'tapasya.teach', 'tapasya.manage')) redirect('/403')
  const sp = await searchParams
  const [student, settings, policy] = await Promise.all([findStudent(ctx), getGlobalSettings(), getSchoolPolicy(ctx)])
  const view: View = sp.view === 'SCHOOL' && policy.schoolLeaderboardEnabled ? 'SCHOOL' : sp.view === 'PREVIEW' && settings.previewEnabled ? 'PREVIEW' : PERIODS.find((p) => p.key === sp.view)?.key ?? 'WEEKLY'
  const page = Math.max(1, Number(sp.page) || 1)
  const profile = student ? await getOwnProfile(ctx) : null

  const tabs = [
    ...PERIODS.map((p) => ({ label: p.label, href: `/tapasya/leaderboard?view=${p.key}`, active: view === p.key })),
    ...(policy.schoolLeaderboardEnabled ? [{ label: 'My school', href: '/tapasya/leaderboard?view=SCHOOL', active: view === 'SCHOOL' }] : []),
    ...(settings.previewEnabled ? [{ label: 'Example', href: '/tapasya/leaderboard?view=PREVIEW', active: view === 'PREVIEW' }] : []),
  ]

  return (
    <div>
      <PageHeader title="Leaderboard" description="Students from every participating school, ranked by XP under the same rules. Aliases only — no names, photos or schools." />
      {student ? <StudentTabs active="/tapasya/leaderboard" /> : null}

      {!settings.leaderboardEnabled ? <Notice tone="info" className="mb-4" title="The global leaderboard is paused">XP still counts and will show here when it reopens.</Notice> : null}

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <LinkTabs items={tabs} label="Leaderboard period" />
          <div className="mt-4">
            {view === 'PREVIEW' ? <PreviewBoard /> : view === 'SCHOOL' ? <SchoolBoard rows={(await schoolBoard(ctx, 'WEEKLY', null)).rows} /> : <LiveBoard period={view} page={page} viewerUserId={ctx.user.userId} />}
          </div>
        </div>
        {student ? (
          <ProfilePanel profile={profile} allowed={policy.globalLeaderboardAllowed && policy.enabled} />
        ) : null}
      </div>
    </div>
  )
}

async function LiveBoard({ period, page, viewerUserId }: { period: GlobalLeaderboardPeriod; page: number; viewerUserId: string }) {
  const board = await getBoard({ period, page, pageSize: 50, viewerUserId })
  const pages = Math.max(1, Math.ceil(board.total / board.pageSize))
  if (period === 'SEASON' && !board.periodKey) return <Card><EmptyState title="No season is running" description="Seasons are announced by MyCampusView. All-time and weekly rankings are always available." /></Card>
  return (
    <div>
      {board.you && !board.rows.some((r) => r.isYou) ? (
        <Card className="mb-3 border-[var(--brand-100)]">
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <span className="w-10 text-right text-lg font-semibold tnum">#{board.you.rank}</span>
            <AliasAvatar avatarKey={board.you.avatarKey} />
            <span className="font-medium text-ink">{board.you.alias} <span className="text-ink-subtle">(you)</span></span>
            <span className="ml-auto tnum text-ink">{board.you.xp} XP</span>
          </CardContent>
        </Card>
      ) : null}
      {board.rows.length === 0 ? (
        <Card><EmptyState title="No one ranked yet" description="Rankings fill in as students with a visible profile complete focus intervals." /></Card>
      ) : (
        <TableWrap>
          <Table>
            <THead><TR><TH className="w-16">Rank</TH><TH>Student</TH><TH>Badges</TH><TH className="text-right">XP</TH></TR></THead>
            <TBody>
              {board.rows.map((r) => (
                <TR key={`${r.rank}-${r.alias}`} className={r.isYou ? 'bg-[var(--brand-50)]' : undefined}>
                  <TD className="tnum">
                    #{r.rank}
                    {r.movement ? <span className={r.movement > 0 ? 'ml-1 text-xs text-[var(--success)]' : 'ml-1 text-xs text-ink-subtle'}>{r.movement > 0 ? `▲${r.movement}` : `▼${-r.movement}`}</span> : null}
                  </TD>
                  <TD>
                    <span className="flex items-center gap-2">
                      <AliasAvatar avatarKey={r.avatarKey} />
                      <span className="text-ink">{r.alias}</span>
                      {r.isYou ? <Badge tone="brand">You</Badge> : null}
                    </span>
                  </TD>
                  <TD className="text-sm text-ink-muted">{r.badges.length ? `${r.badges.length} earned` : ''}</TD>
                  <TD className="text-right tnum">{r.xp}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
      {pages > 1 ? (
        <p className="mt-3 text-sm text-ink-muted tnum">
          Page {page} of {pages}
          {page > 1 ? <a className="ml-3 text-[var(--brand-600)] hover:underline" href={`/tapasya/leaderboard?view=${period}&page=${page - 1}`}>Previous</a> : null}
          {page < pages ? <a className="ml-3 text-[var(--brand-600)] hover:underline" href={`/tapasya/leaderboard?view=${period}&page=${page + 1}`}>Next</a> : null}
        </p>
      ) : null}
    </div>
  )
}

function SchoolBoard({ rows }: { rows: { rank: number; name: string; xp: number }[] }) {
  if (!rows.length) return <Card><EmptyState title="No XP this week yet" description="Your school's board resets every Monday." /></Card>
  return (
    <TableWrap>
      <Table>
        <THead><TR><TH className="w-16">Rank</TH><TH>Student</TH><TH className="text-right">XP this week</TH></TR></THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.rank}><TD className="tnum">#{r.rank}</TD><TD>{r.name}</TD><TD className="text-right tnum">{r.xp}</TD></TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  )
}

function PreviewBoard() {
  const rows = demoLeaderboard()
  return (
    <div>
      <Notice tone="warning" className="mb-3" title="Example only — not real students or scores">This shows what the board looks like. None of these aliases or numbers belong to anyone, and they never appear in live rankings.</Notice>
      <TableWrap>
        <Table>
          <THead><TR><TH className="w-16">Rank</TH><TH>Example alias</TH><TH className="text-right">XP</TH></TR></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.rank} className="opacity-80">
                <TD className="tnum">#{r.rank}</TD>
                <TD><span className="flex items-center gap-2"><AliasAvatar avatarKey={r.avatarKey} /><span>{r.alias}</span><Badge tone="warning">Example</Badge></span></TD>
                <TD className="text-right tnum">{r.xp}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  )
}

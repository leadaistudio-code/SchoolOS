import { Medal, Trophy, Users } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listSports, sportsSetup } from '@/server/modules/sports/service'
import { ColorBanner, ColorTile } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { AddMemberForm, CreateSportForm, CreateTeamForm } from './forms'
import { formatNumber } from '@/lib/utils'

export const metadata = { title: 'Sports' }

export default async function SportsPage() {
  const ctx = await requireContext('sports.view')
  const sports = await listSports(ctx)
  const setup = ctx.can('sports.manage') ? await sportsSetup(ctx) : null

  const teams = sports.flatMap((s) =>
    s.teams.map((t) => ({ id: t.id, label: `${s.name} · ${t.name}` })),
  )
  const teamCount = sports.reduce((sum, s) => sum + s.teams.length, 0)
  const memberCount = sports.reduce(
    (sum, s) => sum + s.teams.reduce((tSum, t) => tSum + t._count.members, 0),
    0,
  )

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="attendance"
        eyebrow="Sports"
        title={
          sports.length > 0
            ? `${formatNumber(sports.length)} sports programmes`
            : 'Sports, teams and squads'
        }
        description="Sports, teams and squad members."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Sports"
          value={formatNumber(sports.length)}
          sub="Programmes on offer"
          tone="attendance"
          href="#sports-list"
          icon={<Trophy className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Teams"
          value={formatNumber(teamCount)}
          sub="Across all sports"
          tone="students"
          href="#sports-list"
          icon={<Medal className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Squad members"
          value={formatNumber(memberCount)}
          sub="Students on teams"
          tone="parents"
          href="#sports-list"
          icon={<Users className="size-5" aria-hidden />}
          delayMs={120}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card id="sports-list" variant="elevated" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Sports · {sports.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sports.length === 0 ? (
              <EmptyState title="No sports yet" description="Add cricket, football, athletics and more." />
            ) : (
              sports.map((sport) => (
                <div key={sport.id} className="rounded-[var(--radius-sm)] border border-line p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink">{sport.name}</p>
                    {sport.category ? <Badge tone="neutral">{sport.category}</Badge> : null}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {sport.teams.map((team) => (
                      <li key={team.id} className="text-sm text-ink-muted">
                        {team.name}
                        {team.ageGroup ? ` (${team.ageGroup})` : ''}
                        <span className="text-xs text-ink-subtle"> · {team._count.members} members</span>
                      </li>
                    ))}
                    {sport.teams.length === 0 ? (
                      <li className="text-xs text-ink-subtle">No teams yet</li>
                    ) : null}
                  </ul>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {setup ? (
          <div className="space-y-6">
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Add sport</CardTitle>
              </CardHeader>
              <CardContent>
                <CreateSportForm />
              </CardContent>
            </Card>
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Add team</CardTitle>
              </CardHeader>
              <CardContent>
                <CreateTeamForm sports={sports.map((s) => ({ id: s.id, name: s.name }))} />
              </CardContent>
            </Card>
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Add member</CardTitle>
              </CardHeader>
              <CardContent>
                <AddMemberForm
                  teams={teams}
                  students={setup.students.map((s) => ({
                    id: s.id,
                    label: `${s.firstName} ${s.lastName} · ${s.admissionNo}`,
                  }))}
                />
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  )
}

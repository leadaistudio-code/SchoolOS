import { requireContext } from '@/server/context'
import { listSports, sportsSetup } from '@/server/modules/sports/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { AddMemberForm, CreateSportForm, CreateTeamForm } from './forms'

export const metadata = { title: 'Sports' }

export default async function SportsPage() {
  const ctx = await requireContext('sports.view')
  const sports = await listSports(ctx)
  const setup = ctx.can('sports.manage') ? await sportsSetup(ctx) : null

  const teams = sports.flatMap((s) =>
    s.teams.map((t) => ({ id: t.id, label: `${s.name} · ${t.name}` })),
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Sports" description="Sports, teams and squad members." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
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
            <Card>
              <CardHeader>
                <CardTitle>Add sport</CardTitle>
              </CardHeader>
              <CardContent>
                <CreateSportForm />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Add team</CardTitle>
              </CardHeader>
              <CardContent>
                <CreateTeamForm sports={sports.map((s) => ({ id: s.id, name: s.name }))} />
              </CardContent>
            </Card>
            <Card>
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

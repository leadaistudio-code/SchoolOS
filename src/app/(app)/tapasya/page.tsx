import Link from 'next/link'
import { Flame, Timer, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, Section } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Progress } from '@/components/ui/progress'
import { EmptyState, Notice } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { studentDashboard } from '@/server/modules/tapasya/dashboard'
import { RESTRICTION_LABEL, type RestrictionLevel } from '@/lib/tapasya/device'
import { StudentTabs } from './_components/student-tabs'
import { requireStudentPage } from './_components/student-page'

export const metadata = { title: 'Tapasya Mode' }

export default async function TapasyaDashboardPage() {
  const { ctx, student } = await requireStudentPage()
  const d = await studentDashboard(ctx, student)
  const s = d.summary
  const earned = s.achievements.filter((a) => a.awardedAt)

  return (
    <div>
      <PageHeader
        title="Tapasya Mode"
        description={`Level ${s.level.level} · ${s.totalXp} XP · ${s.streakDays}-day streak`}
        actions={<Link href="/tapasya/focus" className={buttonVariants({ variant: 'primary' })}><Timer className="size-4" aria-hidden /> Start focusing</Link>}
      />
      <StudentTabs active="/tapasya" />

      {!d.policy.enabled ? (
        <Notice tone="warning" title="Tapasya Mode is switched off for your school">Your history is kept. Ask your school if you expected it to be on.</Notice>
      ) : null}

      {d.activeSession ? (
        <Card className="mb-5 border-[var(--brand-100)]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">A focus session is running</span>
                <Badge tone="brand">{RESTRICTION_LABEL[d.activeSession.restrictionLevel as RestrictionLevel]}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                Cycle {Math.min(d.activeSession.engine.currentCycle, d.activeSession.plannedCycles)} of {d.activeSession.plannedCycles}
                {d.activeSession.task ? ` · ${d.activeSession.task.title}` : ''}
              </p>
            </div>
            <Link href="/tapasya/focus" className={buttonVariants({ variant: 'primary', size: 'sm' })}>Return to session</Link>
          </CardContent>
        </Card>
      ) : null}

      <MetricRow columns={4} className="mb-5">
        <Metric label="XP today" value={String(s.todayXp)} sub={`Daily cap ${s.caps.daily}`} />
        <Metric label="XP this week" value={String(s.weekXp)} sub={s.pendingXp ? `${s.pendingXp} pending validation` : `Weekly cap ${s.caps.weekly}`} />
        <Metric label="Focus streak" value={`${s.streakDays} day${s.streakDays === 1 ? '' : 's'}`} sub={`${s.intervalsThisWeek} intervals this week`} />
        <Metric label="Focus time" value={`${Math.floor(s.focusMinutes / 60)}h ${s.focusMinutes % 60}m`} sub={`${s.completedIntervals} completed intervals`} />
      </MetricRow>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Frog of the Day" description="Do the hardest, most important task first." actions={<Link href="/tapasya/plan" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Plan</Link>}>
          {d.today.primaryFrog ? (
            <Card>
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Flame className="size-4 text-[var(--warning)]" aria-hidden />
                  <span className="font-medium text-ink">{d.today.primaryFrog.title}</span>
                  {d.today.primaryFrog.isMandatory ? <Badge tone="warning">Required by teacher</Badge> : null}
                  <Badge tone={d.today.primaryFrog.status === 'DONE' ? 'success' : 'neutral'}>{d.today.primaryFrog.status === 'DONE' ? 'Done' : 'To do'}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {d.today.primaryFrog.subject ? `${d.today.primaryFrog.subject} · ` : ''}~{d.today.primaryFrog.estimatedMinutes} min planned · {d.today.primaryFrog.actualMinutes} min done
                </p>
                {d.today.primaryFrog.status !== 'DONE' ? (
                  <Link href={`/tapasya/focus?task=${d.today.primaryFrog.id}`} className={buttonVariants({ variant: 'subtle', size: 'sm', className: 'mt-3' })}>Focus on this frog</Link>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card><EmptyState title="No frog chosen yet" description={`You have ${d.today.open.length} open task${d.today.open.length === 1 ? '' : 's'}. Pick the one you would most like to avoid.`} action={<Link href="/tapasya/plan" className={buttonVariants({ variant: 'primary', size: 'sm' })}>Choose today’s frog</Link>} /></Card>
          )}
        </Section>

        <Section title={`Level ${s.level.level}`} description={`${s.level.nextLevelXp - s.totalXp} XP to level ${s.level.level + 1}`}>
          <Card>
            <CardContent className="pt-5">
              <Progress value={Math.round(s.level.progress * 100)} label={`Level progress ${Math.round(s.level.progress * 100)}%`} />
              <div className="mt-4 flex flex-wrap gap-2">
                {earned.length ? earned.map((a) => <Badge key={a.key} tone="success"><Trophy className="size-3" aria-hidden /> {a.title}</Badge>) : <span className="text-sm text-ink-muted">Complete a 25-minute focus interval to earn your first achievement.</span>}
              </div>
              <p className="mt-4 text-sm text-ink-muted">
                Global leaderboard: {d.globalProfile ? <><strong>{d.globalProfile.alias}</strong> · {d.globalProfile.status === 'ACTIVE' ? 'visible' : d.globalProfile.status === 'PENDING_GUARDIAN' ? 'waiting for your guardian' : 'not visible'}</> : d.policy.globalLeaderboardAllowed ? 'not joined' : 'not available at your school'}
                {' · '}<Link href="/tapasya/leaderboard" className="text-[var(--brand-600)] hover:underline">Open</Link>
              </p>
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  )
}

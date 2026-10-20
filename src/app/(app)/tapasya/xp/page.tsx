import { Trophy } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, Section } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Progress } from '@/components/ui/progress'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { xpLedger, xpSummary } from '@/server/modules/tapasya/dashboard'
import { scoringAt } from '@/server/modules/tapasya/config'
import { formatDate, formatWhen } from '../_components/format'
import { StudentTabs } from '../_components/student-tabs'
import { requireStudentPage } from '../_components/student-page'

export const metadata = { title: 'XP & Achievements · Tapasya' }

const EVENT_LABEL: Record<string, string> = {
  FOCUS_INTERVAL: 'Focus interval',
  ALL_CYCLES_BONUS: 'All cycles completed',
  FROG_BONUS: 'Primary frog finished',
  ACHIEVEMENT: 'Achievement',
  CORRECTION: 'Correction',
}

export default async function TapasyaXpPage() {
  const { ctx, student } = await requireStudentPage()
  const [s, ledger, scoring] = await Promise.all([xpSummary(ctx, student.userId), xpLedger(ctx, student.userId, 1, 30), scoringAt(new Date())])
  const r = scoring.rules

  return (
    <div>
      <PageHeader title="XP & Achievements" description={`Level ${s.level.level} · ${s.totalXp} XP`} />
      <StudentTabs active="/tapasya/xp" />

      <MetricRow columns={4} className="mb-5">
        <Metric label="Total XP" value={String(s.totalXp)} sub={s.pendingXp ? `${s.pendingXp} pending validation` : undefined} />
        <Metric label="This week" value={String(s.weekXp)} sub={`Cap ${s.caps.weekly}`} />
        <Metric label="Today" value={String(s.todayXp)} sub={`Cap ${s.caps.daily}`} />
        <Metric label="Streak" value={`${s.streakDays} days`} />
      </MetricRow>

      <Card className="mb-5">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between text-sm"><span className="text-ink">Level {s.level.level}</span><span className="text-ink-muted tnum">{s.totalXp} / {s.level.nextLevelXp} XP</span></div>
          <Progress className="mt-2" value={Math.round(s.level.progress * 100)} label="Level progress" />
        </CardContent>
      </Card>

      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1fr_1.2fr]">
        <Section title="Achievements">
          <div className="grid gap-2 sm:grid-cols-2">
            {s.achievements.map((a) => (
              <Card key={a.key} className={a.awardedAt ? 'border-[color-mix(in_srgb,var(--success)_35%,transparent)]' : 'opacity-70'}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className={a.awardedAt ? 'size-4 text-[var(--success)]' : 'size-4 text-ink-subtle'} aria-hidden />
                    <span className="font-medium text-ink">{a.title}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{a.description}</p>
                  <p className="mt-1 text-xs text-ink-subtle">{a.awardedAt ? `Earned ${formatDate(a.awardedAt)}` : 'Not yet earned'}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="How XP works" description={`Same rules for every student on the global board (version ${scoring.version}).`}>
          <Card>
            <CardContent className="pt-5 text-sm text-ink-muted">
              <ul className="list-disc space-y-1 pl-5">
                <li>{r.durationMode === 'FLAT' ? `Each completed focus interval of ${r.minEligibleFocusMinutes}–${r.maxEligibleFocusMinutes} minutes earns ${r.basePerInterval} XP, whatever its length — longer timers do not buy rank.` : `A completed focus interval earns ${r.basePerInterval} XP plus ${r.perMinute} per minute.`}</li>
                <li>The interval must run its full length with at most {r.maxPausesPerInterval} pauses.</li>
                <li>Finishing every planned cycle (at least {r.allCyclesMinCycles}) adds {r.allCyclesBonus} XP. Finishing your primary frog on its day, after focusing on it, adds {r.frogBonus} XP once a day.</li>
                <li>Each achievement adds {r.achievementXp} XP once.</li>
                <li>Caps: {r.dailyCap} XP a day and {r.weeklyCap} a week. Sessions that ran offline count once they are checked.</li>
                <li>Phone restrictions never change XP: a timer-only session earns the same as one on a locked-down device.</li>
              </ul>
            </CardContent>
          </Card>
        </Section>
      </div>

      <Section title="XP ledger" className="mt-5" description="Every award, and anything that did not count, with the reason.">
        {ledger.items.length === 0 ? (
          <Card><EmptyState title="No XP yet" description="Complete a focus interval to see your first entry." /></Card>
        ) : (
          <TableWrap>
            <Table>
              <THead><TR><TH>When</TH><TH>For</TH><TH>XP</TH><TH>Status</TH><TH>Note</TH></TR></THead>
              <TBody>
                {ledger.items.map((e) => (
                  <TR key={e.id}>
                    <TD className="tnum whitespace-nowrap">{formatWhen(e.occurredAt)}</TD>
                    <TD>{EVENT_LABEL[e.eventType] ?? e.eventType}</TD>
                    <TD className="tnum">{e.points > 0 ? `+${e.points}` : e.points}</TD>
                    <TD><Badge tone={e.status === 'VALIDATED' ? 'success' : e.status === 'PENDING' ? 'warning' : 'neutral'}>{e.status === 'VALIDATED' ? 'Counted' : e.status === 'PENDING' ? 'Pending' : 'Not counted'}</Badge></TD>
                    <TD className="text-sm text-ink-muted">{e.rejectionReason ?? e.correctionReason ?? (e.flags.includes('CAPPED') ? 'Trimmed by the daily or weekly cap.' : e.flags.includes('OFFLINE') ? 'Recorded offline.' : '')}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Section>
    </div>
  )
}

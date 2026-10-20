import { redirect } from 'next/navigation'
import { Flame } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, Section } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { requireContext } from '@/server/context'
import { guardianOverview } from '@/server/modules/tapasya/guardian'
import { UNLOCK_ACTION_LABEL } from '@/server/modules/tapasya/unlock'
import { CAPABILITY_LABEL, RESTRICTION_LABEL, type CapabilityState, type RestrictionLevel } from '@/lib/tapasya/device'
import { formatWhen } from '../_components/format'
import { ConsentButtons, UnlockDecision } from './actions'

export const metadata = { title: 'Guardian approvals · Tapasya' }

const UNLOCK_STATUS: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' }> = {
  PENDING: { label: 'Waiting for you', tone: 'warning' },
  DELIVERY_FAILED: { label: 'Message not delivered', tone: 'warning' },
  APPROVED: { label: 'Allowed', tone: 'success' },
  REJECTED: { label: 'Declined', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  CANCELLED: { label: 'Withdrawn by child', tone: 'neutral' },
}

const CONSENT_STATUS: Record<string, string> = {
  PENDING_GUARDIAN: 'Your child asked to join the global leaderboard under the alias below. Only the alias, avatar and XP are shown — never their name, photo or school.',
  ACTIVE: 'Visible on the global leaderboard.',
  OPTED_OUT: 'Not on the global leaderboard.',
  SCHOOL_DISABLED: 'The school has paused global participation.',
  SUSPENDED: 'Hidden by MyCampusView moderators.',
}

export default async function TapasyaGuardianPage() {
  const ctx = await requireContext()
  if (!ctx.can('tapasya.guardian')) redirect('/403')
  const { children, unlocks } = await guardianOverview(ctx)
  const open = unlocks.filter((u) => (u.status === 'PENDING' || u.status === 'DELIVERY_FAILED') && new Date(u.expiresAt).getTime() > Date.now())
  const pendingConsent = children.filter((c) => c.leaderboard?.status === 'PENDING_GUARDIAN')

  return (
    <div>
      <PageHeader title="Tapasya — guardian" description="Focus progress, phone-access requests and leaderboard consent for your children." />

      {children.length === 0 ? (
        <Card><EmptyState title="No linked children" description="Ask the school office to link your child to your parent account." /></Card>
      ) : null}

      {open.length ? (
        <Section title="Requests waiting for you" description="Your child asked to step out of a focus session. Each request expires after 10 minutes. You can also reply with the code sent on WhatsApp.">
          <div className="grid gap-2 lg:grid-cols-2">
            {open.map((u) => (
              <Card key={u.id} className="border-[color-mix(in_srgb,var(--warning)_35%,transparent)]">
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{u.studentName}</span>
                    <Badge tone={UNLOCK_STATUS[u.status]?.tone ?? 'neutral'}>{UNLOCK_STATUS[u.status]?.label ?? u.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink">Wants to {UNLOCK_ACTION_LABEL[u.action] ?? u.action} for {u.requestedMinutes} min.</p>
                  <p className="mt-1 text-sm text-ink-muted">“{u.reason}”</p>
                  <p className="mt-1 text-xs text-ink-subtle">Asked {formatWhen(u.createdAt)} · expires {formatWhen(u.expiresAt)}</p>
                  {u.deliveryFailed ? <p className="mt-1 text-xs text-[var(--warning)]">The WhatsApp/SMS message could not be delivered, so please decide here.</p> : null}
                  <div className="mt-3"><UnlockDecision id={u.id} requestedMinutes={u.requestedMinutes} /></div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-subtle">Allowing a request lets the MyCampusView app lift its own focus restrictions for that time. It cannot override restrictions set by the school’s device management.</p>
        </Section>
      ) : null}

      {pendingConsent.length ? (
        <Notice tone="info" className="mt-5" title="Leaderboard consent needed">{pendingConsent.map((c) => c.name).join(', ')} asked to join the global leaderboard. Review below.</Notice>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {children.map((c) => (
          <Section key={c.studentId} title={c.name} description={c.summary ? `Level ${c.summary.level.level} · ${c.summary.totalXp} XP · ${c.summary.streakDays}-day streak` : 'No student login yet'}>
            <Card>
              <CardContent className="space-y-4 pt-5">
                {c.summary ? (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><div className="text-ink-subtle">This week</div><div className="tnum text-ink">{c.summary.weekXp} XP</div></div>
                    <div><div className="text-ink-subtle">Focus time</div><div className="tnum text-ink">{Math.floor(c.summary.focusMinutes / 60)}h {c.summary.focusMinutes % 60}m</div></div>
                    <div><div className="text-ink-subtle">Open tasks</div><div className="tnum text-ink">{c.openTasks}</div></div>
                  </div>
                ) : null}

                <div className="text-sm">
                  <div className="text-ink-subtle">Frog of the Day</div>
                  {c.primaryFrog ? (
                    <div className="mt-1 flex items-center gap-2 text-ink">
                      <Flame className="size-4 text-[var(--warning)]" aria-hidden />{c.primaryFrog.title}
                      <Badge tone={c.primaryFrog.status === 'DONE' ? 'success' : 'neutral'}>{c.primaryFrog.status === 'DONE' ? 'Done' : 'To do'}</Badge>
                    </div>
                  ) : <div className="mt-1 text-ink-muted">Not chosen today.</div>}
                </div>

                <div className="text-sm">
                  <div className="text-ink-subtle">Recent sessions</div>
                  {c.recentSessions.length ? (
                    <ul className="mt-1 space-y-1">
                      {c.recentSessions.map((s) => (
                        <li key={s.id} className="flex flex-wrap gap-x-2 text-ink">
                          <span className="tnum">{formatWhen(s.startedAt)}</span>
                          <span className="text-ink-muted">{s.focusMinutes} min focus · {s.completedCycles}/{s.plannedCycles} cycles · {RESTRICTION_LABEL[s.restrictionLevel as RestrictionLevel]}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <div className="mt-1 text-ink-muted">No sessions yet.</div>}
                </div>

                <div className="text-sm">
                  <div className="text-ink-subtle">Phones</div>
                  {c.devices.length ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {c.devices.map((d) => <Badge key={d.id} tone="neutral">{d.platform} · {CAPABILITY_LABEL[d.capabilityState as CapabilityState] ?? d.capabilityState}</Badge>)}
                    </div>
                  ) : <div className="mt-1 text-ink-muted">The mobile app has not reported a phone yet.</div>}
                </div>

                <div className="border-t border-[var(--border)] pt-4 text-sm">
                  <div className="text-ink-subtle">Global leaderboard</div>
                  {c.leaderboard ? (
                    <>
                      <p className="mt-1 text-ink">Alias <strong>{c.leaderboard.alias}</strong></p>
                      <p className="mt-1 text-ink-muted">{CONSENT_STATUS[c.leaderboard.status] ?? c.leaderboard.status}</p>
                      <div className="mt-2"><ConsentButtons studentId={c.studentId} status={c.leaderboard.status} /></div>
                    </>
                  ) : <p className="mt-1 text-ink-muted">Not requested.</p>}
                </div>
              </CardContent>
            </Card>
          </Section>
        ))}
      </div>

      {unlocks.length > open.length ? (
        <Section title="Past requests" className="mt-5">
          <Card>
            <CardContent className="pt-4">
              <ul className="divide-y divide-[var(--border)] text-sm">
                {unlocks.filter((u) => !open.includes(u)).slice(0, 20).map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="tnum text-ink-subtle">{formatWhen(u.createdAt)}</span>
                    <span className="text-ink">{u.studentName}</span>
                    <span className="text-ink-muted">{UNLOCK_ACTION_LABEL[u.action] ?? u.action}, {u.requestedMinutes} min</span>
                    <Badge tone={UNLOCK_STATUS[u.status]?.tone ?? 'neutral'}>{UNLOCK_STATUS[u.status]?.label ?? u.status}</Badge>
                    {u.decidedVia ? <span className="text-xs text-ink-subtle">via {u.decidedVia === 'GUARDIAN_APP' ? 'app' : 'code'}</span> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </Section>
      ) : null}
    </div>
  )
}

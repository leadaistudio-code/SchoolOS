import React from 'react'
import { Alert, View } from 'react-native'
import { router } from 'expo-router'
import { ScreenHeader, SectionTitle } from '@/components/header'
import { Badge, Button, Card, EmptyState, ErrorState, ListRow, Screen, SkeletonList, Txt } from '@/components/ui'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { colors, radius, spacing } from '@/theme'
import { RESTRICTION_LABEL } from '@/tapasya/device'
import {
  useGuardianConsent,
  useGuardianOverview,
  useGuardianUnlockDecision,
  useSessionHistory,
  useTapasyaDashboard,
  type GuardianChild,
  type GuardianUnlock,
} from '@/tapasya/api'

const ACTION_LABEL: Record<string, string> = {
  OPEN_APPS: 'use other apps',
  END_SESSION: 'end the focus session early',
  BREAK_APPS: 'use other apps during the break',
}

/**
 * Tapasya Mode home. Students see their focus dashboard; parents see their
 * children's progress and any requests waiting for them.
 */
export default function TapasyaScreen() {
  const roles = useAuth((s) => s.session?.roles ?? [])
  const canUse = useAuth((s) => s.can('tapasya.use'))
  const canGuard = useAuth((s) => s.can('tapasya.guardian'))
  if (roles.includes('STUDENT') && canUse) return <StudentHome />
  if (roles.includes('PARENT') && canGuard) return <GuardianHome />
  return (
    <Screen padded={false} header={<ScreenHeader title="Tapasya Mode" onBack={() => router.back()} />}>
      <EmptyState title="Open Tapasya on the web" body="Class progress, task assignment and school settings are on the MyCampusView website. The phone app is for students and parents." />
    </Screen>
  )
}

function Bar({ value, tint }: { value: number; tint: string }) {
  return (
    <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden', marginTop: spacing.sm }}>
      <View style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, height: '100%', backgroundColor: tint }} />
    </View>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 140 }}>
      <Txt variant="caption" color={colors.textSubtle}>{label}</Txt>
      <Txt variant="metric">{value}</Txt>
      {sub ? <Txt variant="caption" color={colors.textSubtle}>{sub}</Txt> : null}
    </View>
  )
}

function StudentHome() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const { data, isLoading, error, refetch, isRefetching } = useTapasyaDashboard()
  const history = useSessionHistory()

  if (isLoading) return <Screen padded={false} header={<ScreenHeader title="Tapasya Mode" tint={brand} onBack={() => router.back()} />}><View style={{ padding: spacing.base }}><SkeletonList rows={4} /></View></Screen>
  if (error || !data) return <Screen padded={false} header={<ScreenHeader title="Tapasya Mode" tint={brand} onBack={() => router.back()} />}><ErrorState message={error instanceof ApiError ? error.message : 'Could not load Tapasya.'} onRetry={refetch} /></Screen>

  const s = data.summary
  const frog = data.today.primaryFrog
  return (
    <Screen
      scroll
      refreshing={isRefetching}
      onRefresh={() => { void refetch(); void history.refetch() }}
      padded={false}
      header={<ScreenHeader title="Tapasya Mode" subtitle={`Level ${s.level.level} · ${s.totalXp} XP · ${s.streakDays}-day streak`} tint={brand} onBack={() => router.back()} />}
    >
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
        {!data.policy.enabled ? (
          <Card><Txt variant="bodyStrong">Tapasya Mode is switched off for your school.</Txt><Txt variant="small" color={colors.textMuted}>Your history is kept.</Txt></Card>
        ) : null}

        {data.activeSession ? (
          <Card onPress={() => router.push('/(app)/tapasya-focus')} accessibilityLabel="Return to your focus session">
            <Txt variant="bodyStrong">A focus session is running</Txt>
            <Txt variant="small" color={colors.textMuted}>{RESTRICTION_LABEL[data.activeSession.restrictionLevel]} · tap to return</Txt>
          </Card>
        ) : (
          <Button label="Start focusing" onPress={() => router.push('/(app)/tapasya-focus')} disabled={!data.policy.enabled} style={{ marginBottom: spacing.md }} />
        )}

        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <Stat label="XP today" value={String(s.todayXp)} sub={`cap ${s.caps.daily}`} />
            <Stat label="XP this week" value={String(s.weekXp)} sub={s.pendingXp ? `${s.pendingXp} pending` : `cap ${s.caps.weekly}`} />
          </View>
          <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.md }}>Level {s.level.level} → {s.level.level + 1}: {s.level.nextLevelXp - s.totalXp} XP to go</Txt>
          <Bar value={s.level.progress} tint={brand} />
        </Card>

        <SectionTitle tint={brand} action={<Button label="Plan" variant="ghost" onPress={() => router.push('/(app)/tapasya-plan')} />}>Frog of the Day</SectionTitle>
        {frog ? (
          <Card>
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
              <Txt variant="bodyStrong">{frog.title}</Txt>
              {frog.isMandatory ? <Badge label="Required by teacher" tone="warning" /> : null}
              <Badge label={frog.status === 'DONE' ? 'Done' : 'To do'} tone={frog.status === 'DONE' ? 'success' : 'neutral'} />
            </View>
            <Txt variant="small" color={colors.textMuted}>~{frog.estimatedMinutes} min planned · {frog.actualMinutes} min done</Txt>
            {frog.status !== 'DONE' ? <Button label="Focus on this frog" variant="secondary" onPress={() => router.push({ pathname: '/(app)/tapasya-focus', params: { task: frog.id } })} style={{ marginTop: spacing.md }} /> : null}
          </Card>
        ) : (
          <Card onPress={() => router.push('/(app)/tapasya-plan')} accessibilityLabel="Choose today's frog">
            <Txt variant="bodyStrong">No frog chosen yet</Txt>
            <Txt variant="small" color={colors.textMuted}>You have {data.today.open.length} open tasks. Pick the one you would most like to avoid.</Txt>
          </Card>
        )}

        <SectionTitle tint={brand}>Achievements</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {s.achievements.filter((a) => a.awardedAt).length
            ? s.achievements.filter((a) => a.awardedAt).map((a) => <Badge key={a.key} label={a.title} tone="success" />)
            : <Txt variant="small" color={colors.textMuted}>Complete a 25-minute focus interval to earn your first achievement.</Txt>}
        </View>

        <SectionTitle tint={brand}>Recent sessions</SectionTitle>
        <Card style={{ paddingVertical: 0 }}>
          {(history.data ?? []).slice(0, 5).map((h) => (
            <ListRow
              key={h.id}
              title={h.task?.title ?? `${h.focusMinutes} min focus`}
              subtitle={`${h.completedCycles}/${h.plannedCycles} cycles · ${h.state.toLowerCase()}${h.xp.rejected[0]?.reason ? ` · ${h.xp.rejected[0].reason}` : ''}`}
              right={<Txt variant="smallStrong" color={colors.success}>+{h.xp.validated}</Txt>}
            />
          ))}
          {history.data && history.data.length === 0 ? <View style={{ padding: spacing.base }}><Txt variant="small" color={colors.textMuted}>No sessions yet.</Txt></View> : null}
        </Card>

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
          <Button label="Leaderboard" variant="secondary" onPress={() => router.push('/(app)/tapasya-leaderboard')} style={{ flex: 1 }} />
          <Button label="Phone controls" variant="secondary" onPress={() => router.push('/(app)/tapasya-device')} style={{ flex: 1 }} />
        </View>
      </View>
    </Screen>
  )
}

function GuardianHome() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const { data, isLoading, error, refetch, isRefetching } = useGuardianOverview()
  const decide = useGuardianUnlockDecision()
  const consent = useGuardianConsent()

  async function decideUnlock(u: GuardianUnlock, decision: 'APPROVE' | 'REJECT') {
    try {
      await decide.mutateAsync({ id: u.id, decision })
    } catch (err) {
      Alert.alert('Not saved', err instanceof ApiError ? err.message : 'Please try again.')
    }
  }

  async function decideConsent(c: GuardianChild, decision: 'APPROVE' | 'DECLINE' | 'WITHDRAW') {
    try {
      await consent.mutateAsync({ studentId: c.studentId, decision })
    } catch (err) {
      Alert.alert('Not saved', err instanceof ApiError ? err.message : 'Please try again.')
    }
  }

  const header = <ScreenHeader title="Tapasya Mode" subtitle="Your children’s focus time and requests" tint={brand} onBack={() => router.back()} />
  if (isLoading) return <Screen padded={false} header={header}><View style={{ padding: spacing.base }}><SkeletonList rows={4} /></View></Screen>
  if (error || !data) return <Screen padded={false} header={header}><ErrorState message={error instanceof ApiError ? error.message : 'Could not load.'} onRetry={refetch} /></Screen>

  const open = data.unlocks.filter((u) => (u.status === 'PENDING' || u.status === 'DELIVERY_FAILED') && new Date(u.expiresAt).getTime() > Date.now())

  return (
    <Screen scroll padded={false} refreshing={isRefetching} onRefresh={refetch} header={header}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
        {data.children.length === 0 ? <EmptyState title="No linked children" body="Ask the school office to link your child to your account." /> : null}

        {open.length ? <SectionTitle tint={brand}>Waiting for you</SectionTitle> : null}
        {open.map((u) => (
          <Card key={u.id}>
            <Txt variant="bodyStrong">{u.studentName} wants to {ACTION_LABEL[u.action] ?? u.action} for {u.requestedMinutes} min</Txt>
            <Txt variant="small" color={colors.textMuted}>“{u.reason}”</Txt>
            <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>Expires {new Date(u.expiresAt).toLocaleTimeString()}. Allowing lifts the app’s own focus restrictions only, never the school’s device management.</Txt>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button label="Allow" onPress={() => void decideUnlock(u, 'APPROVE')} loading={decide.isPending} style={{ flex: 1 }} />
              <Button label="Decline" variant="secondary" onPress={() => void decideUnlock(u, 'REJECT')} style={{ flex: 1 }} />
            </View>
          </Card>
        ))}

        {data.children.map((c) => (
          <View key={c.studentId}>
            <SectionTitle tint={brand}>{c.name}</SectionTitle>
            <Card>
              {c.summary ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                  <Stat label="This week" value={`${c.summary.weekXp} XP`} />
                  <Stat label="Focus time" value={`${Math.floor(c.summary.focusMinutes / 60)}h ${c.summary.focusMinutes % 60}m`} sub={`${c.summary.streakDays}-day streak`} />
                </View>
              ) : <Txt variant="small" color={colors.textMuted}>No student login yet.</Txt>}
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.md }}>
                Frog of the Day: {c.primaryFrog ? `${c.primaryFrog.title} (${c.primaryFrog.status === 'DONE' ? 'done' : 'to do'})` : 'not chosen'} · {c.openTasks} open tasks
              </Txt>
              {c.leaderboard ? (
                <View style={{ marginTop: spacing.md }}>
                  <Txt variant="smallStrong">Global leaderboard alias: {c.leaderboard.alias}</Txt>
                  {c.leaderboard.status === 'PENDING_GUARDIAN' ? (
                    <>
                      <Txt variant="small" color={colors.textMuted}>Your child asked to join. Only the alias, avatar and XP are shown — never their name, photo or school.</Txt>
                      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                        <Button label="Approve" onPress={() => void decideConsent(c, 'APPROVE')} style={{ flex: 1 }} />
                        <Button label="Decline" variant="secondary" onPress={() => void decideConsent(c, 'DECLINE')} style={{ flex: 1 }} />
                      </View>
                    </>
                  ) : c.leaderboard.status === 'ACTIVE' ? (
                    <Button label="Withdraw consent" variant="ghost" onPress={() => Alert.alert('Withdraw consent?', 'Your child’s alias is removed from the global leaderboard. Their XP is kept.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Withdraw', style: 'destructive', onPress: () => void decideConsent(c, 'WITHDRAW') }])} />
                  ) : <Txt variant="small" color={colors.textMuted}>Not on the global board.</Txt>}
                </View>
              ) : null}
            </Card>
          </View>
        ))}
      </View>
    </Screen>
  )
}

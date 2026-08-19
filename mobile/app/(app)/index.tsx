import React from 'react'
import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useDashboard } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { Card, EmptyState, ErrorState, IconTile, ModuleTile, Screen, SkeletonList, Txt } from '@/components/ui'
import { ScreenHeader, SectionTitle } from '@/components/header'
import { count, friendlyDate, money, moneyShort } from '@/lib/format'
import { visibleModules } from '@/navigation/modules'
import { colors, radius, spacing } from '@/theme'

/**
 * Home.
 *
 * Answers the four questions a principal opens their phone to ask — how many
 * children are here, was the register taken, what came in, what is owed — and
 * then gets out of the way. Everything below the figures is something to act
 * on rather than something to read.
 *
 * Nothing here is invented: every number is a field of `/dashboard`, which is
 * the same function the web page renders from. A user without `dashboard.view`
 * gets the quick actions and their notices instead of an error.
 */
export default function HomeScreen() {
  const session = useAuth((s) => s.session)
  const can = useAuth((s) => s.can)
  const { data, isLoading, isRefetching, refetch, error } = useDashboard()

  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const permitted = can('dashboard.view')
  const modules = visibleModules(session?.permissions ?? []).filter((m) => m.ready)

  return (
    <Screen scroll refreshing={isRefetching} onRefresh={refetch} header={
      <ScreenHeader
        title={`${greeting()}, ${session?.firstName ?? ''}`}
        subtitle={session?.tenantName || 'MyCampusView'}
        tint={brand}
        person={`${session?.firstName ?? ''} ${session?.lastName ?? ''}`}
        onAction={() => router.push('/(app)/search')}
        actionIcon="search-outline"
        actionLabel="Search"
      />
    }>

      {!permitted ? (
        <Card>
          <Txt variant="bodyStrong">Your dashboard</Txt>
          <Txt variant="small" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>
            Your role does not include the school overview. Everything you do have access to is below.
          </Txt>
        </Card>
      ) : isLoading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load the overview.'} onRetry={refetch} />
      ) : data ? (
        <>
          {/* The four figures. Two rows of two: four across is unreadable on a
              small phone, and a horizontal scroll hides the last one. */}
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Stat
              label="Students"
              value={count(data.people.students)}
              tint={colors.students}
              icon="people"
            />
            <Stat
              label="Present today"
              value={data.attendance.marked > 0 ? `${data.attendance.percent}%` : '—'}
              hint={
                data.attendance.marked > 0
                  ? `${count(data.attendance.present)} of ${count(data.attendance.marked)} marked`
                  : 'Register not taken'
              }
              tint={data.attendance.marked > 0 ? colors.attendance : colors.textSubtle}
              icon="checkmark-circle"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Stat
              label="Collected today"
              value={moneyShort(data.finance.collectedTodayMinor)}
              hint={`${count(data.finance.paymentsToday)} payment${data.finance.paymentsToday === 1 ? '' : 's'}`}
              tint={colors.fees}
              icon="card"
            />
            <Stat
              label="Outstanding"
              value={moneyShort(data.finance.outstandingMinor)}
              hint={`${count(data.finance.overdueInvoices)} overdue`}
              tint={data.finance.overdueInvoices > 0 ? colors.overdue : colors.textSubtle}
              icon="alert-circle"
            />
          </View>

          {/* Needs attention. The one part of the screen that is work rather
              than information, so it earns its place above the fold. */}
          {data.attendance.marked < data.attendance.expected && can('attendance.mark') ? (
            <Card onPress={() => router.push('/(app)/attendance')} accessibilityLabel="Take the register">
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.warningBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="time-outline" size={19} color={colors.warning} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Txt variant="bodyStrong">Register not complete</Txt>
                  <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2 }}>
                    {count(data.attendance.expected - data.attendance.marked)} students not yet marked today
                  </Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              </View>
            </Card>
          ) : null}

          {/* Everything this person can open, three across on one white card.
              A grid of coloured tiles is scanned; a column of grey rows is
              read, and reading is slower when you already know what you came
              for. */}
          <SectionTitle tint={brand}>Tools</SectionTitle>
          <Card style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.xs }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {modules.map((m) => (
                <ModuleTile
                  key={m.key}
                  icon={m.icon}
                  label={m.title}
                  tint={m.tint}
                  width="33.33%"
                  onPress={() => router.push(m.href as never)}
                />
              ))}
            </View>
          </Card>

          {/* Latest notices */}
          {data.recentNotices?.length ? (
            <>
              <SectionTitle tint={brand}>Latest notices</SectionTitle>
              <Card>
                {data.recentNotices.slice(0, 3).map((n, i, arr) => (
                  <View
                    key={n.id}
                    style={{
                      paddingVertical: spacing.sm,
                      borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Txt variant="bodyStrong" numberOfLines={2}>{n.title}</Txt>
                    <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: 3 }}>
                      {friendlyDate(n.publishOn)}
                    </Txt>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <Txt variant="caption" color={colors.textSubtle} style={{ textAlign: 'center', marginTop: spacing.lg }}>
            {money(data.finance.collectedMonthMinor)} collected this month
          </Txt>
        </>
      ) : (
        <EmptyState title="Nothing to show yet" body="Once the school has students and fees on the system, this screen fills in." />
      )}
    </Screen>
  )
}

/**
 * One figure.
 *
 * The number carries the module's colour and the icon sits on a soft chip of
 * the same hue. Four grey cards were readable but gave the eye nothing to
 * catch — colour here is what makes "outstanding" findable at a glance rather
 * than read in sequence.
 */
function Stat({
  label,
  value,
  hint,
  tint,
  icon,
}: {
  label: string
  value: string
  hint?: string
  tint: string
  icon: React.ComponentProps<typeof Ionicons>['name']
}) {
  return (
    <Card style={{ flex: 1, borderColor: `${tint}26` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
        <IconTile icon={icon} tint={tint} size={30} soft />
        <Txt variant="caption" color={colors.textSubtle} style={{ marginLeft: spacing.sm, flex: 1 }} numberOfLines={2}>
          {label}
        </Txt>
      </View>
      <Txt variant="metric" color={tint} numberOfLines={1}>{value}</Txt>
      {hint ? (
        <Txt variant="caption" color={colors.textSubtle} numberOfLines={1} style={{ marginTop: 3 }}>{hint}</Txt>
      ) : null}
    </Card>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

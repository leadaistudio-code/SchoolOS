import React from 'react'
import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useDashboard } from '@/api/hooks'
import type { SchoolDashboard, SelfDashboardStudent } from '@/api/types'
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
  const tapasya = modules.find((m) => m.key === 'tapasya')
  // Older servers sent the school payload without a scope field.
  const school: SchoolDashboard | null =
    data && (data.scope === 'SCHOOL' || (!data.scope && 'people' in data)) ? (data as SchoolDashboard) : null

  const tools = (
    <>
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
    </>
  )

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

      {tapasya ? <TapasyaCard tint={tapasya.tint} /> : null}

      {!permitted ? (
        <>
          <Card>
            <Txt variant="bodyStrong">Your dashboard</Txt>
            <Txt variant="small" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>
              Your role does not include the school overview. Everything you do have access to is below.
            </Txt>
          </Card>
          {tools}
        </>
      ) : isLoading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load the overview.'} onRetry={refetch} />
      ) : data?.scope === 'SELF' ? (
        <>
          <SelfOverview students={data.students} tint={brand} />
          {tools}
        </>
      ) : data?.scope === 'TEACHER' ? (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Stat label="My students" value={count(data.studentCount)} tint={colors.students} icon="people" />
            <Stat
              label="My classes"
              value={count(data.classCount)}
              hint={`${count(data.sectionCount)} section${data.sectionCount === 1 ? '' : 's'}`}
              tint={colors.attendance}
              icon="school"
            />
          </View>
          {tools}
        </>
      ) : school ? (
        <>
          {/* The four figures. Two rows of two: four across is unreadable on a
              small phone, and a horizontal scroll hides the last one. */}
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Stat
              label="Students"
              value={count(school.people.students)}
              tint={colors.students}
              icon="people"
            />
            <Stat
              label="Present today"
              value={school.attendance.marked > 0 ? `${school.attendance.percent}%` : '—'}
              hint={
                school.attendance.marked > 0
                  ? `${count(school.attendance.present)} of ${count(school.attendance.marked)} marked`
                  : 'Register not taken'
              }
              tint={school.attendance.marked > 0 ? colors.attendance : colors.textSubtle}
              icon="checkmark-circle"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Stat
              label="Collected today"
              value={moneyShort(school.finance.collectedTodayMinor)}
              hint={`${count(school.finance.paymentsToday)} payment${school.finance.paymentsToday === 1 ? '' : 's'}`}
              tint={colors.fees}
              icon="card"
            />
            <Stat
              label="Outstanding"
              value={moneyShort(school.finance.outstandingMinor)}
              hint={`${count(school.finance.overdueInvoices)} overdue`}
              tint={school.finance.overdueInvoices > 0 ? colors.overdue : colors.textSubtle}
              icon="alert-circle"
            />
          </View>

          {/* Needs attention. The one part of the screen that is work rather
              than information, so it earns its place above the fold. */}
          {school.attendance.marked < school.attendance.expected && can('attendance.mark') ? (
            <Card onPress={() => router.push('/(app)/attendance')} accessibilityLabel="Take the register">
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.warningBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="time-outline" size={19} color={colors.warning} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Txt variant="bodyStrong">Register not complete</Txt>
                  <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2 }}>
                    {count(school.attendance.expected - school.attendance.marked)} students not yet marked today
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
          {tools}

          {/* Latest notices */}
          {school.recentNotices?.length ? (
            <>
              <SectionTitle tint={brand}>Latest notices</SectionTitle>
              <Card>
                {school.recentNotices.slice(0, 3).map((n, i, arr) => (
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
            {money(school.finance.collectedMonthMinor)} collected this month
          </Txt>
        </>
      ) : data && data.scope !== 'SCHOOL' ? (
        tools
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

/** The way into Tapasya Mode, above everything else for the people who use it. */
function TapasyaCard({ tint }: { tint: string }) {
  return (
    <Card onPress={() => router.push('/(app)/tapasya')} accessibilityLabel="Open Tapasya Mode" style={{ borderColor: `${tint}40` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconTile icon="timer" tint={tint} size={36} soft />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Txt variant="bodyStrong">Tapasya Mode</Txt>
          <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2 }}>
            Focus sessions, frogs and XP
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      </View>
    </Card>
  )
}

/** A parent's children, or a student's own record. */
function SelfOverview({ students, tint }: { students: SelfDashboardStudent[]; tint: string }) {
  if (students.length === 0) {
    return (
      <Card>
        <Txt variant="bodyStrong">No student linked yet</Txt>
        <Txt variant="small" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>
          Ask the school office to link your account to a student record.
        </Txt>
      </Card>
    )
  }
  return (
    <>
      <SectionTitle tint={tint}>{students.length === 1 ? 'Student' : 'Your children'}</SectionTitle>
      <Card>
        {students.map((s, i, arr) => {
          const klass = [s.className, s.sectionName].filter(Boolean).join(' – ')
          return (
            <View
              key={s.id}
              style={{
                paddingVertical: spacing.sm,
                borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <Txt variant="bodyStrong" numberOfLines={1}>{`${s.firstName} ${s.lastName}`.trim()}</Txt>
              <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: 3 }} numberOfLines={1}>
                {[klass || null, s.rollNumber != null ? `Roll ${s.rollNumber}` : null, s.admissionNo]
                  .filter(Boolean)
                  .join(' · ')}
              </Txt>
            </View>
          )
        })}
      </Card>
    </>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

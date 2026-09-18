import React from 'react'
import { FlatList, View } from 'react-native'
import { useMyTimetable } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Badge, Card, EmptyState, ErrorState, Screen, SkeletonList, Txt } from '@/components/ui'
import { ScreenHeader } from '@/components/header'
import { useAuth } from '@/auth/store'
import { longDate } from '@/lib/format'
import { colors, radius, spacing } from '@/theme'
import type { TimetableCell, TimetablePeriod } from '@/api/types'

/**
 * Today's periods for the signed-in teacher.
 *
 * The web shows a full week grid. On a phone the useful question at 8am is
 * "what do I teach next", so we flatten today into a chronological list and
 * highlight the current period when the clock falls inside it.
 */

function dayOfWeek(date: Date): number {
  // API uses ISO: 1 = Monday … 6 = Saturday (Sunday unused).
  const js = date.getDay()
  return js === 0 ? 7 : js
}

function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function nowMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

type PeriodRow = {
  period: TimetablePeriod
  cell: TimetableCell
  current: boolean
  past: boolean
}

export default function TimetableScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const { data, isLoading, isRefetching, refetch, error } = useMyTimetable()
  const today = React.useMemo(() => new Date(), [])
  const dow = dayOfWeek(today)
  const clock = nowMinutes(today)

  const rows = React.useMemo((): PeriodRow[] => {
    if (!data) return []
    const out: PeriodRow[] = []
    for (const period of data.periods) {
      if (period.isBreak) continue
      const cell = data.cells[period.id]?.[dow]
      if (!cell?.slotId) continue
      const start = parseHm(period.startTime)
      const end = parseHm(period.endTime)
      const current = start != null && end != null && clock >= start && clock < end
      const past = end != null && clock >= end
      out.push({ period, cell, current, past })
    }
    return out
  }, [data, dow, clock])

  const dayLabel = data?.days.find((d) => d.value === dow)?.label ?? longDate(today)
  const who = data?.staff
    ? `${data.staff.firstName} ${data.staff.lastName}`.trim()
    : null

  return (
    <Screen
      padded={false}
      header={
        <ScreenHeader
          title="Timetable"
          subtitle={who ? `${dayLabel} · ${who}` : dayLabel}
          tint={brand}
        />
      }
    >
      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList rows={6} /></View>
      ) : error ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load timetable.'}
          onRetry={refetch}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.period.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={
            rows.length === 0
              ? { flexGrow: 1, paddingHorizontal: spacing.base }
              : { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl }
          }
          ListEmptyComponent={
            <EmptyState
              title={dow === 7 ? 'Sunday — no timetable' : 'Nothing scheduled today'}
              body="Periods appear here once your weekly timetable is published."
            />
          }
          ListHeaderComponent={
            rows.length > 0 ? (
              <Txt variant="caption" color={colors.textSubtle} style={{ marginBottom: spacing.sm }}>
                {rows.length} period{rows.length === 1 ? '' : 's'} today
              </Txt>
            ) : null
          }
          renderItem={({ item }) => (
            <Card
              style={{
                borderWidth: item.current ? 2 : 0,
                borderColor: item.current ? brand : 'transparent',
                opacity: item.past && !item.current ? 0.55 : 1,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 64,
                    marginRight: spacing.md,
                    paddingVertical: 2,
                    borderRadius: radius.base,
                  }}
                >
                  <Txt variant="caption" color={colors.textSubtle}>{item.period.name}</Txt>
                  <Txt variant="smallStrong" style={{ marginTop: 2 }}>
                    {item.period.startTime}
                  </Txt>
                  <Txt variant="caption" color={colors.textSubtle}>{item.period.endTime}</Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                      {item.cell.subject ?? '—'}
                    </Txt>
                    {item.current ? <Badge label="Now" tone="success" /> : null}
                  </View>
                  {item.cell.teacher ? (
                    <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }} numberOfLines={1}>
                      {item.cell.teacher}
                    </Txt>
                  ) : null}
                  {item.cell.roomName ? (
                    <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: 2 }}>
                      {item.cell.roomName}
                    </Txt>
                  ) : null}
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </Screen>
  )
}

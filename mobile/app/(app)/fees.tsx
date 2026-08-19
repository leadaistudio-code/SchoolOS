import React from 'react'
import { FlatList, View } from 'react-native'
import { useOutstanding } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Card, EmptyState, ErrorState, Screen, SkeletonList, Txt } from '@/components/ui'
import { ScreenHeader } from '@/components/header'
import { useAuth } from '@/auth/store'
import { count, money, moneyShort } from '@/lib/format'
import { colors, radius, spacing } from '@/theme'

/**
 * Outstanding fees, by class.
 *
 * The web shows this as a table with six columns. On a phone that becomes one
 * card per class with a proportion bar, because the question being asked is
 * "which classes are the problem" — a comparison, which a bar answers at a
 * glance and a column of right-aligned numbers does not.
 */
export default function FeesScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const { data, isLoading, isRefetching, refetch, error } = useOutstanding()

  const totals = React.useMemo(() => {
    const rows = data ?? []
    return {
      outstanding: rows.reduce((n, r) => n + r.outstandingMinor, 0),
      overdue: rows.reduce((n, r) => n + r.overdueMinor, 0),
      students: rows.reduce((n, r) => n + r.students, 0),
    }
  }, [data])

  const worst = Math.max(1, ...(data ?? []).map((r) => r.outstandingMinor))

  return (
    <Screen
      padded={false}
      header={<ScreenHeader title="Fees" subtitle="Outstanding by class, read live" tint={brand} />}
    >

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList rows={6} /></View>
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load fees.'} onRetry={refetch} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.className}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={{ paddingHorizontal: spacing.base, paddingBottom: spacing.xxl }}
          ListEmptyComponent={<EmptyState title="Nothing outstanding" body="Every invoice raised has been paid." />}
          ListHeaderComponent={
            (data?.length ?? 0) > 0 ? (
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Card style={{ flex: 1 }}>
                  <Txt variant="caption" color={colors.textSubtle}>Total outstanding</Txt>
                  <Txt variant="metric" style={{ marginTop: spacing.xs }}>{moneyShort(totals.outstanding)}</Txt>
                  <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: 2 }}>
                    across {count(totals.students)} students
                  </Txt>
                </Card>
                <Card style={{ flex: 1 }}>
                  <Txt variant="caption" color={colors.textSubtle}>Overdue</Txt>
                  <Txt variant="metric" color={colors.overdue} style={{ marginTop: spacing.xs }}>
                    {moneyShort(totals.overdue)}
                  </Txt>
                  <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: 2 }}>
                    past its due date
                  </Txt>
                </Card>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const share = item.outstandingMinor / worst
            const overdueShare = item.outstandingMinor > 0 ? item.overdueMinor / item.outstandingMinor : 0
            return (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{item.className}</Txt>
                  <Txt variant="bodyStrong">{money(item.outstandingMinor)}</Txt>
                </View>

                {/* Two-tone bar: the whole amount, with the overdue part in
                    red. One glance says both how much and how bad. */}
                <View
                  accessibilityLabel={`${money(item.overdueMinor)} of ${money(item.outstandingMinor)} is overdue`}
                  style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, marginTop: spacing.sm, overflow: 'hidden', flexDirection: 'row' }}
                >
                  <View style={{ width: `${Math.max(2, share * 100)}%`, backgroundColor: colors.fees, flexDirection: 'row' }}>
                    <View style={{ width: `${overdueShare * 100}%`, backgroundColor: colors.overdue }} />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
                  <Txt variant="caption" color={colors.textSubtle} style={{ flex: 1 }}>
                    {count(item.students)} student{item.students === 1 ? '' : 's'}
                  </Txt>
                  {item.overdueMinor > 0 ? (
                    <Txt variant="caption" color={colors.overdue}>{money(item.overdueMinor)} overdue</Txt>
                  ) : (
                    <Txt variant="caption" color={colors.success}>Nothing overdue</Txt>
                  )}
                </View>
              </Card>
            )
          }}
        />
      )}
    </Screen>
  )
}

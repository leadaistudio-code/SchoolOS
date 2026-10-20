import React from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { ScreenHeader } from '@/components/header'
import { Badge, Card, EmptyState, ErrorState, Screen, SkeletonList, Txt } from '@/components/ui'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { colors, radius, spacing } from '@/theme'
import { useLeaderboard } from '@/tapasya/api'

const PERIODS = [
  { key: 'DAILY', label: 'Today' },
  { key: 'WEEKLY', label: 'Week' },
  { key: 'MONTHLY', label: 'Month' },
  { key: 'SEASON', label: 'Season' },
  { key: 'ALL_TIME', label: 'All time' },
] as const

/**
 * The global board: aliases and XP only. Joining (choosing an alias) and
 * leaving are done on the web, where a guardian's approval is also handled.
 */
export default function TapasyaLeaderboardScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const [period, setPeriod] = React.useState<(typeof PERIODS)[number]['key']>('WEEKLY')
  const { data, isLoading, error, refetch, isRefetching } = useLeaderboard(period)

  return (
    <Screen
      padded={false}
      header={<ScreenHeader title="Leaderboard" subtitle="Every participating school, same rules. Aliases only." tint={brand} onBack={() => router.back()} />}
    >
      <View style={{ flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.base, paddingVertical: spacing.md }}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setPeriod(p.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === p.key }}
            style={{ flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: period === p.key ? brand : colors.surface, borderWidth: 1, borderColor: period === p.key ? brand : colors.border }}
          >
            <Txt variant="caption" color={period === p.key ? colors.textOnDark : colors.textMuted}>{p.label}</Txt>
          </Pressable>
        ))}
      </View>
      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList rows={6} /></View>
      ) : error || !data ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load.'} onRetry={refetch} />
      ) : (
        <FlatList
          data={data.rows}
          keyExtractor={(r) => `${r.rank}-${r.alias}`}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={data.rows.length ? { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl } : { flexGrow: 1 }}
          ListHeaderComponent={data.you && !data.rows.some((r) => r.isYou) ? (
            <Card style={{ borderColor: brand, borderWidth: 1 }}>
              <Txt variant="bodyStrong">You: #{data.you.rank} · {data.you.alias} · {data.you.xp} XP</Txt>
            </Card>
          ) : null}
          ListEmptyComponent={<EmptyState title={period === 'SEASON' && !data.periodKey ? 'No season is running' : 'No one ranked yet'} body="Rankings fill in as students with a visible profile complete focus intervals. Choose your alias in Tapasya on the web." />}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: item.isYou ? colors.brandSoft : undefined }}>
              <Txt variant="bodyStrong" style={{ width: 48 }}>#{item.rank}</Txt>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Txt variant="body">{item.alias}</Txt>
                {item.isYou ? <Badge label="You" tone="info" /> : null}
              </View>
              {item.movement ? <Txt variant="caption" color={item.movement > 0 ? colors.success : colors.textSubtle} style={{ marginRight: spacing.sm }}>{item.movement > 0 ? `▲${item.movement}` : `▼${-item.movement}`}</Txt> : null}
              <Txt variant="bodyStrong">{item.xp}</Txt>
            </View>
          )}
        />
      )}
    </Screen>
  )
}

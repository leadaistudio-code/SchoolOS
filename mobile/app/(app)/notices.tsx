import React from 'react'
import { FlatList, View } from 'react-native'
import { useNotices } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Badge, Card, EmptyState, ErrorState, Screen, SkeletonList, Txt } from '@/components/ui'
import { friendlyDate } from '@/lib/format'
import { colors, spacing } from '@/theme'

/**
 * Notices.
 *
 * Expanded in place rather than pushed to a detail screen: a notice is three
 * sentences, and making somebody navigate for three sentences and then come
 * back is worse than showing them.
 */
export default function NoticesScreen() {
  const { data, isLoading, isRefetching, refetch, error } = useNotices()
  const [open, setOpen] = React.useState<string | null>(null)

  // Pinned first, then newest. A pinned notice is pinned because somebody
  // decided it outranks recency.
  const notices = React.useMemo(() => {
    return [...(data ?? [])].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.publishOn).getTime() - new Date(a.publishOn).getTime()
    })
  }, [data])

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Txt variant="h1" accessibilityRole="header">Notices</Txt>
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList rows={5} /></View>
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load notices.'} onRetry={refetch} />
      ) : (
        <FlatList
          data={notices}
          keyExtractor={(n) => n.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={
            notices.length === 0
              ? { flexGrow: 1 }
              : { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl }
          }
          ListEmptyComponent={<EmptyState title="No notices" body="Announcements from the school will appear here." />}
          renderItem={({ item }) => {
            const expanded = open === item.id
            return (
              <Card onPress={() => setOpen(expanded ? null : item.id)} accessibilityLabel={item.title}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm }}>
                  {item.pinned ? <Badge label="Pinned" tone="info" /> : null}
                  {item.priority === 'HIGH' ? <Badge label="Important" tone="danger" /> : null}
                  {item.isExpired ? <Badge label="Expired" tone="neutral" /> : null}
                </View>

                <Txt variant="bodyStrong" numberOfLines={expanded ? undefined : 2}>{item.title}</Txt>
                <Txt
                  variant="small"
                  color={colors.textMuted}
                  numberOfLines={expanded ? undefined : 2}
                  style={{ marginTop: spacing.xs }}
                >
                  {item.body}
                </Txt>

                <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
                  <Txt variant="caption" color={colors.textSubtle} style={{ flex: 1 }}>
                    {friendlyDate(item.publishOn)} · {item.audience}
                  </Txt>
                  <Txt variant="caption" color={colors.brand}>{expanded ? 'Show less' : 'Read'}</Txt>
                </View>
              </Card>
            )
          }}
        />
      )}
    </Screen>
  )
}

import React from 'react'
import { FlatList, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useExams } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Badge, EmptyState, ErrorState, ListRow, Screen, SkeletonList, Txt } from '@/components/ui'
import { ScreenHeader } from '@/components/header'
import { useAuth } from '@/auth/store'
import { longDate } from '@/lib/format'
import { colors, spacing } from '@/theme'

/**
 * Exam list → hub for attendance and/or marks entry.
 */
export default function ExamsScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const can = useAuth((s) => s.can)
  const canOpen = can('exams.attendance') || can('exams.marks') || can('exams.view')
  const { data, isLoading, isRefetching, refetch, error } = useExams()

  return (
    <Screen
      padded={false}
      header={
        <ScreenHeader
          title="Exams"
          subtitle={
            can('exams.marks')
              ? 'Attendance and marks entry'
              : can('exams.attendance')
                ? 'Tap an exam for the attendance desk'
                : 'Schedules and status'
          }
          tint={brand}
        />
      }
    >
      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList rows={6} /></View>
      ) : error ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load exams.'}
          onRetry={refetch}
        />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(e) => e.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={
            (data?.length ?? 0) === 0
              ? { flexGrow: 1 }
              : { paddingBottom: spacing.xxl }
          }
          ListEmptyComponent={
            <EmptyState title="No exams yet" body="Published and draft exams appear here once created on the web." />
          }
          renderItem={({ item }) => {
            const range = `${longDate(item.startsOn)} – ${longDate(item.endsOn)}`
            return (
              <ListRow
                title={item.name}
                subtitle={`${item.kind.toLowerCase()} · ${range}`}
                left={
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: colors.surfaceSunken,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="school-outline" size={18} color={brand} />
                  </View>
                }
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Badge
                      label={item.status.toLowerCase()}
                      tone={
                        item.status === 'PUBLISHED' ? 'success'
                        : item.status === 'DRAFT' ? 'neutral'
                        : 'info'
                      }
                    />
                    <Txt variant="caption" color={colors.textSubtle}>
                      {item._count.subjects} paper{item._count.subjects === 1 ? '' : 's'}
                    </Txt>
                  </View>
                }
                onPress={
                  canOpen
                    ? () =>
                        router.push({
                          pathname: '/(app)/exam',
                          params: { examId: item.id, name: item.name },
                        })
                    : undefined
                }
              />
            )
          }}
        />
      )}
    </Screen>
  )
}

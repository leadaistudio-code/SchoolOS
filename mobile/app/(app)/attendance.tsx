import React from 'react'
import { FlatList, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAttendanceSections } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Badge, EmptyState, ErrorState, ListRow, Screen, SkeletonList, Txt } from '@/components/ui'
import { apiDate, longDate } from '@/lib/format'
import { colors, spacing } from '@/theme'

/**
 * Which registers still need taking.
 *
 * Sorted so unmarked sections come first: a teacher opening this at 9am wants
 * the one class they are about to take, and a principal at noon wants the four
 * that have not been done. Either way the work is at the top, not sorted
 * alphabetically underneath the classes that are already finished.
 */
export default function AttendanceScreen() {
  const [date] = React.useState(() => new Date())
  const onDate = apiDate(date)
  const { data, isLoading, isRefetching, refetch, error } = useAttendanceSections(onDate)

  const sections = React.useMemo(() => {
    if (!data) return []
    return [...data].sort((a, b) => {
      const aDone = a.marked >= a.enrolled && a.enrolled > 0
      const bDone = b.marked >= b.enrolled && b.enrolled > 0
      if (aDone !== bDone) return aDone ? 1 : -1
      return a.numeric - b.numeric || a.label.localeCompare(b.label)
    })
  }, [data])

  const pending = sections.filter((s) => s.marked < s.enrolled).length

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.md }}>
        <Txt variant="h1" accessibilityRole="header">Attendance</Txt>
        <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2 }}>
          {longDate(date)}
          {data ? ` · ${pending === 0 ? 'all registers taken' : `${pending} still to take`}` : ''}
        </Txt>
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList rows={8} /></View>
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load registers.'} onRetry={refetch} />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={sections.length === 0 ? { flexGrow: 1 } : { paddingBottom: spacing.xxl }}
          ListEmptyComponent={
            <EmptyState title="No classes today" body="Sections appear here once classes are set up for the academic year." />
          }
          renderItem={({ item }) => {
            const done = item.enrolled > 0 && item.marked >= item.enrolled
            return (
              <ListRow
                title={item.label}
                subtitle={`${item.enrolled} student${item.enrolled === 1 ? '' : 's'}`}
                left={
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: done ? colors.successBg : colors.warningBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
                      name={done ? 'checkmark' : 'ellipsis-horizontal'}
                      size={18}
                      color={done ? colors.success : colors.warning}
                    />
                  </View>
                }
                right={
                  done ? (
                    <Badge label="Taken" tone="success" />
                  ) : (
                    <Badge label={item.marked > 0 ? `${item.marked}/${item.enrolled}` : 'Not taken'} tone="warning" />
                  )
                }
                onPress={() =>
                  router.push({ pathname: '/(app)/register', params: { sectionId: item.id, onDate } })
                }
              />
            )
          }}
        />
      )}
    </Screen>
  )
}

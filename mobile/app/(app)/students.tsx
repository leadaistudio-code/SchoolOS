import React from 'react'
import { ActivityIndicator, FlatList, View } from 'react-native'
import { router } from 'expo-router'
import { useStudents } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Avatar, Badge, EmptyState, ErrorState, Input, ListRow, Screen, SkeletonList, Txt } from '@/components/ui'
import { money } from '@/lib/format'
import { colors, spacing } from '@/theme'
import type { StudentRow } from '@/api/types'

/**
 * The student directory.
 *
 * A FlatList, not a ScrollView of rows: a school with three thousand children
 * is the case this screen exists for, and rendering them all at once is how a
 * mobile list becomes unusable on the mid-range Android a school actually
 * issues. Pages arrive twenty-five at a time as the list is scrolled.
 *
 * Search is debounced and runs on the server — the same `q` the web sends —
 * so typing does not pull the whole roll down to filter it locally.
 */
export default function StudentsScreen() {
  const [term, setTerm] = React.useState('')
  const [search, setSearch] = React.useState('')

  // 350ms: long enough that a name is typed as one query rather than six,
  // short enough that the list feels like it is keeping up.
  React.useEffect(() => {
    const t = setTimeout(() => setSearch(term.trim()), 350)
    return () => clearTimeout(t)
  }, [term])

  const {
    data,
    isLoading,
    isRefetching,
    refetch,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useStudents(search)

  const rows = React.useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data])

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Txt variant="h1" accessibilityRole="header">Students</Txt>
        <Input
          value={term}
          onChangeText={setTerm}
          placeholder="Search by name or admission number"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={{ marginTop: spacing.md }}
          accessibilityLabel="Search students"
        />
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList /></View>
      ) : error ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load students.'}
          onRetry={refetch}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => <StudentListRow student={item} />}
          refreshing={isRefetching}
          onRefresh={refetch}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={rows.length === 0 ? { flexGrow: 1 } : { paddingBottom: spacing.xxl }}
          ListEmptyComponent={
            <EmptyState
              title={search ? 'No matches' : 'No students yet'}
              body={
                search
                  ? `Nothing matched “${search}”. Check the spelling, or search by admission number.`
                  : 'Students added on the web will appear here.'
              }
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={{ paddingVertical: spacing.lg }}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : null
          }
        />
      )}
    </Screen>
  )
}

function StudentListRow({ student }: { student: StudentRow }) {
  const name = `${student.firstName} ${student.lastName}`.trim()
  const klass = [student.className, student.sectionName].filter(Boolean).join(' ')

  return (
    <ListRow
      title={name}
      subtitle={[student.admissionNo, klass].filter(Boolean).join(' · ')}
      left={<Avatar name={name} />}
      onPress={() => router.push({ pathname: '/(app)/student', params: { id: student.id } })}
      right={
        student.dueMinor > 0 ? (
          <Badge label={money(student.dueMinor)} tone="danger" />
        ) : student.status !== 'ACTIVE' ? (
          <Badge label={student.status.toLowerCase()} tone="neutral" />
        ) : null
      }
    />
  )
}

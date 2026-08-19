import React from 'react'
import { ActivityIndicator, FlatList, View } from 'react-native'
import { useStaff } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { Avatar, Badge, Card, EmptyState, ErrorState, Input, Screen, SkeletonList, Springy, Txt } from '@/components/ui'
import { ScreenHeader } from '@/components/header'
import { CallRow } from '@/components/contact'
import { colors, spacing } from '@/theme'
import type { Staff } from '@/api/types'

/**
 * The staff directory.
 *
 * Teaching and non-teaching in one list, filtered by a segmented control
 * rather than split into two screens — a principal looking for "who is the
 * Class 5 A teacher" and a bursar looking for the accountant are doing the
 * same thing, and two tabs would make both of them choose first.
 */
const FILTERS = [
  { key: 'ALL', label: 'Everyone' },
  { key: 'TEACHING', label: 'Teaching' },
  { key: 'NON_TEACHING', label: 'Support' },
] as const

export default function StaffScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const [term, setTerm] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]['key']>('ALL')
  const [open, setOpen] = React.useState<string | null>(null)

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(term.trim()), 350)
    return () => clearTimeout(t)
  }, [term])

  const { data, isLoading, isRefetching, refetch, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useStaff(search)

  const rows = React.useMemo(() => {
    const all = data?.pages.flatMap((p) => p.data) ?? []
    if (filter === 'ALL') return all
    // Filtered here rather than server-side: the API pages by name and does
    // not take a type filter, and a school's staff list is tens, not thousands.
    return all.filter((s) => (filter === 'TEACHING' ? s.staffType === 'TEACHING' : s.staffType !== 'TEACHING'))
  }, [data, filter])

  return (
    <Screen padded={false} header={<ScreenHeader title="Staff" subtitle="Employees and their classes" tint={brand} />}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Input
          value={term}
          onChangeText={setTerm}
          placeholder="Search by name or employee code"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search staff"
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          {FILTERS.map((f) => {
            const active = filter === f.key
            return (
              <Springy key={f.key} onPress={() => setFilter(f.key)} accessibilityLabel={f.label} style={{ flex: 1 }}>
                <View
                  style={{
                    minHeight: 38,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? brand : colors.surface,
                    borderWidth: 1,
                    borderColor: active ? brand : colors.border,
                  }}
                >
                  <Txt variant="smallStrong" color={active ? '#FFFFFF' : colors.textMuted}>{f.label}</Txt>
                </View>
              </Springy>
            )
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList /></View>
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load staff.'} onRetry={refetch} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            rows.length === 0 ? { flexGrow: 1 } : { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl }
          }
          ListEmptyComponent={
            <EmptyState
              title="Nobody here"
              body={search ? `Nothing matched “${search}”.` : 'Staff added on the web appear here.'}
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? <View style={{ paddingVertical: spacing.lg }}><ActivityIndicator color={brand} /></View> : null
          }
          renderItem={({ item }) => (
            <StaffCard member={item} expanded={open === item.id} onToggle={() => setOpen(open === item.id ? null : item.id)} />
          )}
        />
      )}
    </Screen>
  )
}

function StaffCard({ member, expanded, onToggle }: { member: Staff; expanded: boolean; onToggle: () => void }) {
  const name = `${member.firstName} ${member.lastName}`.trim()
  const teaching = member.staffType === 'TEACHING'

  return (
    <Springy onPress={onToggle} accessibilityLabel={name}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Avatar name={name} size={44} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Txt variant="bodyStrong" numberOfLines={1}>{name}</Txt>
            <Txt variant="small" color={colors.textSubtle} numberOfLines={1} style={{ marginTop: 2 }}>
              {[member.designation, member.department].filter(Boolean).join(' · ') || member.employeeCode}
            </Txt>
          </View>
          {member.isClassTeacherOf ? (
            <Badge label={member.isClassTeacherOf} tone="success" />
          ) : (
            <Badge label={teaching ? 'Teaching' : 'Support'} tone={teaching ? 'info' : 'neutral'} />
          )}
        </View>

        {expanded ? (
          <View style={{ marginTop: spacing.base, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
            <Row label="Employee code" value={member.employeeCode} />
            <Row label="Designation" value={member.designation} />
            <Row label="Department" value={member.department} />
            {member.isClassTeacherOf ? <Row label="Class teacher of" value={member.isClassTeacherOf} /> : null}
            {teaching ? <Row label="Classes taught" value={`${member.classCount}`} /> : null}
            <View style={{ marginTop: spacing.md }}>
              <CallRow phone={member.phone} email={member.email} />
            </View>
          </View>
        ) : null}
      </Card>
    </Springy>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 5 }}>
      <Txt variant="small" color={colors.textSubtle} style={{ width: 132 }}>{label}</Txt>
      <Txt variant="small" style={{ flex: 1 }}>{value}</Txt>
    </View>
  )
}

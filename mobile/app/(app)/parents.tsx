import React from 'react'
import { ActivityIndicator, FlatList, Linking, View } from 'react-native'
import { useParents } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { Avatar, Badge, Card, EmptyState, ErrorState, Input, Screen, SkeletonList, Springy, Txt } from '@/components/ui'
import { ScreenHeader } from '@/components/header'
import { CallRow } from '@/components/contact'
import { colors, spacing } from '@/theme'
import type { Parent } from '@/api/types'

/**
 * Guardians.
 *
 * The office opens this for one reason — to reach somebody about their child —
 * so the phone number is a button rather than a field to read out, and the
 * children's names are on the row rather than behind a tap. A guardian with
 * two children at the school is the common case, and knowing which two is
 * usually the whole question.
 */
export default function ParentsScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const [term, setTerm] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [open, setOpen] = React.useState<string | null>(null)

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(term.trim()), 350)
    return () => clearTimeout(t)
  }, [term])

  const { data, isLoading, isRefetching, refetch, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useParents(search)

  const rows = React.useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data])

  return (
    <Screen padded={false} header={<ScreenHeader title="Parents" subtitle="Guardians and their children" tint={brand} />}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Input
          value={term}
          onChangeText={setTerm}
          placeholder="Search by name or phone"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search parents"
        />
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList /></View>
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Could not load parents.'} onRetry={refetch} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(p) => p.id}
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
              title={search ? 'No matches' : 'No parents yet'}
              body={search ? `Nothing matched “${search}”.` : 'Guardians added with a student appear here.'}
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? <View style={{ paddingVertical: spacing.lg }}><ActivityIndicator color={brand} /></View> : null
          }
          renderItem={({ item }) => (
            <ParentCard parent={item} expanded={open === item.id} onToggle={() => setOpen(open === item.id ? null : item.id)} />
          )}
        />
      )}
    </Screen>
  )
}

function ParentCard({ parent, expanded, onToggle }: { parent: Parent; expanded: boolean; onToggle: () => void }) {
  const name = `${parent.firstName} ${parent.lastName}`.trim()

  return (
    <Springy onPress={onToggle} accessibilityLabel={name}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Avatar name={name} size={44} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Txt variant="bodyStrong" numberOfLines={1}>{name}</Txt>
            <Txt variant="small" color={colors.textSubtle} numberOfLines={1} style={{ marginTop: 2 }}>
              {parent.children.join(', ') || 'No children linked'}
            </Txt>
          </View>
          <Badge
            label={`${parent.childCount} child${parent.childCount === 1 ? '' : 'ren'}`}
            tone={parent.childCount > 0 ? 'info' : 'neutral'}
          />
        </View>

        {expanded ? (
          <View style={{ marginTop: spacing.base, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
            {parent.occupation ? (
              <Txt variant="small" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>
                {parent.occupation}
              </Txt>
            ) : null}
            {parent.email ? (
              <Txt variant="small" color={colors.textSubtle} style={{ marginBottom: spacing.md }} numberOfLines={1}>
                {parent.email}
              </Txt>
            ) : null}
            {!parent.hasLogin ? (
              <View style={{ marginBottom: spacing.md }}>
                <Badge label="No parent login yet" tone="warning" />
              </View>
            ) : null}
            <CallRow phone={parent.phone} email={parent.email} />
          </View>
        ) : null}
      </Card>
    </Springy>
  )
}

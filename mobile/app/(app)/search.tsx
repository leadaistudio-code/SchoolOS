import React from 'react'
import { FlatList, View } from 'react-native'
import { router } from 'expo-router'
import { useSearch } from '@/api/hooks'
import { Badge, EmptyState, Input, ListRow, Screen, SkeletonList, Txt } from '@/components/ui'
import { colors, spacing } from '@/theme'

/**
 * Global search, across whatever the backend indexes for this user.
 *
 * Results carry a web `href`; it is translated to a mobile route where one
 * exists rather than opened in a browser. Anything without a mobile equivalent
 * is still listed — knowing the record exists is most of the value — but is
 * not made to look tappable.
 */
export default function SearchScreen() {
  const [term, setTerm] = React.useState('')
  const [debounced, setDebounced] = React.useState('')

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300)
    return () => clearTimeout(t)
  }, [term])

  const { data, isLoading } = useSearch(debounced)

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Txt variant="h1" accessibilityRole="header">Search</Txt>
        <Input
          value={term}
          onChangeText={setTerm}
          placeholder="Students, parents, staff…"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{ marginTop: spacing.md }}
          accessibilityLabel="Search the school"
        />
      </View>

      {debounced.length < 2 ? (
        <EmptyState title="Search the school" body="Type at least two characters to look up a student, parent or staff member." />
      ) : isLoading ? (
        <View style={{ paddingHorizontal: spacing.base }}><SkeletonList rows={5} /></View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(h) => `${h.type}:${h.id}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={(data?.length ?? 0) === 0 ? { flexGrow: 1 } : undefined}
          ListEmptyComponent={<EmptyState title="No matches" body={`Nothing found for "${debounced}".`} />}
          renderItem={({ item }) => {
            const to = mobileRoute(item.type, item.id)
            return (
              <ListRow
                title={item.title}
                subtitle={item.subtitle}
                right={<Badge label={item.type} tone="neutral" />}
                onPress={to ? () => router.push(to as never) : undefined}
              />
            )
          }}
        />
      )}
    </Screen>
  )
}

/** Only the types with a screen. Everything else stays informational. */
function mobileRoute(type: string, id: string): object | null {
  if (type === 'Student') return { pathname: '/(app)/student', params: { id } }
  return null
}

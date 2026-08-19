import React from 'react'
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/auth/store'
import { Avatar, Badge, Card, IconTile, ListRow, ModuleTile, Screen, Txt } from '@/components/ui'
import { ScreenHeader } from '@/components/header'
import { MODULES, visibleModules } from '@/navigation/modules'
import { colors, spacing } from '@/theme'

/**
 * Everything not on the tab bar.
 *
 * Grouped by what a person is trying to do rather than alphabetically. Modules
 * the user has no permission for are absent entirely — a greyed-out row tells
 * somebody what they cannot have, which is not information they asked for.
 *
 * Modules that exist on the web but are not yet built here are listed under
 * "On the web" rather than hidden, so nobody hunts for a screen believing the
 * app has lost their data.
 */
export default function MoreScreen() {
  const session = useAuth((s) => s.session)
  const brand = session?.primaryHex || colors.brand
  const held = session?.permissions ?? []

  const allowed = visibleModules(held)
  const ready = allowed.filter((m) => m.ready)
  const notYet = allowed.filter((m) => !m.ready)

  return (
    <Screen
      padded={false}
      header={<ScreenHeader title="More" subtitle={session?.tenantName ?? ''} tint={brand} />}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>

        <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.base }}>
          <Card onPress={() => router.push('/(app)/settings')} accessibilityLabel="Your account">
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Avatar name={`${session?.firstName ?? ''} ${session?.lastName ?? ''}`} size={44} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Txt variant="bodyStrong" numberOfLines={1}>
                  {session?.firstName} {session?.lastName}
                </Txt>
                <Txt variant="small" color={colors.textSubtle} numberOfLines={1}>
                  {session?.roles.map(pretty).join(', ') || 'Signed in'}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </View>
          </Card>
        </View>

        {/* One grid, not five.
            Grouping is worth a heading when a group fills a row; with seven
            modules spread over five groups it produced cards that were mostly
            empty. Bring the headings back when the grid outgrows one card. */}
        <View style={{ marginTop: spacing.lg, paddingHorizontal: spacing.base }}>
          <Txt variant="smallStrong" color={colors.textSubtle} style={{ marginBottom: spacing.sm }}>
            ALL TOOLS
          </Txt>
          <Card style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.xs }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {ready.map((m) => (
                <ModuleTile
                  key={m.key}
                  icon={m.icon}
                  label={m.title}
                  tint={m.tint}
                  width="33.33%"
                  onPress={() => router.push(m.href as never)}
                />
              ))}
            </View>
          </Card>
        </View>

        {notYet.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <Txt variant="smallStrong" color={colors.textSubtle} style={{ paddingHorizontal: spacing.base, marginBottom: spacing.sm }}>
              ON THE WEB
            </Txt>
            <Txt variant="caption" color={colors.textSubtle} style={{ paddingHorizontal: spacing.base, marginBottom: spacing.md }}>
              These work in your browser and are not on the phone yet.
            </Txt>
            {notYet.map((m) => (
              <ListRow
                key={m.key}
                title={m.title}
                subtitle={m.blurb}
                left={<IconTile icon={m.icon} tint={m.tint} size={34} soft />}
                right={<Badge label="Web" tone="neutral" />}
              />
            ))}
          </View>
        ) : null}

        <Txt variant="caption" color={colors.textSubtle} style={{ textAlign: 'center', marginTop: spacing.xl }}>
          {MODULES.filter((m) => m.ready).length} of {MODULES.length} modules on mobile
        </Txt>
      </ScrollView>
    </Screen>
  )
}

/** SCHOOL_ADMIN reads badly on a profile card. */
function pretty(role: string): string {
  return role.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

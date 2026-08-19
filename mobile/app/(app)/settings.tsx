import React from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/auth/store'
import { Avatar, Badge, Button, Card, ListRow, Screen, Txt } from '@/components/ui'
import { API_BASE_URL, APP_VERSION, ANDROID_VERSION_CODE, IS_PRODUCTION_API } from '@/config'
import { colors, spacing } from '@/theme'

/** Account, school, and the way out. */
export default function SettingsScreen() {
  const session = useAuth((s) => s.session)
  const signOut = useAuth((s) => s.signOut)
  const [busy, setBusy] = React.useState(false)

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You will need your password to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setBusy(true)
          try { await signOut() } finally { setBusy(false) }
        },
      },
    ])
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
          <Txt variant="h1" accessibilityRole="header">Account</Txt>
        </View>

        <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.base }}>
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Avatar name={`${session?.firstName ?? ''} ${session?.lastName ?? ''}`} size={64} />
              <Txt variant="h2" style={{ marginTop: spacing.md }}>
                {session?.firstName} {session?.lastName}
              </Txt>
              {session?.email ? (
                <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2 }}>{session.email}</Txt>
              ) : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap', justifyContent: 'center' }}>
                {session?.roles.map((r) => (
                  <Badge key={r} label={r.toLowerCase().replace(/_/g, ' ')} tone="info" />
                ))}
              </View>
            </View>
          </Card>
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <Txt variant="smallStrong" color={colors.textSubtle} style={{ paddingHorizontal: spacing.base, marginBottom: spacing.sm }}>
            SCHOOL
          </Txt>
          <ListRow
            title={session?.tenantName || 'Your school'}
            subtitle={`Code: ${session?.tenantSlug ?? ''}`}
            left={<Ionicons name="business-outline" size={20} color={colors.brand} />}
          />
          <ListRow
            title="Permissions"
            subtitle={`${session?.permissions.length ?? 0} granted by your role`}
            left={<Ionicons name="key-outline" size={20} color={colors.brand} />}
          />
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <Txt variant="smallStrong" color={colors.textSubtle} style={{ paddingHorizontal: spacing.base, marginBottom: spacing.sm }}>
            APP
          </Txt>
          <ListRow
            title="Version"
            subtitle={`${APP_VERSION} (build ${ANDROID_VERSION_CODE})`}
            left={<Ionicons name="phone-portrait-outline" size={20} color={colors.brand} />}
          />
          {!IS_PRODUCTION_API ? (
            <ListRow
              title="Server"
              subtitle={API_BASE_URL}
              left={<Ionicons name="server-outline" size={20} color={colors.warning} />}
              right={<Badge label="Not production" tone="warning" />}
            />
          ) : null}
        </View>

        <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.xl }}>
          <Button label="Sign out" variant="danger" onPress={confirmSignOut} loading={busy} />
          <Txt variant="caption" color={colors.textSubtle} style={{ textAlign: 'center', marginTop: spacing.base }}>
            Signing out revokes this device's session on the server.
          </Txt>
        </View>
      </ScrollView>
    </Screen>
  )
}

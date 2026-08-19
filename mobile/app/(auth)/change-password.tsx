import React from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api, ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { Button, Field, Input, Txt } from '@/components/ui'
import { colors, radius, spacing } from '@/theme'

/**
 * Forced password change.
 *
 * Reached only when the session says `mustChangePassword` — a temporary
 * password issued by the office. The web redirects to /account/password for
 * exactly the same reason, and the same endpoint does the work, so the rules
 * about length and reuse are the server's, not a second copy here.
 */
export default function ChangePasswordScreen() {
  const restore = useAuth((s) => s.restore)
  const signOut = useAuth((s) => s.signOut)

  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit() {
    if (next !== confirm) { setError('The two new passwords do not match.'); return }
    if (next.length < 10) { setError('Use at least 10 characters.'); return }

    setBusy(true); setError(null)
    try {
      await api.post('/auth/password/reset', { currentPassword: current, newPassword: next })
      // Re-reading the session clears mustChangePassword and lets the app in.
      await restore()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.navy }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <Txt variant="display" color={colors.textOnDark}>Choose a password</Txt>
            <Txt variant="body" color={colors.textOnDarkMuted} style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
              Your school issued you a temporary password. Pick your own before continuing.
            </Txt>

            {error ? (
              <View style={{ backgroundColor: 'rgba(180,35,24,0.18)', borderRadius: radius.base, padding: spacing.md, marginBottom: spacing.base }}>
                <Txt variant="small" color="#FFC9C4">{error}</Txt>
              </View>
            ) : null}

            <Field label="Current password">
              <Input value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" editable={!busy} />
            </Field>
            <Field label="New password" hint="At least 10 characters.">
              <Input value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" editable={!busy} />
            </Field>
            <Field label="Confirm new password">
              <Input value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" editable={!busy} onSubmitEditing={submit} returnKeyType="go" />
            </Field>

            <Button label="Save and continue" onPress={submit} loading={busy} />
            <Button label="Sign out" variant="ghost" onPress={signOut} style={{ marginTop: spacing.sm }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

import React from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import { Redirect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ApiError } from '@/api/client'
import { useAuth, type School } from '@/auth/store'
import { getLastSchoolSlug } from '@/auth/storage'
import { Button, Field, Input, Txt } from '@/components/ui'
import { API_BASE_URL, IS_PRODUCTION_API, APP_VERSION } from '@/config'
import { colors, radius, spacing } from '@/theme'

/**
 * Sign in.
 *
 * Two steps rather than one, because the school has to be resolved before
 * anything else can happen: the web gets it free from the subdomain, and here
 * it has to be asked for. Naming the school first also means the second step
 * can carry that school's own branding, so a parent sees where they are
 * signing in rather than a generic form.
 */
export default function LoginScreen() {
  const status = useAuth((s) => s.status)
  const expiredMessage = useAuth((s) => s.expiredMessage)
  const lookupSchool = useAuth((s) => s.lookupSchool)
  const signIn = useAuth((s) => s.signIn)

  const [school, setSchool] = React.useState<School | null>(null)
  const [slug, setSlug] = React.useState('')
  const [identifier, setIdentifier] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [reveal, setReveal] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const passwordRef = React.useRef<TextInput>(null)

  React.useEffect(() => {
    getLastSchoolSlug().then((last) => { if (last) setSlug(last) })
  }, [])

  if (status === 'signedIn') return <Redirect href="/(app)" />

  async function findSchool() {
    const code = slug.trim().toLowerCase()
    if (code.length < 2) { setError('Enter your school code.'); return }

    setBusy(true); setError(null)
    try {
      const found = await lookupSchool(code)
      if (found.suspended) {
        setError('This school’s account is not active. Please contact your administrator.')
        return
      }
      setSchool(found)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not find that school.')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!school) return
    if (!identifier.trim()) { setError('Enter your email or phone number.'); return }
    if (!password) { setError('Enter your password.'); return }

    setBusy(true); setError(null)
    try {
      await signIn(school.slug, identifier, password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.')
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.navy }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>

            <Image
              source={require('../../assets/splash-mark.png')}
              style={{ width: 68, height: 68, alignSelf: 'center', marginBottom: spacing.lg }}
              resizeMode="contain"
              accessibilityLabel="MyCampusView"
            />

            <Txt variant="display" color={colors.textOnDark} style={{ textAlign: 'center' }}>
              {school ? school.name : 'MyCampusView'}
            </Txt>
            <Txt
              variant="body"
              color={colors.textOnDarkMuted}
              style={{ textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xxl }}
            >
              {school
                ? school.loginSubtext ?? 'Sign in to continue'
                : 'Enter your school code to begin'}
            </Txt>

            {expiredMessage && !error ? <Notice tone="warning" text={expiredMessage} /> : null}
            {error ? <Notice tone="danger" text={error} /> : null}

            {!school ? (
              <>
                <Field label="School code">
                  <Input
                    value={slug}
                    onChangeText={(v) => { setSlug(v); setError(null) }}
                    placeholder="e.g. demo"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    returnKeyType="go"
                    onSubmitEditing={findSchool}
                    editable={!busy}
                  />
                </Field>
                <Button label="Continue" onPress={findSchool} loading={busy} />
                <Txt variant="small" color={colors.textOnDarkMuted} style={{ textAlign: 'center', marginTop: spacing.base }}>
                  Your school code is the name in your school’s web address.
                </Txt>
              </>
            ) : (
              <>
                <Field label="Email or phone">
                  <Input
                    value={identifier}
                    onChangeText={(v) => { setIdentifier(v); setError(null) }}
                    placeholder="you@school.edu"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="username"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    editable={!busy}
                  />
                </Field>

                <Field label="Password">
                  <View style={{ justifyContent: 'center' }}>
                    <Input
                      ref={passwordRef}
                      value={password}
                      onChangeText={(v) => { setPassword(v); setError(null) }}
                      placeholder="••••••••"
                      secureTextEntry={!reveal}
                      autoCapitalize="none"
                      autoComplete="current-password"
                      returnKeyType="go"
                      onSubmitEditing={submit}
                      editable={!busy}
                      style={{ paddingRight: 76 }}
                    />
                    <Pressable
                      onPress={() => setReveal((r) => !r)}
                      accessibilityRole="button"
                      accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
                      hitSlop={12}
                      style={{ position: 'absolute', right: spacing.md, paddingVertical: spacing.sm }}
                    >
                      <Txt variant="smallStrong" color={colors.brandDeep}>{reveal ? 'Hide' : 'Show'}</Txt>
                    </Pressable>
                  </View>
                </Field>

                <Button label="Sign in" onPress={submit} loading={busy} />

                <Pressable
                  onPress={() => { setSchool(null); setPassword(''); setError(null) }}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={{ marginTop: spacing.lg, minHeight: 44, justifyContent: 'center' }}
                >
                  <Txt variant="small" color={colors.textOnDarkMuted} style={{ textAlign: 'center' }}>
                    Not {school.name}?  Change school
                  </Txt>
                </Pressable>
              </>
            )}

            {/* Which server this build talks to. Invaluable when a tester says
                "it does not work" and is pointed at a machine that is off. */}
            <Txt variant="caption" color={colors.textOnDarkMuted} style={{ textAlign: 'center', marginTop: spacing.xxl, opacity: 0.7 }}>
              v{APP_VERSION}{IS_PRODUCTION_API ? '' : ` · ${API_BASE_URL}`}
            </Txt>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Notice({ text, tone }: { text: string; tone: 'danger' | 'warning' }) {
  const bg = tone === 'danger' ? 'rgba(180,35,24,0.18)' : 'rgba(147,89,10,0.22)'
  const fg = tone === 'danger' ? '#FFC9C4' : '#FFE1AE'
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: bg, borderRadius: radius.base, padding: spacing.md, marginBottom: spacing.base }}
    >
      <Txt variant="small" color={fg}>{text}</Txt>
    </View>
  )
}

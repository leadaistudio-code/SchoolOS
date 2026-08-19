import { Redirect } from 'expo-router'
import { useAuth } from '@/auth/store'

/**
 * The fork taken on launch, once `restore()` has settled.
 *
 * Doing this as a redirect rather than conditional rendering keeps one source
 * of truth for "where am I" — the URL — which is also what a notification tap
 * or a deep link arrives as.
 */
export default function Boot() {
  const status = useAuth((s) => s.status)
  const session = useAuth((s) => s.session)

  if (status !== 'signedIn') return <Redirect href="/(auth)/login" />

  // A temporary password is not a session you can browse with. The web
  // redirects to /account/password for the same reason.
  if (session?.mustChangePassword) return <Redirect href="/(auth)/change-password" />

  return <Redirect href="/(app)" />
}

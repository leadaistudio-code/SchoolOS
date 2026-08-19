import { create } from 'zustand'
import { api, ApiError, setUnauthenticatedHandler } from '@/api/client'
import {
  clearStoredSession,
  getStoredSession,
  setLastSchoolSlug,
  setStoredSession,
  type StoredSession,
} from './storage'

/**
 * Who is signed in, which school they are in, and what they may do.
 *
 * Permissions are the same strings the web application checks — they arrive
 * from `/auth/me` and are used only to decide what to *show*. Every one of
 * them is enforced again on the server; hiding a tab is a courtesy to the
 * user, never a security control.
 */

export type School = {
  slug: string
  name: string
  suspended: boolean
  logoUrl: string | null
  primaryHex: string | null
  loginHeadline: string | null
  loginSubtext: string | null
}

type AuthState = {
  status: 'starting' | 'signedOut' | 'signedIn'
  session: StoredSession | null
  /** Set when a session ends mid-use, so sign-in can explain why. */
  expiredMessage: string | null

  restore: () => Promise<void>
  lookupSchool: (slug: string) => Promise<School>
  signIn: (slug: string, identifier: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  can: (permission: string) => boolean
  canAny: (...permissions: string[]) => boolean
}

// zustand v5 wants the curried form; without it the selector parameter in
// every `useAuth((s) => ...)` call site infers as `any`.
export const useAuth = create<AuthState>()((set, get) => ({
  status: 'starting',
  session: null,
  expiredMessage: null,

  /** Called once on launch. Decides splash → sign-in or splash → home. */
  restore: async () => {
    const stored = await getStoredSession()
    if (!stored) {
      set({ status: 'signedOut', session: null })
      return
    }

    // A stored token is not proof of a live session: it may have expired, been
    // revoked from another device, or had its roles changed. Ask the server,
    // and take its answer for the permission set rather than the stale copy.
    try {
      const { data } = await api.get<{
        user: { id: string; firstName: string; lastName: string; email: string | null; roles: string[]; permissions: string[] }
        tenant: { slug: string; name: string }
      }>('/auth/me')

      const refreshed: StoredSession = {
        ...stored,
        userId: data.user.id,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        email: data.user.email,
        roles: data.user.roles,
        permissions: data.user.permissions,
        tenantSlug: data.tenant.slug,
        tenantName: data.tenant.name,
      }
      await setStoredSession(refreshed)
      set({ status: 'signedIn', session: refreshed })
    } catch (error) {
      if (error instanceof ApiError && error.isAuth) {
        await clearStoredSession()
        set({ status: 'signedOut', session: null, expiredMessage: 'Your session has ended. Please sign in again.' })
        return
      }
      // Offline at launch. The stored session is still probably valid, so the
      // app opens rather than pushing someone to a sign-in screen they cannot
      // complete without a connection. Screens show their own offline state.
      set({ status: 'signedIn', session: stored })
    }
  },

  lookupSchool: async (slug: string) => {
    const { data } = await api.get<School>(`/site/school/${encodeURIComponent(slug.trim().toLowerCase())}`)
    return data
  },

  signIn: async (slug: string, identifier: string, password: string) => {
    const normalisedSlug = slug.trim().toLowerCase()

    // The tenant header is sent explicitly here because there is no session to
    // read it from yet — this is the one request that has to name the school
    // itself rather than inherit it.
    const { data } = await api.post<{
      user: {
        id: string
        firstName: string
        lastName: string
        email: string | null
        roles: string[]
        permissions: string[]
        mustChangePassword: boolean
      } | null
      tenant: { slug: string; name: string } | null
      sessionToken?: string
    }>(
      '/auth/login',
      { identifier: identifier.trim(), password },
      { anonymous: true, headers: { 'x-tenant-slug': normalisedSlug, 'x-session-transport': 'bearer' } },
    )

    if (!data?.sessionToken || !data.user) {
      throw new ApiError(500, 'NO_TOKEN', 'Sign-in succeeded but the server did not return a session. Please try again.')
    }

    const session: StoredSession = {
      token: data.sessionToken,
      tenantSlug: data.tenant?.slug ?? normalisedSlug,
      tenantName: data.tenant?.name ?? '',
      userId: data.user.id,
      firstName: data.user.firstName,
      lastName: data.user.lastName,
      email: data.user.email,
      roles: data.user.roles,
      permissions: data.user.permissions,
      mustChangePassword: data.user.mustChangePassword,
    }

    await setStoredSession(session)
    await setLastSchoolSlug(session.tenantSlug)
    set({ status: 'signedIn', session, expiredMessage: null })
  },

  signOut: async () => {
    // Told to the server so the row is revoked, not merely forgotten locally —
    // otherwise the token stays valid until it expires and the device keeps
    // showing in "signed-in devices".
    await api.post('/auth/logout').catch(() => {})
    await clearStoredSession()
    set({ status: 'signedOut', session: null, expiredMessage: null })
  },

  can: (permission: string) => get().session?.permissions.includes(permission) ?? false,
  canAny: (...permissions: string[]) => {
    const held = get().session?.permissions
    return held ? permissions.some((p) => held.includes(p)) : false
  },
}))

/**
 * A 401 from anywhere ends the session exactly once, wherever it happened —
 * a background refetch on a list screen included. Without this a stale token
 * leaves the user tapping around screens that all quietly fail.
 */
setUnauthenticatedHandler(() => {
  const { status } = useAuth.getState()
  if (status === 'signedOut') return
  useAuth.setState({
    status: 'signedOut',
    session: null,
    expiredMessage: 'Your session has ended. Please sign in again.',
  })
})

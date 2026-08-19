import * as SecureStore from 'expo-secure-store'

/**
 * Where the session credential lives.
 *
 * The token is a bearer credential: whoever holds it is the user until it
 * expires or is revoked. On Android SecureStore is backed by the system
 * keystore, so it survives a backup extraction and a rooted-device file dump
 * in a way AsyncStorage — a plain unencrypted SQLite file — does not.
 *
 * The password is never stored, in any form. It is sent once, exchanged for a
 * token, and forgotten.
 */

const TOKEN_KEY = 'mcv.session.token'
const CONTEXT_KEY = 'mcv.session.context'

export type StoredSession = {
  token: string
  tenantSlug: string
  tenantName: string
  userId: string
  firstName: string
  lastName: string
  email: string | null
  roles: string[]
  permissions: string[]
  mustChangePassword: boolean
  /**
   * The school's own brand colour, from `/site/school/:slug`.
   *
   * The platform already puts a school's colours on its documents and its
   * website; this is the same promise kept on the phone, so two schools do not
   * look at identical apps. Null falls back to the product violet.
   */
  primaryHex: string | null
}

/**
 * Read once, then held in memory.
 *
 * Every API call needs the token, and a keystore round trip per request is
 * both slow and pointless — the process already holds the value the moment it
 * makes its first call. Cleared on sign-out and on any 401.
 */
let cached: StoredSession | null = null
let loaded = false

export async function getStoredSession(): Promise<StoredSession | null> {
  if (loaded) return cached

  try {
    const [token, context] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(CONTEXT_KEY),
    ])
    if (!token || !context) {
      cached = null
    } else {
      // The token and its context are stored apart so a corrupt context cannot
      // strand a usable token, and vice versa — either way the answer is "no
      // session", which sends the user to sign in rather than to a broken screen.
      cached = { ...(JSON.parse(context) as Omit<StoredSession, 'token'>), token }
    }
  } catch {
    cached = null
  }

  loaded = true
  return cached
}

export async function setStoredSession(session: StoredSession): Promise<void> {
  const { token, ...context } = session
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
    SecureStore.setItemAsync(CONTEXT_KEY, JSON.stringify(context)),
  ])
  cached = session
  loaded = true
}

export async function clearStoredSession(): Promise<void> {
  cached = null
  loaded = true
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(CONTEXT_KEY).catch(() => {}),
  ])
}

/** The last school signed into, so the sign-in screen can offer it again. */
const LAST_SLUG_KEY = 'mcv.lastSchoolSlug'

export async function getLastSchoolSlug(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_SLUG_KEY).catch(() => null)
}

export async function setLastSchoolSlug(slug: string): Promise<void> {
  await SecureStore.setItemAsync(LAST_SLUG_KEY, slug).catch(() => {})
}

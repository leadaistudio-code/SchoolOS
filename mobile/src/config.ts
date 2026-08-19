import Constants from 'expo-constants'

/**
 * Everything environment-specific, in one file.
 *
 * `EXPO_PUBLIC_*` variables are inlined into the JavaScript bundle at build
 * time, which means anyone with the APK can read them. Only values that are
 * public by nature belong here — an API origin is fine, a signing key or a
 * provider secret never is. Privileged work stays on the server, which is why
 * the app holds no keys at all.
 */

/**
 * Written out in full, deliberately.
 *
 * Expo's bundler substitutes `process.env.EXPO_PUBLIC_NAME` by matching that
 * exact member expression in the source. A dynamic read — `process.env[key]`,
 * or destructuring it — is not rewritten, so it evaluates to undefined on the
 * device and the fallback silently wins. That failure is invisible in
 * development, where a real `process.env` exists, and only shows up as an app
 * talking to the wrong server after it is installed. It cost one build here.
 */
const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL

/**
 * Where the API lives.
 *
 * Defaults to the production site. A development build overrides it with
 * EXPO_PUBLIC_API_URL — on an Android emulator `localhost` is the emulator
 * itself, so a local server is reached at 10.0.2.2, which is the single most
 * common way a first mobile build appears broken when it is not.
 */
export const API_BASE_URL =
  ENV_API_URL && ENV_API_URL.length > 0
    ? ENV_API_URL
    : 'https://www.mycampusview.com/api/v1'

/** Shown on the sign-in screen so a tester can see which server they are on. */
export const IS_PRODUCTION_API = API_BASE_URL.includes('www.mycampusview.com')

/**
 * A school's wifi at 8am is not a data centre link. Long enough for a slow
 * network, short enough that a dead one is reported rather than spun on.
 */
export const REQUEST_TIMEOUT_MS = 20_000

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0'
export const ANDROID_VERSION_CODE = Constants.expoConfig?.android?.versionCode ?? 1

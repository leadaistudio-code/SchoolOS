import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import Native, { type AndroidCapabilities, type AppBlockerState, type IosCapabilities } from '../../modules/tapasya-device-control'
import { APP_VERSION, IOS_APP_SHIELDING_ENABLED } from '@/config'
import type { CapabilityState, RestrictionLevel } from './device'

/**
 * TapasyaDeviceControl: the one place the app touches OS focus controls.
 *
 * Every level reported here is what the operating system confirmed after the
 * call, not what was requested. When nothing native is available (Expo Go, the
 * web, a build without the module) the answer is TIMER_ONLY, said plainly.
 */

export type DeviceStatus = {
  platform: 'android' | 'ios' | 'web'
  capabilityState: CapabilityState
  /** Strongest level this device can reach right now without further setup. */
  bestLevel: RestrictionLevel
  /** What the student (or school) can do to unlock a stronger level. */
  setup: SetupStep[]
  managed: boolean
  raw: Record<string, unknown>
}

export type SetupStep =
  | { kind: 'ANDROID_DND_ACCESS'; label: string }
  | { kind: 'ANDROID_USAGE_ACCESS'; label: string }
  | { kind: 'ANDROID_OVERLAY'; label: string }
  | { kind: 'ANDROID_PIN_SETTINGS'; label: string }
  | { kind: 'IOS_SCREEN_TIME'; label: string }
  | { kind: 'INFO'; label: string }

export type Engagement = {
  level: RestrictionLevel
  /** Restrictions this app applied and must undo. MDM-owned ones are never listed. */
  applied: ('DND' | 'LOCK_TASK' | 'BLOCKER' | 'PIN' | 'SHIELD' | 'SINGLE_APP')[]
  failures: string[]
}

const DEFAULT_SESSION_MS = 4 * 60 * 60_000

/** Longest a session can plausibly run, plus an hour for pauses and slow breaks. */
export function sessionCapMs(cycles: number, focusMinutes: number, breakMinutes: number): number {
  return (cycles * (focusMinutes + breakMinutes) + 60) * 60_000
}

const platform: DeviceStatus['platform'] = Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web'

export function nativeAvailable(): boolean {
  return Native != null
}

export async function getDeviceStatus(): Promise<DeviceStatus> {
  if (!Native || platform === 'web') {
    return {
      platform,
      capabilityState: 'NOT_SUPPORTED',
      bestLevel: 'TIMER_ONLY',
      setup: [{ kind: 'INFO', label: 'This build of the app can run the focus timer but cannot change phone settings.' }],
      managed: false,
      raw: {},
    }
  }

  if (platform === 'android') {
    const caps = (await Native.getCapabilities()) as AndroidCapabilities
    const setup: SetupStep[] = []
    const blockerSupported = caps.usageAccessGranted !== undefined
    const blockerReady = !!caps.usageAccessGranted && !!caps.overlayGranted
    if (!caps.lockTaskPermitted && blockerSupported) {
      if (!caps.usageAccessGranted) setup.push({ kind: 'ANDROID_USAGE_ACCESS', label: 'Block other apps during focus: turn on Usage access for MyCampusView' })
      if (!caps.overlayGranted) setup.push({ kind: 'ANDROID_OVERLAY', label: 'Block other apps during focus: allow MyCampusView to display over other apps' })
      setup.push({ kind: 'ANDROID_PIN_SETTINGS', label: 'Optional: turn on App pinning and "Ask for PIN before unpinning" so the phone stays on MyCampusView' })
    }
    if (!caps.dndAccessGranted) setup.push({ kind: 'ANDROID_DND_ACCESS', label: 'Allow MyCampusView to turn on Do Not Disturb during focus' })
    if (!caps.lockTaskPermitted) setup.push({ kind: 'INFO', label: 'A lock with no way out needs a school-managed device (Android Enterprise). On a personal phone the student can still revoke permissions in Settings; MyCampusView notices and reports it.' })
    const best: RestrictionLevel = caps.lockTaskPermitted ? 'MANAGED_KIOSK' : blockerReady ? 'APP_SHIELDING' : caps.dndAccessGranted ? 'PARTIAL' : 'TIMER_ONLY'
    return {
      platform,
      capabilityState: caps.lockTaskPermitted ? 'READY_FOR_MANAGED_KIOSK' : blockerReady || caps.dndAccessGranted ? 'READY_FOR_FOCUS' : 'PERMISSION_REQUIRED',
      bestLevel: best,
      setup,
      managed: caps.lockTaskPermitted,
      raw: caps as unknown as Record<string, unknown>,
    }
  }

  const caps = (await Native.getCapabilities()) as IosCapabilities
  const setup: SetupStep[] = []
  const shieldReady = IOS_APP_SHIELDING_ENABLED && caps.screenTimeStatus === 'approved'
  if (IOS_APP_SHIELDING_ENABLED && caps.screenTimeStatus === 'notDetermined') setup.push({ kind: 'IOS_SCREEN_TIME', label: 'Allow Screen Time access so Tapasya can shield distracting apps' })
  if (!IOS_APP_SHIELDING_ENABLED) setup.push({ kind: 'INFO', label: 'App shielding is not enabled in this version of the app on iPhone. The focus timer works normally.' })
  setup.push({ kind: 'INFO', label: 'Locking an iPhone or iPad to MyCampusView needs a school-supervised device with Single App Mode set up by the school.' })
  return {
    platform,
    capabilityState: shieldReady ? 'READY_FOR_FOCUS' : caps.screenTimeStatus === 'denied' ? 'PERMISSION_REQUIRED' : IOS_APP_SHIELDING_ENABLED && caps.screenTimeStatus === 'notDetermined' ? 'AWAITING_USER_AUTHORIZATION' : 'NOT_SUPPORTED',
    bestLevel: shieldReady ? 'APP_SHIELDING' : 'TIMER_ONLY',
    setup,
    managed: false,
    raw: caps as unknown as Record<string, unknown>,
  }
}

export async function runSetupStep(step: SetupStep): Promise<void> {
  if (!Native) return
  if (step.kind === 'ANDROID_DND_ACCESS') Native.openDoNotDisturbSettings?.()
  if (step.kind === 'ANDROID_USAGE_ACCESS') Native.openUsageAccessSettings?.()
  if (step.kind === 'ANDROID_OVERLAY') Native.openOverlaySettings?.()
  if (step.kind === 'ANDROID_PIN_SETTINGS') Native.openPinningSettings?.()
  if (step.kind === 'IOS_SCREEN_TIME') await Native.requestScreenTimeAuthorization?.()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Android shows its own pin confirmation; wait briefly for the user's answer. */
async function pinScreen(): Promise<boolean> {
  if (!Native?.requestScreenPin) return false
  let state = await Native.requestScreenPin()
  for (let i = 0; i < 8 && state === 'NONE'; i++) {
    await sleep(500)
    state = Native.getLockTaskState?.() ?? 'NONE'
  }
  return state === 'PINNED' || state === 'LOCKED'
}

/**
 * Applies the strongest restriction the device supports and reports what the
 * OS confirmed. Never throws: a failure lowers the level and is listed.
 * `untilMs` caps how long the app blocker can run if the app is killed.
 */
export async function engage(opts: { untilMs?: number } = {}): Promise<Engagement> {
  const out: Engagement = { level: 'TIMER_ONLY', applied: [], failures: [] }
  if (!Native || platform === 'web') return out

  try {
    if (platform === 'android') {
      const caps = (await Native.getCapabilities()) as AndroidCapabilities
      if (caps.lockTaskPermitted) {
        const state = await Native.startManagedLockTask?.()
        if (state === 'LOCKED') {
          out.applied.push('LOCK_TASK')
          out.level = 'MANAGED_KIOSK'
        } else {
          out.failures.push(`Managed lock task did not start (${state ?? 'unavailable'}).`)
        }
      } else {
        if (caps.usageAccessGranted && caps.overlayGranted) {
          if (Native.startAppBlocker?.(opts.untilMs ?? Date.now() + DEFAULT_SESSION_MS, [])) {
            out.applied.push('BLOCKER')
            out.level = 'APP_SHIELDING'
          } else {
            out.failures.push('The app blocker could not start.')
          }
        }
        if (await pinScreen()) {
          out.applied.push('PIN')
          out.level = 'APP_SHIELDING'
        } else if (!out.applied.includes('BLOCKER')) {
          out.failures.push('Other apps are not blocked: screen pinning was not turned on, and the app blocker needs Usage access and "Display over other apps" (Phone controls).')
        }
      }
      if (caps.dndAccessGranted) {
        if (Native.setDoNotDisturb?.(true)) {
          out.applied.push('DND')
          if (out.level === 'TIMER_ONLY') out.level = 'PARTIAL'
        } else {
          out.failures.push('Do Not Disturb could not be turned on.')
        }
      }
      return out
    }

    const single = await Native.requestSingleAppMode?.(true)
    if (single) {
      out.applied.push('SINGLE_APP')
      out.level = 'MANAGED_KIOSK'
      return out
    }
    const caps = (await Native.getCapabilities()) as IosCapabilities
    if (IOS_APP_SHIELDING_ENABLED && caps.screenTimeStatus === 'approved') {
      if (await Native.setShield?.(true)) {
        out.applied.push('SHIELD')
        out.level = 'APP_SHIELDING'
      } else {
        out.failures.push('Screen Time shield could not be applied.')
      }
    }
  } catch (err) {
    out.failures.push(err instanceof Error ? err.message : 'Device controls failed.')
  }
  return out
}

/**
 * Undoes what `engage` applied. With `keepManaged`, a managed kiosk stays: a
 * guardian's approval lifts the app's own restrictions, never the school's.
 */
export async function release(e: Engagement, opts: { keepManaged?: boolean } = {}): Promise<Engagement> {
  if (!Native) return { level: 'TIMER_ONLY', applied: [], failures: [] }
  const keep: Engagement['applied'] = []
  for (const r of e.applied) {
    try {
      if (opts.keepManaged && (r === 'LOCK_TASK' || r === 'SINGLE_APP')) {
        keep.push(r)
        continue
      }
      if (r === 'DND') Native.setDoNotDisturb?.(false)
      if (r === 'LOCK_TASK' || r === 'PIN') await Native.stopLockTask?.()
      if (r === 'BLOCKER') Native.stopAppBlocker?.()
      if (r === 'SHIELD') await Native.setShield?.(false)
      if (r === 'SINGLE_APP') await Native.requestSingleAppMode?.(false)
    } catch {
      keep.push(r)
    }
  }
  return { level: keep.length ? 'MANAGED_KIOSK' : 'TIMER_ONLY', applied: keep, failures: [] }
}

/**
 * Lifts the app blocker and screen pin when the record of what was applied
 * is gone (the app was restarted mid-session). Managed kiosk is left alone.
 */
export async function releaseOrphaned(): Promise<void> {
  if (!Native || platform !== 'android') return
  try {
    Native.stopAppBlocker?.()
    if (Native.getLockTaskState?.() === 'PINNED') await Native.stopLockTask?.()
  } catch {
    // Nothing was running.
  }
}

export function appBlockerState(): AppBlockerState | null {
  if (!Native?.getAppBlockerState || platform !== 'android') return null
  try {
    return Native.getAppBlockerState()
  } catch {
    return null
  }
}

/** True while Android still reports this app pinned or locked. */
export function screenPinned(): boolean {
  const state = Native?.getLockTaskState?.()
  return state === 'PINNED' || state === 'LOCKED'
}

const INSTALLATION_KEY = 'mcv.tapasya.installation'

/** A random per-install id so the server can tell this phone's reports apart. Not an identifier of the person. */
export async function installationId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALLATION_KEY).catch(() => null)
  if (existing) return existing
  const id = `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  await SecureStore.setItemAsync(INSTALLATION_KEY, id).catch(() => undefined)
  return id
}

export async function deviceReport(status: DeviceStatus) {
  return {
    installationId: await installationId(),
    platform: status.platform,
    osVersion: String(Platform.Version ?? ''),
    appVersion: APP_VERSION,
    capabilityState: status.capabilityState,
    capabilities: { ...status.raw, nativeModule: nativeAvailable() },
    managed: status.managed,
  }
}

import { requireOptionalNativeModule } from 'expo'

export type AndroidCapabilities = {
  platform: 'android'
  sdkInt: number
  dndAccessGranted: boolean
  interruptionFilter: number
  lockTaskPermitted: boolean
  lockTaskModeState: LockTaskState
  /** Absent in builds before the app blocker was added. */
  usageAccessGranted?: boolean
  overlayGranted?: boolean
}

export type AppBlockerState = {
  running: boolean
  blockedCount: number
  lastBlocked: string | null
  /** A permission was revoked mid-session, so apps are no longer being blocked. */
  lostAccess: boolean
}

export type IosCapabilities = {
  platform: 'ios'
  osVersion: string
  guidedAccessActive: boolean
  screenTimeStatus: 'approved' | 'denied' | 'notDetermined' | 'unknown' | 'unavailable'
}

export type LockTaskState = 'LOCKED' | 'PINNED' | 'NONE'

type NativeTapasyaDeviceControl = {
  getCapabilities(): AndroidCapabilities | Promise<IosCapabilities>
  // Android
  openDoNotDisturbSettings?(): void
  setDoNotDisturb?(enabled: boolean): boolean
  startManagedLockTask?(): Promise<LockTaskState | 'NOT_PERMITTED'>
  stopLockTask?(): Promise<LockTaskState>
  getLockTaskState?(): LockTaskState
  openUsageAccessSettings?(): void
  openOverlaySettings?(): void
  openPinningSettings?(): void
  requestScreenPin?(): Promise<LockTaskState>
  startAppBlocker?(untilMs: number, allow: string[]): boolean
  stopAppBlocker?(): void
  getAppBlockerState?(): AppBlockerState
  // iOS
  requestScreenTimeAuthorization?(): Promise<IosCapabilities['screenTimeStatus'] | 'failed'>
  setShield?(enabled: boolean): Promise<boolean>
  requestSingleAppMode?(enabled: boolean): Promise<boolean>
}

/** Null in Expo Go, on the web, and in any build made before this module was added. */
export default requireOptionalNativeModule<NativeTapasyaDeviceControl>('TapasyaDeviceControl')

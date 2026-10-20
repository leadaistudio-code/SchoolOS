import { requireOptionalNativeModule } from 'expo'

export type AndroidCapabilities = {
  platform: 'android'
  sdkInt: number
  dndAccessGranted: boolean
  interruptionFilter: number
  lockTaskPermitted: boolean
  lockTaskModeState: LockTaskState
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
  // iOS
  requestScreenTimeAuthorization?(): Promise<IosCapabilities['screenTimeStatus'] | 'failed'>
  setShield?(enabled: boolean): Promise<boolean>
  requestSingleAppMode?(enabled: boolean): Promise<boolean>
}

/** Null in Expo Go, on the web, and in any build made before this module was added. */
export default requireOptionalNativeModule<NativeTapasyaDeviceControl>('TapasyaDeviceControl')

/**
 * Device-control vocabulary shared by the server and the phone.
 *
 * The phone reports what the operating system actually confirmed; these labels
 * are the only words the product uses for it. Nothing ever says "Full
 * Lockdown": the strongest label, Managed Kiosk Active, is only shown when the
 * OS confirmed managed Lock Task Mode (Android) or a single-app MDM policy (iOS).
 */

export const CAPABILITY_STATES = [
  'NOT_SUPPORTED',
  'PERMISSION_REQUIRED',
  'AWAITING_USER_AUTHORIZATION',
  'AWAITING_PARENT_AUTHORIZATION',
  'AWAITING_DEVICE_ENROLLMENT',
  'READY_FOR_FOCUS',
  'READY_FOR_MANAGED_KIOSK',
  'ACTIVE',
  'PARTIALLY_ACTIVE',
  'FAILED',
  'DISABLED',
] as const

export type CapabilityState = (typeof CAPABILITY_STATES)[number]

export type RestrictionLevel = 'TIMER_ONLY' | 'PARTIAL' | 'APP_SHIELDING' | 'MANAGED_KIOSK'

export const RESTRICTION_LABEL: Record<RestrictionLevel, string> = {
  TIMER_ONLY: 'Focus Timer Active',
  PARTIAL: 'Partial Restrictions Active',
  APP_SHIELDING: 'App Shielding Active',
  MANAGED_KIOSK: 'Managed Kiosk Active',
}

export const RESTRICTION_EXPLANATION: Record<RestrictionLevel, string> = {
  TIMER_ONLY: 'Only the timer is running. Other apps are not blocked on this device.',
  PARTIAL: 'Some distractions are reduced (for example Do Not Disturb), but other apps can still be opened.',
  APP_SHIELDING: 'Other apps are blocked during focus (Android app blocker or screen pinning, or iPhone Screen Time). MyCampusView, calls and essential functions stay available.',
  MANAGED_KIOSK: 'This school-managed device is locked to MyCampusView. Emergency calls remain available.',
}

export const CAPABILITY_LABEL: Record<CapabilityState, string> = {
  NOT_SUPPORTED: 'Not supported on this device',
  PERMISSION_REQUIRED: 'Permissions Required',
  AWAITING_USER_AUTHORIZATION: 'Waiting for your authorization',
  AWAITING_PARENT_AUTHORIZATION: 'Waiting for a parent’s authorization',
  AWAITING_DEVICE_ENROLLMENT: 'Waiting for device enrollment',
  READY_FOR_FOCUS: 'Ready for focus',
  READY_FOR_MANAGED_KIOSK: 'Ready for managed kiosk',
  ACTIVE: 'Active',
  PARTIALLY_ACTIVE: 'Partially active',
  FAILED: 'Restriction Failed',
  DISABLED: 'Disabled',
}

export function isRestrictionLevel(v: unknown): v is RestrictionLevel {
  return v === 'TIMER_ONLY' || v === 'PARTIAL' || v === 'APP_SHIELDING' || v === 'MANAGED_KIOSK'
}

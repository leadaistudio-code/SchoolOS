/** Minutes from midnight helpers for school / staff attendance windows. */

export function clampMinutes(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(24 * 60 - 1, Math.max(0, Math.round(value)))
}

export function timeToMinutes(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function minutesToTime(value: number): string {
  const mins = clampMinutes(value)
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function formatMinutesLabel(value: number): string {
  const [h, m] = minutesToTime(value).split(':').map(Number) as [number, number]
  const hour12 = ((h + 11) % 12) + 1
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`
}

export type AttendanceWindow = {
  openMinutes: number
  closeMinutes: number
  lateAfterMinutes: number
  graceMinutes: number
  custom: boolean
}

export function isWithinAttendanceWindow(minutes: number, window: AttendanceWindow) {
  const start = window.openMinutes - window.graceMinutes
  const end = window.closeMinutes + window.graceMinutes
  if (end >= start) return minutes >= start && minutes <= end
  // Overnight window (rare for schools) — treat as always open overnight.
  return minutes >= start || minutes <= end
}

export function expectedWorkMinutes(window: AttendanceWindow) {
  const span = window.closeMinutes - window.openMinutes
  return span > 0 ? span : 24 * 60 + span
}

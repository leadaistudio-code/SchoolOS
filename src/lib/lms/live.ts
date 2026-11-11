/** Students can join this long before the start time. */
export const JOIN_EARLY_MINUTES = 15
/** …and until this long after the scheduled end. */
export const JOIN_LATE_MINUTES = 30

export type LiveState = 'cancelled' | 'upcoming' | 'open' | 'ended'

export function liveState(
  c: { startsAt: Date; durationMinutes: number; cancelledAt: Date | null },
  now: Date = new Date(),
): LiveState {
  if (c.cancelledAt) return 'cancelled'
  const start = c.startsAt.getTime()
  const end = start + c.durationMinutes * 60_000
  if (now.getTime() < start - JOIN_EARLY_MINUTES * 60_000) return 'upcoming'
  if (now.getTime() <= end + JOIN_LATE_MINUTES * 60_000) return 'open'
  return 'ended'
}

/** Which service a meeting link belongs to, for the button label. */
export function meetingPlatform(url: string | null | undefined): string {
  if (!url) return 'Online class'
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host === 'zoom.us' || host.endsWith('.zoom.us')) return 'Zoom'
    if (host === 'meet.google.com') return 'Google Meet'
    if (host === 'teams.microsoft.com' || host === 'teams.live.com') return 'Microsoft Teams'
    if (host.endsWith('webex.com')) return 'Webex'
    return 'Online class'
  } catch {
    return 'Online class'
  }
}

/** Meeting and recording links must be plain https URLs. */
export function isHttpsUrl(raw: string | null | undefined): boolean {
  if (!raw) return false
  try {
    return new URL(raw.trim()).protocol === 'https:'
  } catch {
    return false
  }
}

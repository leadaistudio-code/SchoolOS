import { istClock, minutesOf } from '@/lib/ist-clock'

/** MediaMTX release the generated config was checked against. */
export const RELAY_VERSION = 'v1.21.1'
export const RELAY_DOWNLOAD_URL = `https://github.com/bluenviron/mediamtx/releases/download/${RELAY_VERSION}/mediamtx_${RELAY_VERSION}_windows_amd64.zip`
export const RELAY_PORT = 8888

/** The Windows relay app, served from /public. */
export const RELAY_APP_VERSION = '1.0.0'
export const RELAY_APP_DOWNLOAD_PATH = '/downloads/MyCampusView-CCTV-Relay.exe'
/** The relay app swaps this for the recorder password, which never leaves the school PC. */
export const RELAY_PASSWORD_PLACEHOLDER = '__MCV_DVR_PASSWORD__'
/** How long after its last check-in the relay app still counts as online. */
export const RELAY_ONLINE_MS = 3 * 60_000

const RELAY_KEY_PREFIX = 'mcvr'

/** Connection key: mcvr_<tenantId>_<secret>. The tenant id routes it; only the secret is checked. */
export function formatRelayKey(tenantId: string, secret: string) {
  return `${RELAY_KEY_PREFIX}_${tenantId}_${secret}`
}

export function parseRelayKey(raw: string): { tenantId: string; secret: string } | null {
  const m = /^mcvr_([A-Za-z0-9-]{3,64})_([A-Za-z0-9_-]{32,64})$/.exec(raw.trim())
  return m ? { tenantId: m[1]!, secret: m[2]! } : null
}

export const ZONE_LABEL = { GENERAL: 'General', GATE: 'Gate / entrance', CLASSROOM: 'Classroom' } as const
export type Zone = keyof typeof ZONE_LABEL

export const WEEKDAYS = [
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
  { value: 7, short: 'Sun' },
] as const

/**
 * The relay's public address. Must be https because the app is, and browsers
 * block plain-http video on an https page. localhost is allowed for testing
 * on the school PC itself.
 */
export function normaliseStreamBase(raw: string): string | null {
  const value = raw.trim().replace(/\/+$/, '')
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null
  if (url.search || url.hash || url.username || url.password) return null
  return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')}`
}

export type NvrLogin = { host: string; port: number; username: string; password: string }

/** CP PLUS / Dahua RTSP address. subtype 1 is the lighter sub stream, 0 the main stream. */
export function rtspUrl(nvr: NvrLogin, channel: number, hd = false): string {
  // encodeURIComponent leaves ' alone, and the URL is single-quoted in YAML.
  const enc = (s: string) => encodeURIComponent(s).replace(/'/g, '%27')
  const auth = nvr.username ? `${enc(nvr.username)}:${enc(nvr.password)}@` : ''
  return `rtsp://${auth}${nvr.host}:${nvr.port}/cam/realmonitor?channel=${channel}&subtype=${hd ? 0 : 1}`
}

const yamlStr = (s: string) => `'${s.replace(/'/g, "''")}'`

export type RelayCamera = { path: string; hdPath: string; name: string; channel: number }

export function buildRelayConfig(input: {
  schoolName: string
  jwksUrl: string
  audience: string
  issuer: string
  claimKey: string
  nvr: NvrLogin
  cameras: RelayCamera[]
  includeHd: boolean
  generatedAt?: Date
}): string {
  const when = (input.generatedAt ?? new Date()).toISOString().slice(0, 16).replace('T', ' ')
  const lines: string[] = [
    `# MyCampusView CCTV relay for ${input.schoolName.replace(/[\r\n]/g, ' ')}`,
    `# Generated ${when} UTC for MediaMTX ${RELAY_VERSION}.`,
    '# This file contains your recorder password. Keep it on the school PC only.',
    '',
    'logLevel: info',
    '',
    '# Viewers must carry a short-lived token signed by MyCampusView.',
    'authMethod: jwt',
    `authJWTJWKS: ${yamlStr(input.jwksUrl)}`,
    `authJWTClaimKey: ${input.claimKey}`,
    `authJWTIssuer: ${yamlStr(input.issuer)}`,
    `authJWTAudience: ${yamlStr(input.audience)}`,
    '',
    '# Only HLS is served, and only to this PC. The Cloudflare tunnel publishes it.',
    'api: false',
    'metrics: false',
    'pprof: false',
    'playback: false',
    'rtsp: false',
    'rtmp: false',
    'webrtc: false',
    'srt: false',
    'moq: false',
    'hls: true',
    `hlsAddress: 127.0.0.1:${RELAY_PORT}`,
    "hlsAllowOrigins: ['*']",
    'hlsVariant: lowLatency',
    'hlsSegmentCount: 7',
    'hlsSegmentDuration: 1s',
    'hlsPartDuration: 200ms',
    'hlsAlwaysRemux: false',
    '',
    '# A camera is pulled from the recorder only while someone is watching it.',
    'pathDefaults:',
    '  sourceOnDemand: true',
    '  sourceOnDemandStartTimeout: 15s',
    '  sourceOnDemandCloseAfter: 20s',
    '  rtspTransport: tcp',
    '',
    'paths:',
  ]
  for (const cam of input.cameras) {
    lines.push(`  # ${cam.name.replace(/[\r\n]/g, ' ')} (channel ${cam.channel})`)
    lines.push(`  ${cam.path}:`)
    lines.push(`    source: ${yamlStr(rtspUrl(input.nvr, cam.channel))}`)
    if (input.includeHd) {
      lines.push(`  ${cam.hdPath}:`)
      lines.push(`    source: ${yamlStr(rtspUrl(input.nvr, cam.channel, true))}`)
    }
  }
  return lines.join('\n') + '\n'
}

export type ParentWindow =
  | { open: true; closesAt: Date; label: string }
  | { open: false; label: string }

export function parentWindowLabel(start: string, end: string, days: number[]) {
  const names = WEEKDAYS.filter((d) => days.includes(d.value)).map((d) => d.short)
  return `${names.join(', ') || 'No days'}, ${start}–${end}`
}

/** Whether parents may watch right now, and when their view must stop. */
export function parentWindow(
  site: { parentAccessEnabled: boolean; parentStart: string; parentEnd: string; parentDays: number[] },
  now: Date = new Date(),
): ParentWindow {
  const label = parentWindowLabel(site.parentStart, site.parentEnd, site.parentDays)
  if (!site.parentAccessEnabled) return { open: false, label }
  const start = minutesOf(site.parentStart)
  const end = minutesOf(site.parentEnd)
  if (start === null || end === null || end <= start) return { open: false, label }
  const clock = istClock(now)
  if (!site.parentDays.includes(clock.weekday)) return { open: false, label }
  if (clock.minutes < start || clock.minutes >= end) return { open: false, label }
  const startOfMinute = now.getTime() - (now.getTime() % 60_000)
  return { open: true, closesAt: new Date(startOfMinute + (end - clock.minutes) * 60_000), label }
}

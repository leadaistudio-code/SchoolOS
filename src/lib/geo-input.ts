/**
 * Turning what somebody pastes into a coordinate.
 *
 * Nobody types latitude and longitude. They open Maps on their phone, long-press
 * the school, hit share, and paste whatever comes out — and what comes out is
 * one of about six different shapes depending on which app and which platform.
 * Rejecting five of them and demanding decimal degrees is how a settings page
 * ends up never being filled in.
 *
 * Pure and dependency-free: no network, no key, no provider. The one format
 * that genuinely cannot be resolved locally is the shortened `maps.app.goo.gl`
 * link, which is a redirect and nothing more — that one is detected and named
 * so the server can follow it rather than the user being told "invalid".
 */

export type LatLng = { latitude: number; longitude: number }

export type ParseResult =
  | { ok: true; value: LatLng; source: string }
  /** A short link: resolvable, but only by following the redirect. */
  | { ok: false; reason: 'NEEDS_RESOLVING'; url: string }
  | { ok: false; reason: 'NO_MATCH' | 'OUT_OF_RANGE'; message: string }

/** Real coordinates, and a guard against a longitude pasted into latitude. */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    // 0,0 is in the Atlantic. It is never a school, and it is what an empty
    // form produces, so it is treated as "not set" rather than as a location.
    !(lat === 0 && lng === 0)
  )
}

const SHORT_LINK = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i

/**
 * The patterns, in the order they are tried.
 *
 * Order matters. `!3d…!4d…` carries the *pin* while `@…` carries the map
 * centre, and after a search those two differ — the pin is what the user
 * meant, so it is checked first.
 */
const PATTERNS: { name: string; re: RegExp }[] = [
  // Place pin inside a full Maps URL: !3d19.0760!4d72.8777
  { name: 'map pin', re: /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/ },
  // Map centre: /@19.0760,72.8777,17z
  { name: 'map centre', re: /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/ },
  // Query forms: ?q=19.0760,72.8777 · ?ll= · ?daddr= · &query=
  {
    name: 'map query',
    re: /[?&](?:q|ll|daddr|sll|query|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
  },
  // Apple Maps: ?coordinate=19.0760,72.8777
  { name: 'coordinate', re: /[?&]coordinate=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i },
  // Bare pair, which is what "copy coordinates" gives you: 19.0760, 72.8777
  { name: 'coordinate pair', re: /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/ },
]

/**
 * Degrees-minutes-seconds, as shown in the Maps UI itself.
 *
 * 19°04'33.6"N 72°52'39.7"E — the format a user reads off the screen and types
 * in by hand when the paste did not work.
 */
const DMS =
  /(\d{1,3})[°\s]+(\d{1,2})['′\s]+([\d.]+)["″\s]*([NS])[,\s]+(\d{1,3})[°\s]+(\d{1,2})['′\s]+([\d.]+)["″\s]*([EW])/i

function fromDms(input: string): LatLng | null {
  const m = DMS.exec(input)
  if (!m) return null

  const toDecimal = (d: string, min: string, sec: string, hemisphere: string) => {
    const value = Number(d) + Number(min) / 60 + Number(sec) / 3600
    const negative = hemisphere.toUpperCase() === 'S' || hemisphere.toUpperCase() === 'W'
    return negative ? -value : value
  }

  return {
    latitude: toDecimal(m[1]!, m[2]!, m[3]!, m[4]!),
    longitude: toDecimal(m[5]!, m[6]!, m[7]!, m[8]!),
  }
}

/**
 * Reads a location out of anything a user is likely to paste.
 *
 * Accepts a full Google Maps URL, an Apple Maps URL, a bare coordinate pair,
 * or degrees-minutes-seconds. Returns `NEEDS_RESOLVING` for a short link so the
 * caller can follow the redirect and try again on the destination.
 */
export function parseLocationInput(raw: string): ParseResult {
  const input = raw.trim()
  if (!input) return { ok: false, reason: 'NO_MATCH', message: 'Paste a link or coordinates' }

  if (SHORT_LINK.test(input)) {
    return { ok: false, reason: 'NEEDS_RESOLVING', url: input }
  }

  const dms = fromDms(input)
  if (dms) {
    return isValidLatLng(dms.latitude, dms.longitude)
      ? { ok: true, value: round(dms), source: 'degrees, minutes and seconds' }
      : { ok: false, reason: 'OUT_OF_RANGE', message: 'Those degrees are outside the possible range' }
  }

  for (const pattern of PATTERNS) {
    const match = pattern.re.exec(input)
    if (!match) continue

    const latitude = Number(match[1])
    const longitude = Number(match[2])
    if (!isValidLatLng(latitude, longitude)) {
      return {
        ok: false,
        reason: 'OUT_OF_RANGE',
        message: 'Those coordinates are outside the possible range',
      }
    }
    return { ok: true, value: round({ latitude, longitude }), source: pattern.name }
  }

  return {
    ok: false,
    reason: 'NO_MATCH',
    message: 'No coordinates found. Paste a Google Maps link, or type "19.0760, 72.8777".',
  }
}

/**
 * Six decimals is about 11 cm.
 *
 * Keeping more is storing noise from a phone whose accuracy is measured in
 * metres, and it makes the field look falsely precise when somebody reads it.
 */
function round({ latitude, longitude }: LatLng): LatLng {
  return {
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
  }
}

/** A link back to the pin, so a saved location can be checked in one click. */
export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

/**
 * Metres between two points, by the haversine formula.
 *
 * Duplicated deliberately rather than imported from `lib/geo`: this file is
 * pasted into the settings form, which must stay free of the transport module's
 * projection code.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

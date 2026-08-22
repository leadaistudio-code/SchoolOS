import { z } from 'zod'

/**
 * Normalising what a GPS server sends.
 *
 * There is no single format. Traccar's forward webhook wraps the fix in a
 * `position` object beside a `device`; its older builds post the fields flat;
 * an AIS-140 vendor's middleware sends whatever its author chose, usually with
 * `imei` and `lat`/`lon`. Every one of them means the same six numbers.
 *
 * Rather than write an adapter per vendor — which is a support burden that
 * grows with every school — this accepts the shapes and normalises them. A
 * school that buys different hardware next year changes nothing.
 *
 * Pure, so the awkward cases can be tested without a server: speed arriving in
 * knots, a heading of 360, a device id under four different key names.
 */

export type GpsFix = {
  deviceId: string
  latitude: number
  longitude: number
  speedKph: number | null
  headingDeg: number | null
  accuracyM: number | null
  recordedAt: Date | null
}

const num = z.coerce.number().finite()

/**
 * One fix, in any of the shapes seen in the wild.
 *
 * Loose on input and strict on output: unknown keys are ignored rather than
 * rejected, because a vendor adding a field to its payload should not take a
 * school's tracking offline.
 */
const rawFix = z
  .object({
    // Device identity, in rough order of specificity.
    deviceId: z.union([z.string(), z.number()]).optional(),
    uniqueId: z.union([z.string(), z.number()]).optional(),
    imei: z.union([z.string(), z.number()]).optional(),
    id: z.union([z.string(), z.number()]).optional(),
    device: z.object({ uniqueId: z.union([z.string(), z.number()]).optional(), id: z.union([z.string(), z.number()]).optional() }).optional(),

    // Position.
    latitude: num.optional(),
    lat: num.optional(),
    longitude: num.optional(),
    lon: num.optional(),
    lng: num.optional(),

    // Movement. Traccar reports speed in knots; most others in km/h.
    speed: num.optional(),
    speedKph: num.optional(),
    course: num.optional(),
    heading: num.optional(),
    headingDeg: num.optional(),
    bearing: num.optional(),

    accuracy: num.optional(),
    accuracyM: num.optional(),

    // Time. Traccar sends `fixTime`/`deviceTime` as ISO strings.
    fixTime: z.string().optional(),
    deviceTime: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    recordedAt: z.string().optional(),

    // The Traccar forward wrapper.
    position: z.record(z.unknown()).optional(),
  })
  .passthrough()

function firstDefined<T>(...values: (T | undefined | null)[]): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

/**
 * Speed, in km/h.
 *
 * `speed` alone is ambiguous — Traccar means knots, most vendors mean km/h.
 * `speedKph` is unambiguous and wins when present. When only `speed` is given
 * it is treated as knots, which is the Traccar convention and the one that
 * causes a *slower* reading if wrong; the reverse assumption would put buses on
 * the map doing 90 km/h through a residential lane.
 */
function toKph(input: { speed?: number; speedKph?: number }): number | null {
  if (input.speedKph !== undefined) return clampSpeed(input.speedKph)
  if (input.speed !== undefined) return clampSpeed(input.speed * 1.852)
  return null
}

function clampSpeed(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null
  // Beyond this it is a bad fix, not a bus.
  return Math.min(200, Math.round(value * 10) / 10)
}

function toHeading(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null
  // 360 and 0 are the same bearing, and the column is validated as 0–360.
  const wrapped = ((value % 360) + 360) % 360
  return Math.round(wrapped * 10) / 10
}

function toDate(value: string | number | null): Date | null {
  if (value === null) return null
  const date = typeof value === 'number' ? new Date(value * (value > 1e12 ? 1 : 1000)) : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  // A device with a dead battery-backed clock reports 1970 or 2038. Either
  // would put the trail somewhere impossible on the timeline, so the fix is
  // kept and stamped on arrival instead.
  const year = date.getUTCFullYear()
  if (year < 2020 || year > 2100) return null
  return date
}

export function normaliseFix(input: unknown): GpsFix | null {
  const parsed = rawFix.safeParse(input)
  if (!parsed.success) return null

  // Traccar's forward payload nests the fix and keeps the device beside it.
  const outer = parsed.data
  const inner = outer.position ? rawFix.safeParse(outer.position) : null
  const fix = inner?.success ? { ...inner.data } : outer

  const deviceRaw = firstDefined(
    outer.device?.uniqueId,
    outer.uniqueId,
    outer.imei,
    outer.deviceId,
    fix.deviceId,
    fix.uniqueId,
    fix.imei,
    outer.device?.id,
    // `id` last: on a Traccar position it is the position's own id, not the
    // device's, so it is only trustworthy when nothing better is present.
    outer.position ? undefined : outer.id,
  )
  if (deviceRaw === null) return null

  const latitude = firstDefined(fix.latitude, fix.lat)
  const longitude = firstDefined(fix.longitude, fix.lon, fix.lng)
  if (latitude === null || longitude === null) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  // A device with no fix reports 0,0. Storing it would drive the bus into the
  // Atlantic and drag every map's bounds with it.
  if (latitude === 0 && longitude === 0) return null

  const accuracy = firstDefined(fix.accuracyM, fix.accuracy)

  return {
    deviceId: String(deviceRaw).trim(),
    latitude,
    longitude,
    speedKph: toKph(fix),
    headingDeg: toHeading(firstDefined(fix.headingDeg, fix.heading, fix.course, fix.bearing)),
    accuracyM: accuracy === null || accuracy < 0 ? null : Math.min(10_000, accuracy),
    recordedAt: toDate(
      firstDefined<string | number>(fix.fixTime, fix.deviceTime, fix.recordedAt, fix.timestamp),
    ),
  }
}

/**
 * A whole request body: one fix, a list of them, or a batch under a key.
 *
 * Vendors batch differently after a dead spot — some post an array, some wrap
 * it. Accepting all three means a bus coming back into signal replays its
 * gap rather than losing it.
 */
export function normalisePayload(body: unknown): GpsFix[] {
  if (Array.isArray(body)) {
    return body.map(normaliseFix).filter((f): f is GpsFix => f !== null)
  }

  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    for (const key of ['positions', 'locations', 'data', 'items']) {
      if (Array.isArray(record[key])) {
        return (record[key] as unknown[]).map(normaliseFix).filter((f): f is GpsFix => f !== null)
      }
    }
  }

  const single = normaliseFix(body)
  return single ? [single] : []
}

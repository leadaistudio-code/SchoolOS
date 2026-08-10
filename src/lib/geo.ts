export type LatLng = { latitude: number; longitude: number }

const EARTH_RADIUS_M = 6_371_000

/**
 * Great-circle distance in metres.
 *
 * Always computed on the server from the school coordinates stored in the
 * database. The client reports where it thinks it is; it never reports whether
 * that is close enough.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))))
}

export type GeofenceVerdict = {
  inside: boolean
  distanceM: number
  reason?: string
}

/**
 * Decides whether a reported position may mark attendance.
 *
 * A poor GPS fix is treated generously: the device could genuinely be inside
 * the fence while reporting a centre point outside it, so the accuracy radius
 * is subtracted before comparing. A wildly inaccurate fix is rejected outright
 * rather than being allowed to pass on that generosity.
 */
export function evaluateGeofence(params: {
  school: LatLng
  reported: LatLng
  radiusM: number
  accuracyM?: number | null
  maxAccuracyM?: number
}): GeofenceVerdict {
  const { school, reported, radiusM } = params
  const accuracy = params.accuracyM ?? 0
  const maxAccuracy = params.maxAccuracyM ?? 200

  const distanceM = distanceMeters(school, reported)

  if (accuracy > maxAccuracy) {
    return {
      inside: false,
      distanceM,
      reason: `Location accuracy is ${Math.round(accuracy)}m, which is too imprecise to verify. Move outdoors and try again.`,
    }
  }

  const effective = Math.max(0, distanceM - accuracy)
  if (effective > radiusM) {
    return {
      inside: false,
      distanceM,
      reason: `You are about ${formatDistance(distanceM)} from school. Attendance can only be marked inside the school area.`,
    }
  }

  return { inside: true, distanceM }
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`
}

// ---------------------------------------------------------------------------
// Map projection
//
// The live map draws its own SVG rather than loading a tile provider: a school
// bus screen must work on a locked-down network and must not leak pupil stop
// locations to a third party on every pane. At city scale an equirectangular
// projection is indistinguishable from a proper one, so the whole projection
// is these few lines.
// ---------------------------------------------------------------------------

export type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number }

export function boundsOf(points: LatLng[]): Bounds | null {
  if (points.length === 0) return null
  return points.reduce<Bounds>(
    (acc, p) => ({
      minLat: Math.min(acc.minLat, p.latitude),
      maxLat: Math.max(acc.maxLat, p.latitude),
      minLng: Math.min(acc.minLng, p.longitude),
      maxLng: Math.max(acc.maxLng, p.longitude),
    }),
    { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 },
  )
}

export type Projector = (point: LatLng) => { x: number; y: number }

/**
 * Fits a set of coordinates into a viewbox.
 *
 * Longitude degrees shrink towards the poles; ignoring that stretches a route
 * sideways and makes a straight road look like a diagonal. Scaling longitude
 * by cos(latitude) keeps the drawing shaped like the city it represents.
 *
 * A single point, or a cluster smaller than `minSpanDeg`, would otherwise
 * divide by ~zero and explode the scale, so the span has a floor — a bus
 * parked at one stop renders as a sensible neighbourhood view, not infinity.
 */
export function fitProjection(
  points: LatLng[],
  view: { width: number; height: number; padding?: number },
  minSpanDeg = 0.004,
): Projector {
  const pad = view.padding ?? 24
  const bounds = boundsOf(points) ?? { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 }

  const midLat = (bounds.minLat + bounds.maxLat) / 2
  const lngScale = Math.max(0.2, Math.cos((midLat * Math.PI) / 180))

  const spanLat = Math.max(bounds.maxLat - bounds.minLat, minSpanDeg)
  const spanLng = Math.max((bounds.maxLng - bounds.minLng) * lngScale, minSpanDeg)

  const innerW = Math.max(1, view.width - pad * 2)
  const innerH = Math.max(1, view.height - pad * 2)

  // One scale for both axes, so the route keeps its real proportions instead
  // of being squashed to fill the box.
  const scale = Math.min(innerW / spanLng, innerH / spanLat)

  const midLng = (bounds.minLng + bounds.maxLng) / 2

  return (point) => ({
    x: view.width / 2 + (point.longitude - midLng) * lngScale * scale,
    // SVG y grows downwards; latitude grows northwards.
    y: view.height / 2 - (point.latitude - midLat) * scale,
  })
}

/** Compass bearing in degrees, used to point the bus marker the way it drives. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const lat1 = toRad(from.latitude)
  const lat2 = toRad(to.latitude)
  const dLng = toRad(to.longitude - from.longitude)

  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)

  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

/** Total distance along an ordered chain of points, in metres. */
export function pathLengthMeters(points: LatLng[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1]!, points[i]!)
  return total
}

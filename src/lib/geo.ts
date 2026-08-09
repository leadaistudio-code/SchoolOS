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

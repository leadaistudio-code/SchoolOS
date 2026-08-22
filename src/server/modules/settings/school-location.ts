import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound } from '@/server/api/response'
import { isValidLatLng, parseLocationInput } from '@/lib/geo-input'

/**
 * The school's own position on the map.
 *
 * One coordinate pair, used in two unrelated places: the staff attendance
 * geofence decides whether somebody is on the premises, and the transport map
 * draws the school as the anchor every route runs to and from. Both were
 * shipped reading these columns and nothing has ever written them, which is why
 * the geofence screen has been telling administrators to visit a settings page
 * that did not exist.
 */

export const schoolLocationSchema = z
  .object({
    latitude: z.coerce
      .number()
      .finite('Latitude must be a number')
      .min(-90, 'Latitude runs from -90 to 90')
      .max(90, 'Latitude runs from -90 to 90'),
    longitude: z.coerce
      .number()
      .finite('Longitude must be a number')
      .min(-180, 'Longitude runs from -180 to 180')
      .max(180, 'Longitude runs from -180 to 180'),
    // Below about 50 m a phone's own error would put staff outside the fence
    // while they stood in the office; above 2 km it stops meaning "at school".
    geofenceRadiusM: z.coerce
      .number()
      .int('Use a whole number of metres')
      .min(50, 'A radius under 50 m is smaller than a phone can reliably resolve')
      .max(2000, 'A radius over 2 km stops meaning "on the premises"'),
  })
  .refine((v) => isValidLatLng(v.latitude, v.longitude), {
    path: ['latitude'],
    message: 'That point is in the Atlantic — check the coordinates',
  })

export type SchoolLocationInput = z.infer<typeof schoolLocationSchema>

export async function getSchoolLocation(ctx: AppContext) {
  ctx.require('settings.view')

  const school = await ctx.db.school.findFirst({
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      geofenceRadiusM: true,
      addressLine1: true,
      city: true,
      state: true,
    },
  })
  if (!school) throw notFound('School')

  return {
    ...school,
    isSet: isValidLatLng(school.latitude ?? Number.NaN, school.longitude ?? Number.NaN),
  }
}

export async function saveSchoolLocation(ctx: AppContext, input: SchoolLocationInput) {
  ctx.require('settings.manage')

  const school = await ctx.db.school.findFirst({
    select: { id: true, latitude: true, longitude: true, geofenceRadiusM: true },
  })
  if (!school) throw notFound('School')

  const updated = await ctx.db.school.update({
    where: { id: school.id },
    data: {
      latitude: input.latitude,
      longitude: input.longitude,
      geofenceRadiusM: input.geofenceRadiusM,
    },
    select: { latitude: true, longitude: true, geofenceRadiusM: true },
  })

  // Worth auditing properly: moving this point moves the boundary that decides
  // whether staff attendance is accepted, so "who moved it, and when" is a
  // question that will eventually be asked.
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'settings.location.update',
    module: 'settings',
    entityType: 'School',
    entityId: school.id,
    summary: `Set the school location to ${input.latitude}, ${input.longitude} with a ${input.geofenceRadiusM} m radius`,
    before: school,
    after: updated,
  })

  return updated
}

/**
 * Resolves a shortened Maps link.
 *
 * `maps.app.goo.gl` carries no coordinates — it is a redirect and nothing else,
 * so the only way to read it is to follow it. Done on the server rather than in
 * the browser because the redirect target sets no CORS headers, and doing it
 * here also means the school's network never has to reach Google at all if this
 * feature goes unused.
 */
export async function resolveShortLink(ctx: AppContext, url: string) {
  ctx.require('settings.manage')

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('That is not a valid link')
  }

  // An allow-list, not a block-list: this is a server making an outbound
  // request on behalf of a user, and without it the field is an SSRF hole
  // pointed at anything reachable from the application host.
  const allowed = ['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'www.google.com', 'g.co']
  if (!allowed.includes(parsedUrl.hostname)) {
    throw new Error('Only Google Maps links can be expanded')
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('The link must be https')
  }

  const response = await fetch(parsedUrl.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: {
      // Google serves a coordinate-free interstitial to unknown agents.
      'user-agent': 'Mozilla/5.0 (compatible; MyCampusView/1.0)',
    },
    signal: AbortSignal.timeout(8000),
  })

  // The destination URL is where the coordinates live; the body is a full
  // Maps application and is not worth reading.
  const finalUrl = response.url
  const result = parseLocationInput(finalUrl)

  if (result.ok) return result.value

  // Some redirects land on a consent page that keeps the real target in a
  // query parameter, so one unwrap is worth trying before giving up.
  const nested = new URL(finalUrl).searchParams.get('continue')
  if (nested) {
    const second = parseLocationInput(nested)
    if (second.ok) return second.value
  }

  throw new Error(
    'That short link could not be expanded. Open it in a browser and paste the full link instead.',
  )
}

import type { NextRequest } from 'next/server'
import { prisma } from '@/server/db/prisma'
import { publicRoute } from '@/server/api/handler'
import { ok, notFound, badRequest } from '@/server/api/response'
import { rateLimit } from '@/server/rate-limit'
import { requestMeta } from '@/server/auth/session'
import { resolveBrandingAssetUrl } from '@/server/branding-assets'

/**
 * GET /api/v1/site/school/:slug — tenant bootstrap for a native client.
 *
 * The web never needs this: a browser arrives on the school's own subdomain,
 * so the tenant is already decided by the time a login form renders. An
 * Android app is installed once and points at one API origin, so it has to ask
 * which school it is talking to before it can show a branded sign-in screen.
 *
 * Only what a sign-in screen needs is returned — the name and the branding
 * that a visitor to `school.mycampusview.com/login` would already see. No
 * counts, no addresses, no contacts, nothing about who attends.
 *
 * Slug enumeration is not made materially easier by this: the same answer is
 * available by resolving the subdomain over DNS or requesting its login page.
 * It is rate limited per address regardless, so it cannot be used to sweep the
 * namespace cheaply.
 */
export const GET = publicRoute(async (_req: NextRequest, params) => {
  const slug = params.slug?.trim().toLowerCase()
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
    throw badRequest('That is not a valid school code.')
  }

  const meta = await requestMeta().catch(() => ({ ip: null, userAgent: null }))
  const limited = await rateLimit(`site:school:${meta.ip ?? 'unknown'}`, 30, 300)
  if (!limited.ok) {
    throw badRequest('Too many lookups from this connection. Please wait a moment.')
  }

  const tenant = await prisma.tenant.findFirst({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      archivedAt: true,
      timezone: true,
      currency: true,
      school: {
        select: {
          name: true,
          branding: {
            select: {
              logoUrl: true,
              primaryHex: true,
              loginHeadline: true,
              loginSubtext: true,
            },
          },
        },
      },
    },
  })

  // An archived school answers exactly as an unknown one does. Distinguishing
  // them would confirm that a school once existed here, which is not this
  // endpoint's business.
  if (!tenant || tenant.archivedAt) throw notFound('No school found with that code.')

  const branding = tenant.school?.branding

  return ok({
    slug: tenant.slug,
    name: tenant.school?.name ?? tenant.name,
    // Reported so the app can explain a refused sign-in rather than showing a
    // generic failure a parent cannot act on.
    suspended: tenant.status === 'SUSPENDED',
    timezone: tenant.timezone,
    currency: tenant.currency,
    logoUrl: resolveBrandingAssetUrl(branding?.logoUrl, 'logo'),
    primaryHex: branding?.primaryHex ?? null,
    loginHeadline: branding?.loginHeadline ?? null,
    loginSubtext: branding?.loginSubtext ?? null,
  })
})

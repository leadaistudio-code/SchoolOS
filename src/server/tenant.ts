import { headers } from 'next/headers'
import { cache } from 'react'
import { resolveBrandingAssetUrl } from '@/server/branding-assets'
import { prisma } from '@/server/db/prisma'
import { env } from '@/lib/env'

export type ResolvedTenant = {
  id: string
  slug: string
  name: string
  status: string
  timezone: string
  currency: string
  locale: string
  school: {
    id: string
    name: string
    code: string
    logoUrl: string | null
    faviconUrl: string | null
    primaryHex: string
    secondaryHex: string
    accentHex: string
    radius: string
    loginHeadline: string | null
    loginSubtext: string | null
    loginBannerUrl: string | null
    footerText: string | null
    pwaName: string | null
    pwaShortName: string | null
    pwaThemeHex: string | null
    pdfHeaderHtml: string | null
    pdfFooterHtml: string | null
  } | null
}

/** Hosts that never map to a tenant. */
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'admin', 'api', 'platform', 'static'])

/** True for the marketing apex, www, and application/platform subdomains. */
export function isPlatformHost(host: string | null): boolean {
  if (!host) return false
  const root = env().APP_ROOT_DOMAIN.split(':')[0]!.toLowerCase()
  const bare = host.split(':')[0]!.toLowerCase()
  if (bare === root || bare === `www.${root}`) return true
  if (bare.endsWith(`.${root}`)) {
    const sub = bare.slice(0, -(root.length + 1))
    if (!sub || sub.includes('.')) return false
    return RESERVED_SUBDOMAINS.has(sub)
  }
  return false
}

export function hostToSlug(host: string | null): string | null {
  if (!host) return null
  const root = env().APP_ROOT_DOMAIN.split(':')[0]!.toLowerCase()
  const bare = host.split(':')[0]!.toLowerCase()
  if (bare === root) return null
  if (bare.endsWith(`.${root}`)) {
    const sub = bare.slice(0, -(root.length + 1))
    if (!sub || sub.includes('.')) return null
    if (RESERVED_SUBDOMAINS.has(sub)) return null
    return sub
  }
  return null
}

/**
 * How a native client names its school.
 *
 * The web resolves a tenant from the Host, because every school has its own
 * subdomain or custom domain. An Android app has no such luxury — it is built
 * once and points at a single API origin for every school — so it states the
 * slug outright.
 *
 * This is not a security boundary and must never be treated as one. Anyone can
 * set a header. What makes it safe is unchanged: `getContext` refuses to build
 * a context unless `user.tenantId === tenant.id`, so naming another school's
 * slug resolves that tenant and then fails the session check.
 */
export const TENANT_HEADER = 'x-tenant-slug'

/**
 * Resolves the tenant for the current request from its Host header, first by
 * custom domain (erp.school.com) and then by subdomain (school.schoolos.app),
 * and failing that from the explicit header a native client sends.
 * Cached per request so the many server components on a page share one query.
 */
export const resolveTenant = cache(async (): Promise<ResolvedTenant | null> => {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')

  const tenant = (await fromHost(host)) ?? (await fromHeader(h.get(TENANT_HEADER)))
  if (!tenant || tenant.archivedAt) return null

  const b = tenant.school?.branding
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    timezone: tenant.timezone,
    currency: tenant.currency,
    locale: tenant.locale,
    school: tenant.school
      ? {
          id: tenant.school.id,
          name: tenant.school.name,
          code: tenant.school.code,
          logoUrl: resolveBrandingAssetUrl(b?.logoUrl, 'logo'),
          faviconUrl: resolveBrandingAssetUrl(b?.faviconUrl, 'favicon'),
          primaryHex: b?.primaryHex ?? '#E41F07',
          secondaryHex: b?.secondaryHex ?? '#0A0C0C',
          accentHex: b?.accentHex ?? '#FFA201',
          radius: b?.radius ?? '8px',
          loginHeadline: b?.loginHeadline ?? null,
          loginSubtext: b?.loginSubtext ?? null,
          loginBannerUrl: resolveBrandingAssetUrl(b?.loginImageUrl, 'banner'),
          footerText: b?.footerText ?? null,
          pwaName: b?.pwaName ?? null,
          pwaShortName: b?.pwaShortName ?? null,
          pwaThemeHex: b?.pwaThemeHex ?? null,
          pdfHeaderHtml: b?.pdfHeaderHtml ?? null,
          pdfFooterHtml: b?.pdfFooterHtml ?? null,
        }
      : null,
  }
})

/** What the browser asks for: a school named by the address it was reached on. */
async function fromHost(host: string | null) {
  if (!host) return null

  // The platform console runs on app./admin./platform. subdomains (and the
  // apex). Never bind those hosts to a school, even if a TenantDomain row
  // exists — a native client on the same origin uses the header instead.
  if (isPlatformHost(host)) return null

  const bare = host.split(':')[0]!.toLowerCase()

  const byDomain = await prisma.tenantDomain.findUnique({
    where: { host: bare },
    select: { tenantId: true, verified: true },
  })

  const slug = hostToSlug(host)
  return prisma.tenant.findFirst({
    where: byDomain?.verified
      ? { id: byDomain.tenantId }
      : slug
        ? { slug }
        : { id: '__none__' },
    include: { school: { include: { branding: true } } },
  })
}

/** What a native client asks for: a school named outright. See TENANT_HEADER. */
async function fromHeader(raw: string | null) {
  const slug = raw?.trim().toLowerCase()
  // Slugs are the same shape the subdomain path accepts. Anything else is not
  // worth a query.
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) return null
  if (RESERVED_SUBDOMAINS.has(slug)) return null

  return prisma.tenant.findFirst({
    where: { slug },
    include: { school: { include: { branding: true } } },
  })
}

export function tenantUrl(slug: string, path = '/'): string {
  const url = new URL(env().APP_URL)
  return `${url.protocol}//${slug}.${env().APP_ROOT_DOMAIN}${path}`
}

export function platformUrl(path = '/'): string {
  const root = env().APP_ROOT_DOMAIN.split(':')[0]!
  const appUrl = env().APP_URL
  try {
    const parsed = new URL(appUrl)
    // When the app is deployed on app.domain.com, platform links should stay there.
    if (parsed.hostname.startsWith('app.')) {
      return `${parsed.protocol}//${parsed.host}${path}`
    }
  } catch {
    /* fall through */
  }
  return `${new URL(appUrl).protocol}//${root}${path}`
}

import { headers } from 'next/headers'
import { cache } from 'react'
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
    footerText: string | null
  } | null
}

/** Hosts that never map to a tenant. */
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'admin', 'api', 'platform', 'static'])

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
 * Resolves the tenant for the current request from its Host header, first by
 * custom domain (erp.school.com) and then by subdomain (school.schoolos.app).
 * Cached per request so the many server components on a page share one query.
 */
export const resolveTenant = cache(async (): Promise<ResolvedTenant | null> => {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) return null

  const bare = host.split(':')[0]!.toLowerCase()

  const byDomain = await prisma.tenantDomain.findUnique({
    where: { host: bare },
    select: { tenantId: true, verified: true },
  })

  const slug = hostToSlug(host)
  const tenant = await prisma.tenant.findFirst({
    where: byDomain?.verified
      ? { id: byDomain.tenantId }
      : slug
        ? { slug }
        : { id: '__none__' },
    include: { school: { include: { branding: true } } },
  })

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
          logoUrl: b?.logoUrl ?? null,
          faviconUrl: b?.faviconUrl ?? null,
          primaryHex: b?.primaryHex ?? '#E41F07',
          secondaryHex: b?.secondaryHex ?? '#0A0C0C',
          accentHex: b?.accentHex ?? '#FFA201',
          radius: b?.radius ?? '8px',
          loginHeadline: b?.loginHeadline ?? null,
          loginSubtext: b?.loginSubtext ?? null,
          footerText: b?.footerText ?? null,
        }
      : null,
  }
})

export function tenantUrl(slug: string, path = '/'): string {
  const url = new URL(env().APP_URL)
  return `${url.protocol}//${slug}.${env().APP_ROOT_DOMAIN}${path}`
}

export function platformUrl(path = '/'): string {
  const url = new URL(env().APP_URL)
  return `${url.protocol}//${env().APP_ROOT_DOMAIN}${path}`
}

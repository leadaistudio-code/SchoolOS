import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import { AppContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { assertWithinLimit, hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { ApiException } from '@/server/api/response'
import { AddDomainInput } from './schema'

export async function listDomains(ctx: AppContext) {
  ctx.require('settings.manage')
  return ctx.db.tenantDomain.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

export async function addDomain(ctx: AppContext, input: AddDomainInput) {
  ctx.require('settings.manage')

  if (!(await hasFeature(ctx.tenant.id, FEATURE.MODULE_CUSTOM_DOMAIN))) {
    throw new ApiException(
      402,
      'FEATURE_LOCKED',
      'Custom domains are not part of this school’s plan.',
    )
  }

  const count = await ctx.db.tenantDomain.count()
  await assertWithinLimit(ctx.tenant.id, FEATURE.LIMIT_DOMAINS, count)

  const existing = await prisma.tenantDomain.findUnique({
    where: { host: input.host },
  })

  if (existing) {
    if (existing.tenantId === ctx.tenant.id) {
      throw new Error('This domain is already added to your school.')
    }
    throw new Error('This domain is already in use by another school.')
  }

  const verifyToken = crypto.randomBytes(24).toString('hex')

  return ctx.db.tenantDomain.create({
    data: {
      tenantId: ctx.tenant.id,
      host: input.host,
      verifyToken,
      verified: false,
      isPrimary: false,
    },
  })
}

export async function verifyDomain(ctx: AppContext, id: string) {
  ctx.require('settings.manage')

  const domain = await ctx.db.tenantDomain.findUnique({ where: { id } })
  if (!domain) throw new Error('Domain not found')
  if (domain.verified) return domain

  const challengeHost = `_schoolos-challenge.${domain.host}`

  try {
    const records = await dns.resolveTxt(challengeHost)
    const txtValues = records.map((record) => record.join(''))

    if (txtValues.includes(domain.verifyToken!)) {
      return ctx.db.tenantDomain.update({
        where: { id },
        data: { verified: true },
      })
    }
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code !== 'ENOTFOUND' && code !== 'ENODATA') {
      console.error('DNS lookup error:', error)
    }
  }

  throw new Error(
    'Verification failed. We could not find the correct TXT record. DNS propagation may take up to 24 hours.',
  )
}

export async function setPrimaryDomain(ctx: AppContext, id: string) {
  ctx.require('settings.manage')

  const domain = await ctx.db.tenantDomain.findUnique({ where: { id } })
  if (!domain) throw new Error('Domain not found')
  if (!domain.verified) throw new Error('Domain must be verified before setting as primary')

  return ctx.db.$transaction(async (tx) => {
    await tx.tenantDomain.updateMany({
      where: { isPrimary: true },
      data: { isPrimary: false },
    })

    return tx.tenantDomain.update({
      where: { id },
      data: { isPrimary: true },
    })
  })
}

export async function removeDomain(ctx: AppContext, id: string) {
  ctx.require('settings.manage')

  const domain = await ctx.db.tenantDomain.findUnique({ where: { id } })
  if (!domain) throw new Error('Domain not found')

  if (domain.isPrimary) {
    throw new Error('Cannot remove the primary domain. Set another domain as primary first.')
  }

  await ctx.db.tenantDomain.delete({ where: { id } })
}

/**
 * TLS is issued by the hosting platform. We probe HTTPS so operators can see
 * whether a certificate is live after DNS is verified.
 */
export async function getDomainCertificateStatus(host: string): Promise<{
  host: string
  httpsReachable: boolean | null
  message: string
}> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`https://${host}/api/health`, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    }).finally(() => clearTimeout(timer))
    return {
      host,
      httpsReachable: res.ok || res.status < 500,
      message: res.ok
        ? 'HTTPS responds. Certificate is active on the hosting platform.'
        : `HTTPS reached the host (HTTP ${res.status}). Confirm the certificate in your host dashboard if the browser still warns.`,
    }
  } catch {
    return {
      host,
      httpsReachable: false,
      message:
        'HTTPS is not reachable yet. After DNS is verified, add this host on Railway/Netlify so a TLS certificate can be issued.',
    }
  }
}

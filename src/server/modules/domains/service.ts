import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import { AppContext } from '@/server/context'
import { AddDomainInput } from './schema'

export async function listDomains(ctx: AppContext) {
  ctx.require('settings.manage')
  return ctx.db.tenantDomain.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

export async function addDomain(ctx: AppContext, input: AddDomainInput) {
  ctx.require('settings.manage')

  // Check if it already exists globally (hosts must be globally unique)
  // But wait, the prisma model has host @unique, so we should query prisma directly to check if it's used elsewhere
  const existing = await ctx.db.$parent.tenantDomain.findUnique({
    where: { host: input.host },
  })

  if (existing) {
    if (existing.tenantId === ctx.tenant.id) {
      throw new Error('This domain is already added to your school.')
    }
    throw new Error('This domain is already in use by another school.')
  }

  const verifyToken = crypto.randomBytes(24).toString('hex')

  const domain = await ctx.db.tenantDomain.create({
    data: {
      host: input.host,
      verifyToken,
      verified: false,
      isPrimary: false,
    },
  })

  return domain
}

export async function verifyDomain(ctx: AppContext, id: string) {
  ctx.require('settings.manage')

  const domain = await ctx.db.tenantDomain.findUnique({ where: { id } })
  if (!domain) throw new Error('Domain not found')
  if (domain.verified) return domain

  const challengeHost = `_schoolos-challenge.${domain.host}`
  
  try {
    const records = await dns.resolveTxt(challengeHost)
    // records is an array of arrays of strings
    const txtValues = records.map((record) => record.join(''))
    
    if (txtValues.includes(domain.verifyToken!)) {
      const verified = await ctx.db.tenantDomain.update({
        where: { id },
        data: { verified: true },
      })
      return verified
    }
  } catch (error: any) {
    // If ENOTFOUND or similar, DNS just hasn't propagated or isn't set
    if (error.code !== 'ENOTFOUND' && error.code !== 'ENODATA') {
      console.error('DNS lookup error:', error)
    }
  }

  throw new Error('Verification failed. We could not find the correct TXT record. DNS propagation may take up to 24 hours.')
}

export async function setPrimaryDomain(ctx: AppContext, id: string) {
  ctx.require('settings.manage')

  const domain = await ctx.db.tenantDomain.findUnique({ where: { id } })
  if (!domain) throw new Error('Domain not found')
  if (!domain.verified) throw new Error('Domain must be verified before setting as primary')

  // Clear existing primary domains in a transaction
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

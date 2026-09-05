import { z } from 'zod'
import { prisma } from '@/server/db/prisma'
import type { PlatformContext } from '@/server/context'
import { ForbiddenError } from '@/server/context'

function assertCrm(ctx: PlatformContext) {
  if (!ctx.user.permissions.has('platform.crm')) {
    throw new ForbiddenError('Missing permission: platform.crm')
  }
}

export async function getDiscoveryDashboard(ctx: PlatformContext) {
  assertCrm(ctx)
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const [
    newToday,
    strong,
    verified,
    needs,
    linked,
    rejected,
    settings,
    locations,
    recentRuns,
  ] = await Promise.all([
    prisma.crmDiscoveryCandidate.count({ where: { discoveredAt: { gte: start }, verificationStatus: { not: 'REJECTED' } } }),
    prisma.crmDiscoveryCandidate.count({ where: { verificationStatus: 'STRONG_LEAD' } }),
    prisma.crmDiscoveryCandidate.count({ where: { verificationStatus: 'VERIFIED' } }),
    prisma.crmDiscoveryCandidate.count({ where: { verificationStatus: 'NEEDS_VERIFICATION' } }),
    prisma.crmDiscoveryCandidate.count({ where: { crmSchoolId: { not: null } } }),
    prisma.crmDiscoveryCandidate.count({ where: { verificationStatus: 'REJECTED' } }),
    prisma.crmDiscoverySettings.findUnique({ where: { id: 'default' } }),
    prisma.crmDiscoveryLocation.findMany({ orderBy: { priority: 'desc' } }),
    prisma.crmDiscoveryRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 8,
      include: { location: { select: { city: true } } },
    }),
  ])

  return {
    stats: {
      newToday,
      strong,
      verified,
      needs,
      linked,
      rejected,
    },
    settings,
    locations,
    recentRuns,
  }
}

export const discoveryListFilterSchema = z.object({
  city: z.string().optional(),
  verification: z.enum(['VERIFIED', 'STRONG_LEAD', 'NEEDS_VERIFICATION', 'REJECTED']).optional(),
  priority: z.enum(['HOT', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  schoolStatus: z.string().optional(),
  linked: z.enum(['yes', 'no']).optional(),
  q: z.string().optional(),
})

export async function listDiscoveryCandidates(
  ctx: PlatformContext,
  filter: z.infer<typeof discoveryListFilterSchema>,
) {
  assertCrm(ctx)
  return prisma.crmDiscoveryCandidate.findMany({
    where: {
      ...(filter.city ? { city: { contains: filter.city, mode: 'insensitive' } } : {}),
      ...(filter.verification ? { verificationStatus: filter.verification } : {}),
      ...(filter.priority ? { salesPriority: filter.priority } : {}),
      ...(filter.schoolStatus ? { schoolStatus: filter.schoolStatus } : {}),
      ...(filter.linked === 'yes' ? { crmSchoolId: { not: null } } : {}),
      ...(filter.linked === 'no' ? { crmSchoolId: null } : {}),
      ...(filter.q
        ? {
            OR: [
              { schoolName: { contains: filter.q, mode: 'insensitive' } },
              { area: { contains: filter.q, mode: 'insensitive' } },
              { sector: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ salesPriority: 'asc' }, { opportunityScore: 'desc' }, { discoveredAt: 'desc' }],
    take: 100,
    include: {
      evidence: { orderBy: { weight: 'desc' }, take: 3 },
      location: { select: { city: true } },
    },
  })
}

export async function getDiscoveryCandidate(ctx: PlatformContext, id: string) {
  assertCrm(ctx)
  return prisma.crmDiscoveryCandidate.findUnique({
    where: { id },
    include: {
      evidence: { orderBy: { weight: 'desc' } },
      location: true,
      run: true,
    },
  })
}

export async function getDiscoveryForCrmSchool(ctx: PlatformContext, crmSchoolId: string) {
  assertCrm(ctx)
  return prisma.crmDiscoveryCandidate.findFirst({
    where: { crmSchoolId },
    include: { evidence: { orderBy: { weight: 'desc' }, take: 5 } },
  })
}

export const discoverySettingsSchema = z.object({
  enabled: z.coerce.boolean(),
  minConfidence: z.coerce.number().int().min(0).max(100),
  autoAddVerified: z.coerce.boolean(),
  autoAddStrongLead: z.coerce.boolean(),
  autoAddNeedsVerification: z.coerce.boolean(),
})

export async function updateDiscoverySettings(
  ctx: PlatformContext,
  input: z.infer<typeof discoverySettingsSchema>,
) {
  if (!ctx.user.permissions.has('platform.crm_edit')) {
    throw new ForbiddenError('Missing permission: platform.crm_edit')
  }
  return prisma.crmDiscoverySettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...input },
    update: input,
  })
}

export const locationCreateSchema = z.object({
  city: z.string().trim().min(2).max(80),
  region: z.string().trim().max(80).optional(),
  state: z.string().trim().min(2).max(80).default('Haryana'),
  priority: z.coerce.number().int().min(1).max(1000).default(50),
  enabled: z.coerce.boolean().default(true),
})

export async function upsertDiscoveryLocation(
  ctx: PlatformContext,
  input: z.infer<typeof locationCreateSchema>,
) {
  if (!ctx.user.permissions.has('platform.crm_edit')) {
    throw new ForbiddenError('Missing permission: platform.crm_edit')
  }
  return prisma.crmDiscoveryLocation.upsert({
    where: { city_state: { city: input.city, state: input.state } },
    create: {
      city: input.city,
      region: input.region ?? null,
      state: input.state,
      priority: input.priority,
      enabled: input.enabled,
    },
    update: {
      region: input.region ?? null,
      priority: input.priority,
      enabled: input.enabled,
    },
  })
}

export async function setCandidateVerification(
  ctx: PlatformContext,
  id: string,
  status: 'VERIFIED' | 'STRONG_LEAD' | 'NEEDS_VERIFICATION' | 'REJECTED',
  reason?: string,
) {
  if (!ctx.user.permissions.has('platform.crm_edit')) {
    throw new ForbiddenError('Missing permission: platform.crm_edit')
  }
  return prisma.crmDiscoveryCandidate.update({
    where: { id },
    data: {
      verificationStatus: status,
      lastVerifiedAt: new Date(),
      ...(status === 'REJECTED'
        ? { rejectedAt: new Date(), rejectedReason: reason ?? 'Rejected by admin' }
        : { rejectedAt: null, rejectedReason: null }),
    },
  })
}

export async function listDiscoveryRuns(ctx: PlatformContext) {
  assertCrm(ctx)
  return prisma.crmDiscoveryRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 40,
    include: { location: { select: { city: true } } },
  })
}

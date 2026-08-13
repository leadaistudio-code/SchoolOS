import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@prisma/client'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { SYSTEM_ROLES, ROLE } from '@/lib/rbac/roles'
import { env } from '@/lib/env'
import { badRequest, conflict, ApiException } from '@/server/api/response'
import { ensureExamDefaults } from '@/server/modules/exams/defaults'

export type ProvisionInput = {
  slug: string
  schoolName: string
  adminEmail: string
  adminPassword: string
  adminName?: string
  planId: string
  trial?: boolean
  host?: string | null
}

/**
 * Shared school provisioning used by the CLI and the platform console.
 * Creates tenant, subscription, school, domain, academic session and admin user.
 */
export async function provisionSchool(db: PrismaClient, input: ProvisionInput) {
  const email = input.adminEmail.toLowerCase()
  const rootDomain = env().APP_ROOT_DOMAIN.split(':')[0]!
  const defaultHost = `${input.slug}.${rootDomain}`
  const passwordHash = await bcrypt.hash(input.adminPassword, 12)

  const plan = await db.plan.findUnique({ where: { id: input.planId } })
  if (!plan) throw badRequest('Plan not found')

  const adminRole = await db.role.findFirst({
    where: { tenantId: null, key: ROLE.SCHOOL_ADMIN },
  })
  if (!adminRole) throw badRequest('School admin role is missing — run db:seed first')

  try {
    const result = await db.$transaction(async (tx) => {
      const existingSlug = await tx.tenant.findUnique({ where: { slug: input.slug } })
      if (existingSlug) throw conflict(`Slug "${input.slug}" is already taken`)

      const now = new Date()
      const trialEnds = new Date(now.getTime() + plan.trialDays * 86_400_000)
      const periodEnd = new Date(now.getTime() + 365 * 86_400_000)

      const tenant = await tx.tenant.create({
        data: {
          slug: input.slug,
          name: input.schoolName,
          status: input.trial !== false && plan.trialDays > 0 ? 'TRIAL' : 'ACTIVE',
        },
      })

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: tenant.status,
          cycle: plan.cycle,
          currentStart: now,
          currentEnd: periodEnd,
          trialEndsAt: input.trial !== false && plan.trialDays > 0 ? trialEnds : null,
        },
      })

      const school = await tx.school.create({
        data: {
          tenantId: tenant.id,
          code: input.slug.toUpperCase(),
          name: input.schoolName,
          email,
          branding: { create: { tenantId: tenant.id } },
        },
      })

      const hosts = [input.host, defaultHost].filter((h): h is string => !!h)
      for (const host of hosts) {
        const normalized = host.toLowerCase()
        await tx.tenantDomain.create({
          data: {
            tenantId: tenant.id,
            host: normalized,
            isPrimary: normalized === (input.host?.toLowerCase() ?? defaultHost),
            verified: true,
          },
        })
      }

      const yearStart = new Date(now.getFullYear(), 3, 1)
      const sessionName = `${yearStart.getFullYear()}-${String(yearStart.getFullYear() + 1).slice(2)}`
      await tx.academicSession.create({
        data: {
          tenantId: tenant.id,
          name: sessionName,
          startsOn: yearStart,
          endsOn: new Date(yearStart.getFullYear() + 1, 2, 31),
          isCurrent: true,
        },
      })

      const [firstName, ...rest] = (input.adminName ?? 'School Administrator').split(' ')
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          firstName: firstName ?? 'School',
          lastName: rest.join(' ') || 'Administrator',
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: now,
          roles: { create: { roleId: adminRole.id } },
        },
      })

      await ensureExamDefaults(tx, tenant.id)

      return { tenant, user, school }
    })
    return result
  } catch (err) {
    if (err instanceof ApiException) throw err
    const code = (err as { code?: string })?.code
    if (code === 'P2002') throw conflict(`Slug "${input.slug}" is already taken`)
    throw err
  }
}

/** Ensures permission catalogue and system roles exist (CLI first-run). */
export async function ensureRolesAndPermissions(db: PrismaClient) {
  await db.$transaction(
    PERMISSIONS.map((permission) =>
      db.permission.upsert({
        where: { key: permission.key },
        create: permission,
        update: {
          module: permission.module,
          action: permission.action,
          label: permission.label,
        },
      }),
    ),
  )

  const permissionIds = new Map(
    (await db.permission.findMany({ select: { id: true, key: true } })).map((p) => [
      p.key,
      p.id,
    ]),
  )

  for (const def of SYSTEM_ROLES) {
    const existing = await db.role.findFirst({ where: { tenantId: null, key: def.key } })
    const role =
      existing ??
      (await db.role.create({
        data: {
          tenantId: null,
          key: def.key,
          name: def.name,
          description: def.description,
          isSystem: true,
        },
      }))

    await db.rolePermission.deleteMany({ where: { roleId: role.id } })
    await db.rolePermission.createMany({
      data: def.permissions
        .map((key) => permissionIds.get(key))
        .filter((id): id is string => !!id)
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    })
  }
}

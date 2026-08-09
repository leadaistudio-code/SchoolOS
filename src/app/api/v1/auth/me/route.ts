import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'

/** GET /api/v1/auth/me - the signed-in identity, its roles and permissions. */
export const GET = route(async (_req, ctx) =>
  ok({
    user: {
      id: ctx.user.userId,
      firstName: ctx.user.firstName,
      lastName: ctx.user.lastName,
      email: ctx.user.email,
      roles: ctx.user.roleKeys,
      permissions: [...ctx.user.permissions],
      impersonated: !!ctx.user.impersonatedById,
    },
    tenant: {
      id: ctx.tenant.id,
      slug: ctx.tenant.slug,
      name: ctx.tenant.school?.name ?? ctx.tenant.name,
      currency: ctx.tenant.currency,
      timezone: ctx.tenant.timezone,
    },
  }),
)

import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, notFound } from '@/server/api/response'
import { getDomainCertificateStatus } from '@/server/modules/domains/service'

export const POST = route(
  async (_req: NextRequest, ctx, params) => {
    const domain = await ctx.db.tenantDomain.findFirst({ where: { id: params.id! } })
    if (!domain) throw notFound('Domain not found')
    const status = await getDomainCertificateStatus(domain.host)
    return ok(status)
  },
  { permission: 'settings.manage', rateLimitKey: 'mutation' },
)

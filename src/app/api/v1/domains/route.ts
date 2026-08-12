import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { listDomains, addDomain } from '@/server/modules/domains/service'
import { addDomainSchema } from '@/server/modules/domains/schema'

export const GET = route(
  async (_req: NextRequest, ctx) => {
    const domains = await listDomains(ctx)
    return ok(domains)
  },
  { permission: 'settings.manage' },
)

export const POST = route(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const input = addDomainSchema.parse(body)
    const domain = await addDomain(ctx, input)
    return ok(domain, undefined, { status: 201 })
  },
  { permission: 'settings.manage', rateLimitKey: 'mutation' },
)

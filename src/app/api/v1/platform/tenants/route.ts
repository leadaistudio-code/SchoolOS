import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { listTenants, provisionTenant } from '@/server/modules/platform/tenants'
import { listTenantsSchema, provisionTenantSchema } from '@/server/modules/platform/schema'

function parseProvisionBody(req: NextRequest) {
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('multipart/form-data')) {
    return req.formData().then((form) => {
      const parsed = provisionTenantSchema.safeParse({
        slug: form.get('slug'),
        schoolName: form.get('schoolName'),
        adminEmail: form.get('adminEmail'),
        adminPassword: form.get('adminPassword'),
        adminName: form.get('adminName') || undefined,
        planId: form.get('planId'),
        trial: form.get('trial') === 'on',
      })
      if (!parsed.success) {
        throw new ApiException(400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? 'Invalid input')
      }
      const logo = form.get('logo')
      const banner = form.get('banner')
      const assets = {
        logo: logo instanceof File && logo.size > 0 ? logo : undefined,
        banner: banner instanceof File && banner.size > 0 ? banner : undefined,
      }
      return { input: parsed.data, assets }
    })
  }

  return req.json().then((body) => ({
    input: provisionTenantSchema.parse(body),
    assets: undefined as { logo?: File; banner?: File } | undefined,
  }))
}

export const GET = platformRoute(
  async (req: NextRequest, ctx) => {
    const q = Object.fromEntries(req.nextUrl.searchParams)
    const query = listTenantsSchema.parse(q)
    const result = await listTenants(ctx, query)
    return ok(result.rows, result.meta)
  },
  { permission: 'platform.tenants' },
)

export const POST = platformRoute(
  async (req: NextRequest, ctx) => {
    const { input, assets } = await parseProvisionBody(req)
    const result = await provisionTenant(ctx, input, assets)
    return ok(result, undefined, { status: 201 })
  },
  { permission: 'platform.tenants', rateLimitKey: 'mutation' },
)

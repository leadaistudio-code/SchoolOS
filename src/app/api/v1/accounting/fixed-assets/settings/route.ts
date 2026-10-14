import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { setDepreciationFrequency } from '@/server/modules/accounting/fixed-assets-service'

/** POST { depreciationFrequency: 'MONTHLY' | 'YEARLY' } */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const saved = await setDepreciationFrequency(ctx, await req.json())
    return ok({ depreciationFrequency: saved.depreciationFrequency })
  },
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)

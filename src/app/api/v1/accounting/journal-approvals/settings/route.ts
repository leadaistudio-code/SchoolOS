import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { setDepartmentStage } from '@/server/modules/accounting/journal-approval-service'

/** POST { departmentStage }: switches the optional Department head stage on or off. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const { departmentStage } = z.object({ departmentStage: z.boolean() }).parse(await req.json())
    const saved = await setDepartmentStage(ctx, departmentStage)
    return ok({ departmentApprovalEnabled: saved.departmentApprovalEnabled })
  },
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)

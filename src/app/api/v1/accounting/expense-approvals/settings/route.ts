import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { setApprovalWorkflow } from '@/server/modules/accounting/expense-approval-service'

/** POST { enabled }: the school's "Trigger Multi-Tier Approval Workflow" switch. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const saved = await setApprovalWorkflow(ctx, await req.json())
    return ok({ approvalWorkflowEnabled: saved.approvalWorkflowEnabled })
  },
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)

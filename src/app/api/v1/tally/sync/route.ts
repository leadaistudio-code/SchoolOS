import { route } from '@/server/api/handler'
import { badRequest, ok } from '@/server/api/response'
import { enqueueTallyCommand } from '@/server/modules/tally/commands'
import { getOrCreateIntegration } from '@/server/modules/tally/settings'

export const POST = route(async (req, ctx) => {
  const body = (await req.json().catch(() => ({}))) as { type?: string }
  const integration = await getOrCreateIntegration(ctx)
  const type = body.type ?? 'TEST_CONNECTION'
  const allowed = [
    'TEST_CONNECTION',
    'LIST_COMPANIES',
    'FETCH_MASTERS',
    'FETCH_VOUCHERS',
    'FETCH_BALANCES',
    'RECONCILE',
  ] as const
  if (!allowed.includes(type as (typeof allowed)[number])) {
    throw badRequest('Unsupported sync type')
  }

  const command = await enqueueTallyCommand(ctx, {
    type: type as (typeof allowed)[number],
    payload: {
      companyName: integration.companyName,
    },
  })

  return ok({ commandId: command.id, type: command.type, status: command.status })
}, { permission: 'fees.tally_manage' })

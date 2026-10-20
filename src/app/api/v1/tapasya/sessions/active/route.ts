import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getActiveSession } from '@/server/modules/tapasya/sessions'

export const GET = route(async (_req, ctx) => ok(await getActiveSession(ctx)), { permission: 'tapasya.use' })

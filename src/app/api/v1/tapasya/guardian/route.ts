import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { guardianOverview } from '@/server/modules/tapasya/guardian'

export const GET = route(async (_req, ctx) => ok(await guardianOverview(ctx)), { permission: 'tapasya.guardian' })

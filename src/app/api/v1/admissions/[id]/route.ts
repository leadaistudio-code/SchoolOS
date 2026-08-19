import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getLead } from '@/server/modules/admissions/service'

/** GET /api/v1/admissions/:id — one enquiry, its follow-ups and its history. */
export const GET = route(async (_req, ctx, params) => ok(await getLead(ctx, params.id!)), {
  permission: 'admissions.view',
})

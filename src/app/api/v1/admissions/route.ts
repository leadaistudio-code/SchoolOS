import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { listLeadsByStage } from '@/server/modules/admissions/service'

/**
 * GET /api/v1/admissions — the enquiry pipeline, grouped by stage.
 *
 * The admissions module was built entirely on server components and server
 * actions, so none of it could be reached over HTTP and the Android app had no
 * way to show a counsellor their leads. This is the missing door, not a second
 * implementation: `listLeadsByStage` is the same function the web pipeline
 * renders from, and it performs its own `admissions.view` check inside.
 */
export const GET = route(async (_req, ctx) => ok(await listLeadsByStage(ctx)), {
  permission: 'admissions.view',
})

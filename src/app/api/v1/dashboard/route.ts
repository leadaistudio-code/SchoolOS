import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getAdminDashboard } from '@/server/modules/dashboard/service'

/**
 * GET /api/v1/dashboard — the figures the administrator home screen reads.
 *
 * The web renders this in a server component, so until now there was no way to
 * ask for it over HTTP and the Android app had nothing to open on. It calls
 * the same `getAdminDashboard` the page does rather than recomputing anything:
 * one definition of "attendance today", one of "outstanding", and no chance of
 * the two clients quoting different numbers to the same principal.
 *
 * `dashboard.view` is required here exactly as the page requires it, so this
 * exposes no data to anyone who could not already load the web dashboard.
 */
export const GET = route(async (_req, ctx) => ok(await getAdminDashboard(ctx)), {
  permission: 'dashboard.view',
})

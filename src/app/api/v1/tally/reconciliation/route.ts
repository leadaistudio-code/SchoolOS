import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { listReconciliation, runReconciliation } from '@/server/modules/tally/reconciliation'
import { listVoucherLinks, retryFailedSyncs } from '@/server/modules/tally/receipts'

export const GET = route(async (req, ctx) => {
  const url = new URL(req.url)
  const view = url.searchParams.get('view')
  if (view === 'links') {
    return ok(
      await listVoucherLinks(ctx, {
        status: url.searchParams.get('status') ?? undefined,
      }),
    )
  }
  return ok(await listReconciliation(ctx, url.searchParams.get('runId') ?? undefined))
}, { permission: 'fees.tally' })

export const POST = route(async (req, ctx) => {
  const body = (await req.json().catch(() => ({}))) as { action?: string }
  if (body.action === 'retry_failed') return ok(await retryFailedSyncs(ctx))
  return ok(await runReconciliation(ctx))
}, { permission: 'fees.tally_manage' })

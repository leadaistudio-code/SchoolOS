import { route } from '@/server/api/handler'
import { badRequest, ok } from '@/server/api/response'
import {
  autoAcceptSuggestions,
  deleteMapping,
  listCachedLedgers,
  listMappings,
  suggestFeeHeadMappings,
  upsertMapping,
} from '@/server/modules/tally/mappings'

export const GET = route(async (req, ctx) => {
  const url = new URL(req.url)
  const view = url.searchParams.get('view')
  if (view === 'suggestions') return ok(await suggestFeeHeadMappings(ctx))
  if (view === 'ledgers') {
    return ok(await listCachedLedgers(ctx, url.searchParams.get('q') ?? undefined))
  }
  return ok(await listMappings(ctx, url.searchParams.get('kind') ?? undefined))
}, { permission: 'fees.tally' })

export const POST = route(async (req, ctx) => {
  const body = await req.json()
  if (body?.action === 'auto_accept') {
    return ok(await autoAcceptSuggestions(ctx, Number(body.minScore ?? 92)))
  }
  return ok(await upsertMapping(ctx, body))
}, { permission: 'fees.tally_manage' })

export const DELETE = route(async (req, ctx) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) throw badRequest('id required')
  return ok(await deleteMapping(ctx, id))
}, { permission: 'fees.tally_manage' })

import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { consentSchema, setConsent } from '@/server/modules/whatsapp-receipts/service'

/** POST { phone, status, source, note }: record a parent's WhatsApp opt-in or opt-out. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    await setConsent(ctx, consentSchema.parse(await req.json()))
    return ok({ saved: true })
  },
  { permission: 'fees.collect', rateLimitKey: 'mutation' },
)

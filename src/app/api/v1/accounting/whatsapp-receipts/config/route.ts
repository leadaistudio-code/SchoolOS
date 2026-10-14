import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { receiptConfigSchema, rotateWebhookKey, saveReceiptConfig } from '@/server/modules/whatsapp-receipts/service'

/** PUT: the school's provider settings. Secrets left blank keep their saved value. */
export const PUT = route(
  async (req: NextRequest, ctx) => {
    await saveReceiptConfig(ctx, receiptConfigSchema.parse(await req.json()))
    return ok({ saved: true })
  },
  { permission: 'settings.integrations', rateLimitKey: 'mutation' },
)

/** POST: issue a new delivery-status URL. */
export const POST = route(
  async (_req: NextRequest, ctx) => {
    await rotateWebhookKey(ctx)
    return ok({ rotated: true })
  },
  { permission: 'settings.integrations', rateLimitKey: 'mutation' },
)

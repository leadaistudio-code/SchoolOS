import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { setWhatsAppReceipts } from '@/server/modules/whatsapp-receipts/service'

/** POST { enabled }: the school's WhatsApp fee receipts switch. */
export const POST = route(
  async (req: NextRequest, ctx) => ok(await setWhatsAppReceipts(ctx, await req.json())),
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)

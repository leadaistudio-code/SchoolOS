import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { recipientDirectory } from '@/server/modules/messages/service'

/**
 * The compose box's address book.
 *
 * Narrowed on the server: a parent searching here sees staff and nobody else,
 * whatever the client asks for.
 */
export const GET = route(
  async (req: NextRequest, ctx) =>
    ok(await recipientDirectory(ctx, req.nextUrl.searchParams.get('q') ?? undefined)),
  { permission: 'messages.send' },
)

import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { timingSafeEqual } from '@/server/crypto'
import { metaSignatureValid } from '@/server/messaging/meta-signature'
import { parseInbound } from '@/lib/whatsapp-bot'
import { handleInbound } from '@/server/modules/whatsapp-bot/service'

export const dynamic = 'force-dynamic'

function tokenMatches(token: string | null) {
  const secret = env().WHATSAPP_INBOUND_SECRET
  return !!secret && !!token && timingSafeEqual(token, secret)
}

/** Meta's one-time subscription handshake. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  if (q.get('hub.mode') === 'subscribe' && tokenMatches(q.get('hub.verify_token'))) {
    return new NextResponse(q.get('hub.challenge') ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

/**
 * Meta Cloud (signed with the app secret), Gupshup and Twilio (?token=) all
 * post parent messages here. Always answers 200 once authorised: providers
 * retry on errors, and a retry would make the bot answer the same question twice.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  const authorised =
    metaSignatureValid(raw, req.headers.get('x-hub-signature-256'), env().WHATSAPP_APP_SECRET) ||
    tokenMatches(req.nextUrl.searchParams.get('token'))
  if (!authorised) return new NextResponse('Forbidden', { status: 403 })

  let body: unknown = null
  try {
    const type = req.headers.get('content-type') ?? ''
    body = type.includes('application/x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const msg = parseInbound(body)
  if (msg) {
    try {
      await handleInbound(msg)
    } catch (error) {
      console.error('[whatsapp-inbound] failed', error instanceof Error ? error.message : error)
    }
  }
  return NextResponse.json({ ok: true })
}

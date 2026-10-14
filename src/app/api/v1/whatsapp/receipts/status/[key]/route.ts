import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'
import { handleStatusWebhook, verifySubscription } from '@/server/modules/whatsapp-receipts/webhook'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 256 * 1024

function ipOf(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
}

async function limited(req: NextRequest) {
  const { limit, windowSeconds } = RATE_LIMITS.webhook
  return !(await rateLimit(`wa-receipt-status:${ipOf(req)}`, limit, windowSeconds)).ok
}

/** Meta's one-time subscription handshake. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (await limited(req)) return new NextResponse('Too many requests', { status: 429 })
  const { key } = await params
  const challenge = await verifySubscription(key, req.nextUrl.searchParams)
  return challenge !== null ? new NextResponse(challenge, { status: 200 }) : new NextResponse('Forbidden', { status: 403 })
}

/**
 * Delivery updates and STOP / START replies. Answers 200 once authorised,
 * whatever the content: providers retry on errors, and a retry adds nothing.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (await limited(req)) return new NextResponse('Too many requests', { status: 429 })
  const { key } = await params
  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return new NextResponse('Payload too large', { status: 413 })
  try {
    const result = await handleStatusWebhook(key, raw, req.headers.get('x-hub-signature-256'))
    if (result.http !== 200) return new NextResponse(result.http === 403 ? 'Forbidden' : 'Not found', { status: result.http })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[whatsapp-receipts] status webhook failed', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

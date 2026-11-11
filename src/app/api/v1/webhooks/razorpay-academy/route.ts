import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { handleAcademyWebhook } from '@/server/modules/lms/academy'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/webhooks/razorpay-academy
 *
 * Razorpay's callback for Academy course payments. Trust comes only from the
 * signature over the raw body, so the body is read as text before anything
 * parses it. Rejected calls still answer 200 so a forger earns no retries;
 * a genuine fault answers 500 so Razorpay tries again.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const limited = await rateLimit(`webhook:academy:${ip}`, RATE_LIMITS.webhook.limit, RATE_LIMITS.webhook.windowSeconds)
  if (!limited.ok) return NextResponse.json({ received: false, reason: 'Rate limited' }, { status: 429 })

  const rawBody = await req.text()
  try {
    const result = await handleAcademyWebhook(
      rawBody,
      req.headers.get('x-razorpay-signature'),
      req.headers.get('x-razorpay-event-id'),
    )
    return NextResponse.json({ received: true, ...result })
  } catch (err) {
    console.error('[webhook] academy payment handling failed', err)
    return NextResponse.json({ received: false, reason: 'Processing error' }, { status: 500 })
  }
}

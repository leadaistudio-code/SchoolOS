import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { handleWebhook } from '@/server/modules/finance/payments'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'

// The signature is computed over the exact bytes the gateway sent, so the body
// must be read raw. Any parsing before verification would be verifying a
// re-serialised approximation of the payload.
export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/webhooks/payment
 *
 * Unauthenticated by necessity - a payment gateway has no session. Trust comes
 * entirely from the HMAC signature, which is checked before the body is acted
 * on, and every callback (accepted or rejected) is recorded.
 *
 * Always answers 200 to a well-formed request, including one it rejects.
 * Gateways retry on non-2xx, and a forged callback should not earn itself a
 * retry loop; the outcome is reported in the body instead.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const limited = await rateLimit(
    `webhook:payment:${ip}`,
    RATE_LIMITS.webhook.limit,
    RATE_LIMITS.webhook.windowSeconds,
  )
  if (!limited.ok) {
    return NextResponse.json({ received: false, reason: 'Rate limited' }, { status: 429 })
  }

  const rawBody = await req.text()
  const signature =
    req.headers.get('x-webhook-signature') ??
    req.headers.get('x-razorpay-signature') ??
    req.headers.get('stripe-signature')

  try {
    const result = await handleWebhook(rawBody, signature)
    return NextResponse.json({ received: true, ...result })
  } catch (err) {
    // A 500 here makes the gateway retry, which is what we want for a genuine
    // transient fault.
    console.error('[webhook] payment handling failed', err)
    return NextResponse.json({ received: false, reason: 'Processing error' }, { status: 500 })
  }
}

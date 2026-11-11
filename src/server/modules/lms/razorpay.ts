import { env } from '@/lib/env'
import { hmacSha256, timingSafeEqual } from '@/server/crypto'

/**
 * The few Razorpay calls the Academy needs, against the platform's own
 * account. Kept apart from the school fee gateway: Academy money belongs to
 * MyCampusView, fee money to each school.
 */

const API = 'https://api.razorpay.com/v1'

export function razorpayKeys() {
  const keyId = env().RAZORPAY_KEY_ID
  const keySecret = env().RAZORPAY_KEY_SECRET
  return keyId && keySecret ? { keyId, keySecret } : null
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const keys = razorpayKeys()
  if (!keys) throw new Error('Razorpay keys are not configured')
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  const json = (await response.json().catch(() => null)) as (T & { error?: { description?: string } }) | null
  if (!response.ok || !json) {
    throw new Error(`Razorpay ${method} ${path} failed: ${json?.error?.description ?? response.status}`)
  }
  return json
}

export type RazorpayPayment = {
  id: string
  order_id: string | null
  amount: number
  currency: string
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
  email?: string
  contact?: string
  method?: string
}

export async function createRazorpayOrder(input: { amountMinor: number; currency: string; receipt: string; notes: Record<string, string> }) {
  return call<{ id: string; amount: number; currency: string; status: string }>('POST', '/orders', {
    amount: input.amountMinor,
    currency: input.currency,
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  })
}

export function fetchRazorpayPayment(paymentId: string) {
  return call<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`)
}

export function captureRazorpayPayment(paymentId: string, amountMinor: number, currency: string) {
  return call<RazorpayPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountMinor, currency })
}

/** The signature Checkout hands back: HMAC of "order_id|payment_id" with the key secret. */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string) {
  const keys = razorpayKeys()
  if (!keys || !signature) return false
  return timingSafeEqual(hmacSha256(`${orderId}|${paymentId}`, keys.keySecret), signature)
}

/** Webhooks are signed over the raw body with the webhook secret set in the Razorpay dashboard. */
export function webhookSignatureValid(rawBody: string, signature: string | null) {
  const secret = env().RAZORPAY_WEBHOOK_SECRET
  if (!secret || !signature) return false
  return timingSafeEqual(hmacSha256(rawBody, secret), signature)
}

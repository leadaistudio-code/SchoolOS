import { prisma } from '@/server/db/prisma'
import { env } from '@/lib/env'
import { decryptSecret, hmacSha256, timingSafeEqual } from '@/server/crypto'
import { NAMESPACE, type IntegrationKind } from '@/server/modules/settings/integrations'

/**
 * School fee Razorpay helpers.
 *
 * Keys are each school's own (Settings → Integrations). Platform Academy
 * Razorpay stays in lms/razorpay.ts — fee money must not mix with Academy money.
 */

const API = 'https://api.razorpay.com/v1'

type StoredCredential = {
  enabled: boolean
  accountId: string | null
  senderId: string | null
  apiKeyEncrypted: string | null
  apiSecretEncrypted: string | null
  webhookSecretEncrypted?: string | null
  updatedAt: string
}

export type FeeRazorpayKeys = {
  keyId: string
  keySecret: string
  webhookSecret: string | null
  merchantId: string | null
  source: 'tenant' | 'env'
}

/** Resolve Key ID / secret for a school: tenant credentials first, then env fallback. */
export async function feeRazorpayKeys(tenantId: string): Promise<FeeRazorpayKeys | null> {
  const row = await prisma.setting.findFirst({
    where: { tenantId, namespace: NAMESPACE, key: 'payment' satisfies IntegrationKind },
  })
  const stored = (row?.value as unknown as StoredCredential | undefined) ?? null
  if (stored?.enabled && stored.apiKeyEncrypted && stored.apiSecretEncrypted) {
    return {
      keyId: decryptSecret(stored.apiKeyEncrypted),
      keySecret: decryptSecret(stored.apiSecretEncrypted),
      webhookSecret: stored.webhookSecretEncrypted ? decryptSecret(stored.webhookSecretEncrypted) : null,
      merchantId: stored.accountId,
      source: 'tenant',
    }
  }

  const e = env()
  if (e.PAYMENT_DRIVER === 'razorpay' && e.PAYMENT_KEY_ID && e.PAYMENT_KEY_SECRET) {
    return {
      keyId: e.PAYMENT_KEY_ID,
      keySecret: e.PAYMENT_KEY_SECRET,
      webhookSecret: e.PAYMENT_WEBHOOK_SECRET ?? null,
      merchantId: null,
      source: 'env',
    }
  }
  return null
}

export async function feePaymentsLive(tenantId: string) {
  return !!(await feeRazorpayKeys(tenantId))
}

async function call<T>(
  keys: FeeRazorpayKeys,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
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

export type FeeRazorpayPayment = {
  id: string
  order_id: string | null
  amount: number
  currency: string
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
  error_description?: string
}

export async function createFeeRazorpayOrder(
  keys: FeeRazorpayKeys,
  input: { amountMinor: number; currency: string; receipt: string; notes: Record<string, string> },
) {
  return call<{ id: string; amount: number; currency: string; status: string }>(keys, 'POST', '/orders', {
    amount: input.amountMinor,
    currency: input.currency,
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  })
}

export function fetchFeeRazorpayPayment(keys: FeeRazorpayKeys, paymentId: string) {
  return call<FeeRazorpayPayment>(keys, 'GET', `/payments/${encodeURIComponent(paymentId)}`)
}

export function captureFeeRazorpayPayment(
  keys: FeeRazorpayKeys,
  paymentId: string,
  amountMinor: number,
  currency: string,
) {
  return call<FeeRazorpayPayment>(keys, 'POST', `/payments/${encodeURIComponent(paymentId)}/capture`, {
    amount: amountMinor,
    currency,
  })
}

export function feeCheckoutSignatureValid(
  keys: FeeRazorpayKeys,
  orderId: string,
  paymentId: string,
  signature: string,
) {
  if (!signature) return false
  return timingSafeEqual(hmacSha256(`${orderId}|${paymentId}`, keys.keySecret), signature)
}

export function feeWebhookSignatureValid(keys: FeeRazorpayKeys, rawBody: string, signature: string | null) {
  if (!keys.webhookSecret || !signature) return false
  return timingSafeEqual(hmacSha256(rawBody, keys.webhookSecret), signature)
}

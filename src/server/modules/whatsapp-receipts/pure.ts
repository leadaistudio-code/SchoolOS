import crypto from 'node:crypto'
import { z } from 'zod'

/**
 * WhatsApp fee receipts: the parts with no database, network or environment,
 * so every rule here can be tested directly.
 */

export const LINK_TTL_DAYS = 7
export const MAX_ATTEMPTS = 5
/** Receipts older than this are not picked up by the sweeper. */
export const SWEEP_WINDOW_HOURS = 48

export function receiptEventKey(receiptId: string) {
  return `fee_receipt:${receiptId}`
}

/* ------------------------------------------------------------------ phone */

/**
 * Digits with country code, as both Meta and AiSensy expect: 919876543210.
 * A bare 10-digit number is taken as Indian; anything that cannot be a full
 * international number is rejected rather than guessed.
 */
export function toWhatsAppNumber(raw: string | null | undefined, defaultCountry = '91'): string | null {
  let digits = (raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) return `${defaultCountry}${digits}`
  if (digits.length >= 11 && digits.length <= 15 && !digits.startsWith('0')) return digits
  return null
}

export function maskNumber(digits: string | null | undefined): string {
  if (!digits) return '—'
  return `+${digits.slice(0, digits.length - 10)} ******${digits.slice(-4)}`
}

/* --------------------------------------------------------------- template */

export type ReceiptFacts = {
  studentName: string
  amountMinor: number
  currency: string
  receiptNumber: string
  paidOn: Date
}

/** Meta rejects template parameters containing newlines, tabs or long runs of spaces. */
export function cleanParam(value: string, max = 60): string {
  const flat = value.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export function formatReceiptAmount(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}

export function formatReceiptDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

/** Body parameters {{1}}–{{4}}: student, amount, receipt number, payment date. */
export function receiptParams(f: ReceiptFacts): string[] {
  return [
    cleanParam(f.studentName),
    cleanParam(formatReceiptAmount(f.amountMinor, f.currency)),
    cleanParam(f.receiptNumber),
    cleanParam(formatReceiptDate(f.paidOn)),
  ]
}

export const TEMPLATE_GUIDE = {
  category: 'UTILITY',
  body:
    'Dear Parent, we have received {{2}} towards the fees of {{1}}. Receipt number {{3}}, paid on {{4}}. ' +
    'Tap the button below to view or download the receipt. The link works for 7 days.',
  example: ['Aarav Sharma', '₹12,300', 'RCT/2026-27/00042', '14 Oct 2026'],
  buttonText: 'View receipt',
} as const

/* -------------------------------------------------------------- payloads */

export function metaTemplatePayload(input: {
  to: string
  templateName: string
  language: string
  params: string[]
  linkToken: string
}) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.to,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.language },
      components: [
        { type: 'body', parameters: input.params.map((text) => ({ type: 'text', text })) },
        // The approved button URL ends in {{1}}; only the suffix is sent.
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: input.linkToken }] },
      ],
    },
  }
}

/** AiSensy fills the campaign's template in order; the receipt link is the fifth parameter. */
export function aisensyPayload(input: {
  apiKey: string
  campaignName: string
  to: string
  userName: string
  params: string[]
  linkUrl: string
}) {
  return {
    apiKey: input.apiKey,
    campaignName: input.campaignName,
    destination: input.to,
    userName: cleanParam(input.userName),
    source: 'MyCampusView fee receipt',
    templateParams: [...input.params, input.linkUrl],
  }
}

/* -------------------------------------------------------------- failures */

export type SendFailure = { retryable: boolean; code: string; message: string }

/** Meta error codes worth another attempt: throttling, temporary outages. */
const META_RETRYABLE = new Set([1, 2, 4, 17, 341, 80007, 130429, 131000, 131016, 131048, 131056, 133004])

export function classifyMetaFailure(httpStatus: number, body: unknown): SendFailure {
  const err = (body as { error?: { code?: unknown; title?: unknown; message?: unknown } } | null)?.error
  const code = typeof err?.code === 'number' ? err.code : null
  const text = typeof err?.title === 'string' ? err.title : typeof err?.message === 'string' ? err.message : `HTTP ${httpStatus}`
  return {
    retryable: httpStatus >= 500 || httpStatus === 429 || (code !== null && META_RETRYABLE.has(code)),
    code: code !== null ? `meta_${code}` : `http_${httpStatus}`,
    message: cleanParam(`Meta ${code ?? httpStatus}: ${text}`, 200),
  }
}

export function classifyAiSensyFailure(httpStatus: number, body: unknown): SendFailure {
  const msg = (body as { message?: unknown; error?: unknown } | null)
  const text = typeof msg?.message === 'string' ? msg.message : typeof msg?.error === 'string' ? msg.error : `HTTP ${httpStatus}`
  return {
    retryable: httpStatus >= 500 || httpStatus === 429,
    code: `http_${httpStatus}`,
    message: cleanParam(`AiSensy ${httpStatus}: ${text}`, 200),
  }
}

export function networkFailure(error: unknown): SendFailure {
  const name = error instanceof Error ? error.name : 'Error'
  return { retryable: true, code: 'network', message: name === 'TimeoutError' ? 'Provider timed out' : 'Could not reach the provider' }
}

/* --------------------------------------------------------------- statuses */

export type DeliveryState = 'sent' | 'delivered' | 'read' | 'failed'
export type StatusUpdate = { messageId: string; status: DeliveryState; at: Date; errorCode?: string }
export type InboundReply = { from: string; text: string }

const RANK: Record<string, number> = { QUEUED: 0, SENDING: 1, FAILED: 1, DEAD: 1, SENT: 2, DELIVERED: 3, READ: 4 }

/**
 * Providers deliver status callbacks out of order and more than once. A status
 * only moves forward (sent → delivered → read); a late "sent" never undoes
 * "read". A delivery failure is recorded unless the message was already read.
 */
export function nextOutboxStatus(current: string, incoming: DeliveryState): 'SENT' | 'DELIVERED' | 'READ' | 'DEAD' | null {
  if (current === 'SKIPPED' || current === 'QUEUED') return null
  if (incoming === 'failed') return current === 'READ' || current === 'DEAD' ? null : 'DEAD'
  const target = incoming === 'sent' ? 'SENT' : incoming === 'delivered' ? 'DELIVERED' : 'READ'
  return (RANK[target] ?? 0) > (RANK[current] ?? 0) ? target : null
}

const STOP_WORDS = new Set(['stop', 'unsubscribe', 'stop receipts', 'opt out', 'optout'])
const START_WORDS = new Set(['start', 'subscribe', 'opt in', 'optin', 'start receipts'])

export function consentIntent(text: string): 'opt_out' | 'opt_in' | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (STOP_WORDS.has(t)) return 'opt_out'
  if (START_WORDS.has(t)) return 'opt_in'
  return null
}

const metaStatus = z.object({
  id: z.string().min(1).max(200),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.union([z.string(), z.number()]),
  errors: z.array(z.object({ code: z.number().optional() }).passthrough()).optional(),
}).passthrough()

const metaMessage = z.object({
  from: z.string().min(6).max(20),
  type: z.string(),
  text: z.object({ body: z.string().max(4096) }).optional(),
}).passthrough()

const metaValue = z.object({
  metadata: z.object({ phone_number_id: z.string() }).passthrough().optional(),
  statuses: z.array(z.unknown()).optional(),
  messages: z.array(z.unknown()).optional(),
}).passthrough()

const metaEnvelope = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({
    changes: z.array(z.object({ field: z.string(), value: metaValue }).passthrough()),
  }).passthrough()).max(100),
}).passthrough()

function toDate(ts: string | number | undefined): Date {
  const n = typeof ts === 'number' ? ts : Number(ts)
  if (!Number.isFinite(n) || n <= 0) return new Date()
  return new Date(n < 1e12 ? n * 1000 : n)
}

function readValue(value: z.infer<typeof metaValue>, out: { statuses: StatusUpdate[]; replies: InboundReply[] }) {
  for (const raw of value.statuses ?? []) {
    const s = metaStatus.safeParse(raw)
    if (!s.success) continue
    const code = s.data.errors?.[0]?.code
    out.statuses.push({
      messageId: s.data.id,
      status: s.data.status,
      at: toDate(s.data.timestamp),
      ...(code !== undefined ? { errorCode: `meta_${code}` } : {}),
    })
  }
  for (const raw of value.messages ?? []) {
    const m = metaMessage.safeParse(raw)
    if (!m.success || m.data.type !== 'text' || !m.data.text) continue
    const from = toWhatsAppNumber(m.data.from)
    if (from) out.replies.push({ from, text: m.data.text.body })
  }
}

/**
 * Meta's webhook envelope. Only changes for the school's own phone number id
 * are read, so a shared app cannot move another number's messages.
 * Returns null when the body is not a WhatsApp Business webhook at all.
 */
export function parseMetaWebhook(body: unknown, phoneNumberId: string | null): { statuses: StatusUpdate[]; replies: InboundReply[] } | null {
  const env = metaEnvelope.safeParse(body)
  if (!env.success) return null
  const out = { statuses: [] as StatusUpdate[], replies: [] as InboundReply[] }
  for (const entry of env.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue
      const id = change.value.metadata?.phone_number_id
      if (phoneNumberId && id && id !== phoneNumberId) continue
      readValue(change.value, out)
    }
  }
  return out
}

const flatStatus = z.object({
  messageId: z.string().min(1).max(200),
  status: z.string(),
  timestamp: z.union([z.string(), z.number()]).optional(),
}).passthrough()

/**
 * AiSensy does not publish its callback format. Two shapes are read: Meta's
 * `statuses[]` (as forwarded under `data.value` or `value`) and a flat
 * `{ messageId, status }`. Anything else returns null and changes nothing.
 */
export function parseAiSensyWebhook(body: unknown): { statuses: StatusUpdate[]; replies: InboundReply[] } | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const data = (b.data && typeof b.data === 'object' ? b.data : null) as Record<string, unknown> | null
  const candidate = (data?.value ?? b.value) as unknown
  const value = metaValue.safeParse(candidate)
  if (value.success && (value.data.statuses || value.data.messages)) {
    const out = { statuses: [] as StatusUpdate[], replies: [] as InboundReply[] }
    readValue(value.data, out)
    return out
  }
  const flat = flatStatus.safeParse(data ?? b)
  if (flat.success) {
    const status = flat.data.status.toLowerCase()
    if (status === 'sent' || status === 'delivered' || status === 'read' || status === 'failed') {
      return { statuses: [{ messageId: flat.data.messageId, status, at: toDate(flat.data.timestamp) }], replies: [] }
    }
  }
  return null
}

/* ----------------------------------------------------------- signed link */

/**
 * Receipt link token: `<receiptId>.<expiry seconds>.<signature>`. The
 * signature covers the school, the receipt and the expiry, so a token cannot
 * be moved to another school, another receipt or a later date.
 */
export function signReceiptToken(input: { tenantId: string; receiptId: string; expiresAt: Date }, secret: string): string {
  const exp = Math.floor(input.expiresAt.getTime() / 1000)
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`receipt-link:v1:${input.tenantId}:${input.receiptId}:${exp}`)
    .digest('base64url')
    .slice(0, 32)
  return `${input.receiptId}.${exp.toString(36)}.${sig}`
}

export type TokenCheck =
  | { ok: true; receiptId: string; expiresAt: Date }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }

export function verifyReceiptToken(token: string, tenantId: string, secret: string, now = new Date()): TokenCheck {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const [receiptId, expB36, sig] = parts as [string, string, string]
  if (!/^[a-z0-9]{8,40}$/i.test(receiptId) || !/^[0-9a-z]{1,10}$/.test(expB36) || !/^[\w-]{32}$/.test(sig)) {
    return { ok: false, reason: 'malformed' }
  }
  const exp = parseInt(expB36, 36)
  const expected = signReceiptToken({ tenantId, receiptId, expiresAt: new Date(exp * 1000) }, secret).split('.')[2]!
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' }
  if (exp * 1000 <= now.getTime()) return { ok: false, reason: 'expired' }
  return { ok: true, receiptId, expiresAt: new Date(exp * 1000) }
}

/** A purpose-bound key, so the receipt-link key is never the raw app secret. */
export function receiptLinkKey(appSecret: string): string {
  return crypto.createHmac('sha256', appSecret).update('mycampusview:receipt-links').digest('hex')
}

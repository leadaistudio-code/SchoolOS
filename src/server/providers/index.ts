import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '@/lib/env'
import { hmacSha256, randomToken, timingSafeEqual } from '@/server/crypto'
import type {
  AiProvider,
  EmailProvider,
  MapsProvider,
  PaymentProvider,
  SmsProvider,
  StorageProvider,
  WhatsAppProvider,
} from './types'

/* ------------------------------------------------------------------ email */

const logEmail: EmailProvider = {
  name: 'log',
  async send(message) {
    console.info('[email:log]', {
      to: message.to,
      subject: message.subject,
      preview: message.text?.slice(0, 160) ?? message.html.slice(0, 160),
    })
    return { ok: true, providerMessageId: `log_${randomToken(8)}` }
  },
}

/**
 * The platform mailbox, used when a school has not connected its own.
 *
 * Deliberately generic SMTP rather than one vendor's API: every transactional
 * provider (Resend, Brevo, ZeptoMail, Mailgun, SES) exposes an SMTP endpoint,
 * so switching between them is a change to SMTP_URL and nothing else. The
 * connection is pooled and reused - password resets arrive in bursts at the
 * start of term, and a fresh TLS handshake per message would be the slow part.
 */
let smtpTransport: Transporter | null = null

/**
 * Turns `smtp://user:pass@host:587` into transport options.
 *
 * Built by hand rather than handed to nodemailer as a URL so the pool and the
 * timeouts can be set alongside it. Credentials are percent-decoded: SMTP
 * passwords routinely contain `@`, `/` and `+`, which have to be escaped in a
 * URL and would otherwise authenticate with the literal escape sequence.
 */
export function smtpOptionsFrom(url: string) {
  const parsed = new URL(url)
  const secure = parsed.protocol === 'smtps:'

  return {
    host: parsed.hostname,
    // Implicit TLS on 465, STARTTLS on 587 — the near-universal convention.
    port: parsed.port ? Number(parsed.port) : secure ? 465 : 587,
    secure,
    auth: parsed.username
      ? {
          user: decodeURIComponent(parsed.username),
          pass: decodeURIComponent(parsed.password),
        }
      : undefined,
    pool: true,
    maxConnections: 3,
    // A mail server is not worth waiting on forever; a hung send would hold a
    // password-reset request open until the request itself timed out.
    connectionTimeout: 12_000,
    greetingTimeout: 8_000,
    socketTimeout: 20_000,
  }
}

function platformSmtp(url: string): EmailProvider {
  const options = smtpOptionsFrom(url)
  smtpTransport ??= nodemailer.createTransport(options)
  const host = options.host

  return {
    // Callers test this name to decide whether mail can actually be delivered,
    // so it must never read as "log" once a real server is configured.
    name: `smtp:${host}`,
    async send(message) {
      try {
        const info = await smtpTransport!.sendMail({
          from: env().EMAIL_FROM,
          to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
          replyTo: message.replyTo,
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: message.attachments?.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
        })
        return { ok: true, providerMessageId: info.messageId }
      } catch (error) {
        const description = error instanceof Error ? error.message : String(error)
        console.error('[email:smtp] send failed', description)
        return { ok: false, error: description }
      }
    },
  }
}

export function emailProvider(): EmailProvider {
  const driver = env().EMAIL_DRIVER

  if (driver === 'log') return logEmail

  // `ses` and `resend` both speak SMTP; point SMTP_URL at their endpoint and
  // this driver serves them too. A dedicated API client would buy richer
  // delivery reporting and nothing else that matters here.
  const url = env().SMTP_URL
  if (!url) {
    warnMissingSmtp(driver)
    return logEmail
  }

  try {
    return platformSmtp(url)
  } catch (error) {
    // A malformed SMTP_URL must degrade to the log driver rather than throw:
    // the caller is usually a sign-in or a fee collection, and neither should
    // fail because the mail configuration is wrong.
    console.error('[email] SMTP_URL could not be parsed; using the log driver', error)
    return logEmail
  }
}

let warnedMissingSmtp = false
function warnMissingSmtp(driver: string) {
  if (warnedMissingSmtp) return
  warnedMissingSmtp = true
  console.warn(
    `[email] EMAIL_DRIVER="${driver}" but SMTP_URL is not set; falling back to the log driver. ` +
      'Password reset links will not be delivered until it is configured.',
  )
}

/* -------------------------------------------------------------------- sms */

const logSms: SmsProvider = {
  name: 'log',
  async send(message) {
    console.info('[sms:log]', { to: message.to, body: message.body.slice(0, 160) })
    return { ok: true, providerMessageId: `log_${randomToken(8)}` }
  },
}

export function smsProvider(): SmsProvider {
  return logSms
}

const logWhatsApp: WhatsAppProvider = {
  name: 'log',
  async send(message) {
    console.info('[whatsapp:log]', { to: message.to, body: message.body.slice(0, 160) })
    return { ok: true, providerMessageId: `log_${randomToken(8)}` }
  },
}

/**
 * WhatsApp via Meta's Cloud API.
 *
 * Business-initiated messages must use a template that Meta has approved in
 * advance, and one-time codes must sit in the Authentication category - a
 * free-form message would simply be rejected, since a password reset never has
 * the 24-hour customer window that free-form replies require.
 *
 * `variables` are positional: the key is the `{{n}}` slot in the template body.
 */
function metaCloudWhatsApp(phoneNumberId: string, accessToken: string): WhatsAppProvider {
  const version = env().WHATSAPP_API_VERSION
  const endpoint = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`

  return {
    name: 'meta_cloud',
    async send(message) {
      // Meta wants digits only - country code included, no plus, no spaces.
      const to = message.to.replace(/[^\d]/g, '')
      if (!to) return { ok: false, error: 'No recipient number' }

      const ordered = Object.entries(message.variables ?? {})
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, value]) => ({ type: 'text' as const, text: value }))

      const body = message.templateName
        ? {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: message.templateName,
              language: { code: env().WHATSAPP_OTP_TEMPLATE_LANG },
              components: [
                ...(ordered.length > 0
                  ? [{ type: 'body', parameters: ordered }]
                  : []),
                // An authentication template's copy-code button repeats the
                // code as its own parameter; omitting it when the template has
                // one makes Meta reject the whole send.
                ...(env().WHATSAPP_OTP_COPY_BUTTON && ordered.length > 0
                  ? [
                      {
                        type: 'button',
                        sub_type: 'url',
                        index: '0',
                        parameters: [ordered[0]],
                      },
                    ]
                  : []),
              ],
            },
          }
        : {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: message.body },
          }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12_000),
        })

        const json = (await response.json().catch(() => null)) as {
          messages?: { id: string }[]
          error?: { message?: string; code?: number; error_data?: { details?: string } }
        } | null

        if (!response.ok) {
          // Meta nests the useful part; the outer message is usually generic.
          const detail =
            json?.error?.error_data?.details ??
            json?.error?.message ??
            `HTTP ${response.status}`
          return { ok: false, error: detail }
        }

        return { ok: true, providerMessageId: json?.messages?.[0]?.id }
      } catch (error) {
        const description = error instanceof Error ? error.message : String(error)
        return { ok: false, error: description }
      }
    },
  }
}

/**
 * Builds Gupshup's form body.
 *
 * Separated so the wire format can be asserted in a test: Gupshup takes
 * `application/x-www-form-urlencoded` with a JSON string nested in one of the
 * fields, which is easy to get subtly wrong and produces an opaque rejection
 * when you do.
 *
 * `templateId` is Gupshup's own template identifier from their Templates tab,
 * not Meta's template name — the same field carries a different kind of value
 * depending on which driver is in play.
 */
export function gupshupPayload(input: {
  appName: string
  source: string
  to: string
  templateId?: string
  variables?: Record<string, string>
  text: string
}): URLSearchParams {
  const body = new URLSearchParams({
    channel: 'whatsapp',
    source: input.source.replace(/[^\d]/g, ''),
    destination: input.to.replace(/[^\d]/g, ''),
    'src.name': input.appName,
  })

  if (input.templateId) {
    // Positional, ordered by the {{n}} slot they fill.
    const params = Object.entries(input.variables ?? {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, value]) => value)

    body.set('template', JSON.stringify({ id: input.templateId, params }))
  } else {
    // Only valid inside a 24-hour customer window, which a reset never has.
    body.set('message', JSON.stringify({ type: 'text', text: input.text }))
  }

  return body
}

function gupshupWhatsApp(apiKey: string, appName: string, source: string): WhatsAppProvider {
  const endpoint = env().GUPSHUP_API_URL

  return {
    name: 'gupshup',
    async send(message) {
      const to = message.to.replace(/[^\d]/g, '')
      if (!to) return { ok: false, error: 'No recipient number' }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            apikey: apiKey,
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
          },
          body: gupshupPayload({
            appName,
            source,
            to,
            templateId: message.templateName,
            variables: message.variables,
            text: message.body,
          }).toString(),
          signal: AbortSignal.timeout(12_000),
        })

        const raw = await response.text()
        const json = safeJson(raw) as {
          status?: string
          messageId?: string
          message?: string
        } | null

        // Gupshup answers 202 with status "submitted" on success, and puts the
        // real reason in `message` on failure. A 200 is not on its own proof.
        if (!response.ok || (json?.status && json.status !== 'submitted')) {
          return {
            ok: false,
            error: json?.message ?? raw.slice(0, 300) ?? `HTTP ${response.status}`,
          }
        }

        return { ok: true, providerMessageId: json?.messageId }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

export function whatsappProvider(): WhatsAppProvider {
  const driver = env().WHATSAPP_DRIVER

  if (driver === 'meta_cloud') {
    const phoneNumberId = env().WHATSAPP_PHONE_NUMBER_ID
    const accessToken = env().WHATSAPP_ACCESS_TOKEN
    if (!phoneNumberId || !accessToken) {
      warnMissingWhatsApp('WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN')
      return logWhatsApp
    }
    return metaCloudWhatsApp(phoneNumberId, accessToken)
  }

  if (driver === 'gupshup') {
    const apiKey = env().GUPSHUP_API_KEY
    const appName = env().GUPSHUP_APP_NAME
    const source = env().GUPSHUP_SOURCE_NUMBER
    if (!apiKey || !appName || !source) {
      warnMissingWhatsApp('GUPSHUP_API_KEY, GUPSHUP_APP_NAME and GUPSHUP_SOURCE_NUMBER')
      return logWhatsApp
    }
    return gupshupWhatsApp(apiKey, appName, source)
  }

  return logWhatsApp
}

let warnedMissingWhatsApp = false
function warnMissingWhatsApp(required: string) {
  if (warnedMissingWhatsApp) return
  warnedMissingWhatsApp = true
  console.warn(
    `[whatsapp] WHATSAPP_DRIVER="${env().WHATSAPP_DRIVER}" needs ${required}; ` +
      'falling back to the log driver. Reset codes will not be delivered until ' +
      'they are set.',
  )
}

/* ---------------------------------------------------------------- payments */

/**
 * Mock gateway used in development and tests. It behaves like a real one in
 * the ways that matter: an order is created server-side, the webhook body is
 * HMAC-signed, and an unsigned or mis-signed callback is rejected.
 */
const mockPayment: PaymentProvider = {
  name: 'mock',
  async createOrder(input) {
    const providerOrderId = `mock_order_${randomToken(10)}`
    return {
      providerOrderId,
      checkoutUrl: `/checkout/mock/${providerOrderId}?ref=${encodeURIComponent(input.reference)}`,
      raw: { input },
    }
  },
  async verifyWebhook(rawBody, signature) {
    // A blank secret must never be usable as a signing key.
    const configured = env().PAYMENT_WEBHOOK_SECRET
    const secret = configured && configured.length > 0 ? configured : env().AUTH_SECRET
    const expected = hmacSha256(rawBody, secret)
    const verified = !!signature && timingSafeEqual(expected, signature)
    const body = safeJson(rawBody)
    return {
      verified,
      providerPaymentId: body?.paymentId,
      amountMinor: body?.amountMinor,
      status: body?.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      raw: body,
    }
  },
  async fetchPayment(providerPaymentId) {
    return {
      verified: true,
      providerPaymentId,
      status: 'SUCCESS',
      raw: { providerPaymentId, source: 'mock.fetch' },
    }
  },
  async refund(providerPaymentId, amountMinor) {
    console.info('[payment:mock] refund', { providerPaymentId, amountMinor })
    return { ok: true, providerMessageId: `mock_refund_${randomToken(8)}` }
  },
}

function safeJson(raw: string): any {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function paymentProvider(): PaymentProvider {
  switch (env().PAYMENT_DRIVER) {
    case 'mock':
      return mockPayment
    default:
      console.warn(
        `[payment] driver "${env().PAYMENT_DRIVER}" not configured, using mock driver`,
      )
      return mockPayment
  }
}

/* ----------------------------------------------------------------- storage */

function fileProxyUrl(key: string) {
  return `/api/v1/files/${encodeURIComponent(key)}`
}

function localStorageProvider(): StorageProvider {
  const root = path.resolve(env().STORAGE_LOCAL_DIR)
  const full = (key: string) => path.join(root, key.replace(/\.\./g, ''))

  return {
    name: 'local',
    async put(key, body, mimeType) {
      const target = full(key)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, body)
      return { key, url: fileProxyUrl(key), sizeBytes: body.length, mimeType }
    },
    async get(key) {
      return fs.readFile(full(key))
    },
    async delete(key) {
      await fs.rm(full(key), { force: true })
    },
    async signedUrl(key) {
      // The local driver serves through the permission-checked file route
      // rather than handing out a bucket URL.
      return fileProxyUrl(key)
    },
  }
}

function requireS3Config() {
  const cfg = env()
  const missing = (
    [
      ['S3_ENDPOINT', cfg.S3_ENDPOINT],
      ['S3_BUCKET', cfg.S3_BUCKET],
      ['S3_ACCESS_KEY_ID', cfg.S3_ACCESS_KEY_ID],
      ['S3_SECRET_ACCESS_KEY', cfg.S3_SECRET_ACCESS_KEY],
    ] as const
  ).filter(([, value]) => !value)

  if (missing.length) {
    throw new Error(
      `STORAGE_DRIVER=s3 requires ${missing.map(([name]) => name).join(', ')}`,
    )
  }

  return {
    endpoint: cfg.S3_ENDPOINT!,
    region: cfg.S3_REGION || 'auto',
    bucket: cfg.S3_BUCKET!,
    accessKeyId: cfg.S3_ACCESS_KEY_ID!,
    secretAccessKey: cfg.S3_SECRET_ACCESS_KEY!,
    forcePathStyle: cfg.S3_FORCE_PATH_STYLE ?? false,
  }
}

function s3StorageProvider(): StorageProvider {
  const cfg = requireS3Config()
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })

  return {
    name: 's3',
    async put(key, body, mimeType) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: body,
          ContentType: mimeType,
        }),
      )
      // Keep serving through the RBAC-checked app proxy (Railway buckets are private).
      return { key, url: fileProxyUrl(key), sizeBytes: body.length, mimeType }
    },
    async get(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
      )
      const bytes = await result.Body?.transformToByteArray()
      if (!bytes) throw new Error(`S3 object missing body: ${key}`)
      return Buffer.from(bytes)
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
    },
    async signedUrl(key, expiresInSeconds) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      )
    },
  }
}

export function storageProvider(): StorageProvider {
  switch (env().STORAGE_DRIVER) {
    case 's3':
      return s3StorageProvider()
    case 'local':
    default:
      return localStorageProvider()
  }
}

/* -------------------------------------------------------------- maps + ai */

export function mapsProvider(): MapsProvider {
  return {
    name: 'none',
    async reverseGeocode() {
      return null
    },
    async estimateArrival() {
      return null
    },
  }
}

export function aiProvider(): AiProvider {
  return {
    name: 'none',
    async complete() {
      throw new Error('No AI provider configured. Set AI_DRIVER and AI_API_KEY.')
    },
  }
}

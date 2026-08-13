import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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

export function emailProvider(): EmailProvider {
  switch (env().EMAIL_DRIVER) {
    case 'log':
      return logEmail
    default:
      // Real drivers are added here; until one is configured the log driver
      // keeps the notification pipeline exercised end to end in development.
      console.warn(`[email] driver "${env().EMAIL_DRIVER}" not configured, using log driver`)
      return logEmail
  }
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

export function whatsappProvider(): WhatsAppProvider {
  return logWhatsApp
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

import crypto from 'node:crypto'
import { env } from '@/lib/env'

/** URL-safe random token, used for session cookies and one-time links. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

/**
 * Deterministic hash for values we must look up but never store in the clear
 * (session tokens, reset tokens). SHA-256 is right here: the input already has
 * full entropy, so a slow KDF would buy nothing.
 */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function key(): Buffer {
  return crypto.createHash('sha256').update(env().AUTH_SECRET).digest()
}

/**
 * AES-256-GCM for tenant-held third-party secrets (payment keys, SMTP
 * passwords). They must be readable by the server to call the provider, so
 * hashing is not an option; encryption at rest with an env-held key is.
 */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload')
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(ivB64, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

/** HMAC used to verify inbound webhook signatures. */
export function hmacSha256(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

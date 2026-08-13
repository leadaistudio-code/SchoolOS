import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Generate a new base32 TOTP secret (20 bytes → 32 chars). */
export function generateTotpSecret(): string {
  const bytes = randomBytes(20)
  let bits = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  let out = ''
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5), 2)]
  }
  return out
}

function base32Decode(secret: string): Buffer {
  const cleaned = secret.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const c of cleaned) {
    const idx = BASE32.indexOf(c)
    if (idx < 0) continue
    bits += idx.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }
  return Buffer.from(bytes)
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', secret).update(buf).digest()
  const offset = digest[digest.length - 1]! & 0xf
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)
  return String(code % 1_000_000).padStart(6, '0')
}

/** Current TOTP code for tests / display. */
export function totpCode(secret: string, atMs = Date.now(), stepSeconds = 30): string {
  const counter = Math.floor(atMs / 1000 / stepSeconds)
  return hotp(base32Decode(secret), counter)
}

/** Verify a 6-digit code with ±1 step window. */
export function verifyTotp(secret: string, token: string, atMs = Date.now(), stepSeconds = 30): boolean {
  const cleaned = String(token).replace(/\s+/g, '')
  if (!/^\d{6}$/.test(cleaned)) return false
  const counter = Math.floor(atMs / 1000 / stepSeconds)
  const expected = Buffer.from(cleaned)
  for (const delta of [-1, 0, 1]) {
    const candidate = Buffer.from(hotp(base32Decode(secret), counter + delta))
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true
  }
  return false
}

export function totpOtpauthUrl(input: {
  secret: string
  accountName: string
  issuer: string
}): string {
  const label = encodeURIComponent(`${input.issuer}:${input.accountName}`)
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

import crypto from 'node:crypto'

/**
 * Viewing tokens for the CCTV relay (MediaMTX with `authMethod: jwt`).
 *
 * The relay downloads our public key once from /api/v1/cctv/jwks and checks
 * every playlist and segment request itself, so live video never waits on a
 * round trip to MyCampusView. The ES256 key pair is derived from AUTH_SECRET,
 * which keeps it stable across deploys without another secret to manage.
 */

export const CCTV_ISSUER = 'mycampusview'
export const CCTV_CLAIM_KEY = 'mediamtx_permissions'

export type CctvJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string; kid: string; alg: 'ES256'; use: 'sig' }

type KeyPair = { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject; jwk: CctvJwk }

const b64u = (buf: Buffer) => buf.toString('base64url')

const cache = new Map<string, KeyPair>()

export function cctvKeyPair(secret: string): KeyPair {
  const hit = cache.get(secret)
  if (hit) return hit
  for (let i = 0; i < 8; i++) {
    const d = crypto.createHmac('sha256', secret).update(`mycampusview:cctv-jwt:v1:${i}`).digest()
    let pub: Buffer
    try {
      const ecdh = crypto.createECDH('prime256v1')
      ecdh.setPrivateKey(d)
      pub = ecdh.getPublicKey()
    } catch {
      continue
    }
    const x = b64u(pub.subarray(1, 33))
    const y = b64u(pub.subarray(33, 65))
    const privateKey = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: b64u(d), x, y }, format: 'jwk' })
    const publicKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x, y }, format: 'jwk' })
    const kid = crypto.createHash('sha256').update(`${x}.${y}`).digest('base64url').slice(0, 16)
    const pair: KeyPair = { privateKey, publicKey, jwk: { kty: 'EC', crv: 'P-256', x, y, kid, alg: 'ES256', use: 'sig' } }
    cache.set(secret, pair)
    return pair
  }
  throw new Error('Could not derive the CCTV signing key')
}

/** One audience per school, so a token for one school's relay is useless at another's. */
export function cctvAudience(tenantId: string) {
  return `mcv-cctv-${tenantId}`
}

export function cameraPath(cameraId: string, hd = false) {
  return `cam-${cameraId}${hd ? '-hd' : ''}`
}

export type CctvTokenInput = {
  tenantId: string
  userId: string
  paths: string[]
  expiresAt: Date
  now?: Date
}

export function signCctvToken(secret: string, input: CctvTokenInput): string {
  const { privateKey, jwk } = cctvKeyPair(secret)
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000)
  const header = { alg: 'ES256', typ: 'JWT', kid: jwk.kid }
  const payload = {
    iss: CCTV_ISSUER,
    aud: cctvAudience(input.tenantId),
    sub: input.userId,
    iat,
    nbf: iat - 30,
    exp: Math.floor(input.expiresAt.getTime() / 1000),
    [CCTV_CLAIM_KEY]: input.paths.map((path) => ({ action: 'read', path })),
  }
  const data = `${b64u(Buffer.from(JSON.stringify(header)))}.${b64u(Buffer.from(JSON.stringify(payload)))}`
  const sig = crypto.sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  return `${data}.${b64u(sig)}`
}

export type CctvTokenClaims = {
  aud: string
  sub: string
  exp: number
  paths: string[]
}

/** Mirrors what the relay checks. Used by tests and the settings self-check. */
export function verifyCctvToken(secret: string, token: string, now: Date = new Date()): CctvTokenClaims | null {
  const [h, p, s, extra] = token.split('.')
  if (!h || !p || !s || extra !== undefined) return null
  const { publicKey } = cctvKeyPair(secret)
  let ok = false
  try {
    ok = crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))
  } catch {
    return null
  }
  if (!ok) return null
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const exp = Number(payload.exp)
  if (!Number.isFinite(exp) || exp * 1000 <= now.getTime()) return null
  if (payload.iss !== CCTV_ISSUER) return null
  const perms = Array.isArray(payload[CCTV_CLAIM_KEY]) ? (payload[CCTV_CLAIM_KEY] as { action?: string; path?: string }[]) : []
  return {
    aud: String(payload.aud),
    sub: String(payload.sub),
    exp,
    paths: perms.filter((x) => x.action === 'read' && typeof x.path === 'string').map((x) => x.path as string),
  }
}

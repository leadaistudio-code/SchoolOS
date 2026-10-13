import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  RELAY_PASSWORD_PLACEHOLDER,
  buildRelayConfig,
  formatRelayKey,
  normaliseStreamBase,
  parentWindow,
  parseRelayKey,
  rtspUrl,
} from '@/lib/cctv'
import { CCTV_CLAIM_KEY, CCTV_ISSUER, cameraPath, cctvAudience, cctvKeyPair, signCctvToken, verifyCctvToken } from '@/server/cctv/token'

const SECRET = 'test-secret-that-is-long-enough-1234567890'

describe('CCTV viewing tokens', () => {
  const now = new Date('2026-10-05T04:00:00Z')
  const expiresAt = new Date(now.getTime() + 10 * 60_000)

  it('signs ES256 tokens the relay can check with the published key', () => {
    const token = signCctvToken(SECRET, { tenantId: 't1', userId: 'u1', paths: ['cam-a', 'cam-a-hd'], expiresAt, now })
    const [h, p, s] = token.split('.')
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toMatchObject({ alg: 'ES256', kid: cctvKeyPair(SECRET).jwk.kid })
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString())
    expect(payload).toMatchObject({ iss: CCTV_ISSUER, aud: cctvAudience('t1'), sub: 'u1' })
    expect(payload[CCTV_CLAIM_KEY]).toEqual([
      { action: 'read', path: 'cam-a' },
      { action: 'read', path: 'cam-a-hd' },
    ])
    // Independent check against the JWK alone, as MediaMTX would do it.
    const key = crypto.createPublicKey({ key: cctvKeyPair(SECRET).jwk, format: 'jwk' })
    expect(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'))).toBe(true)
    expect(verifyCctvToken(SECRET, token, now)?.paths).toEqual(['cam-a', 'cam-a-hd'])
  })

  it('derives the same key every time and a different key per secret', () => {
    expect(cctvKeyPair(SECRET).jwk).toEqual(cctvKeyPair(SECRET).jwk)
    expect(cctvKeyPair(`${SECRET}x`).jwk.x).not.toBe(cctvKeyPair(SECRET).jwk.x)
    expect(cctvKeyPair(SECRET).jwk).not.toHaveProperty('d')
  })

  it('rejects expired, tampered or foreign tokens', () => {
    const token = signCctvToken(SECRET, { tenantId: 't1', userId: 'u1', paths: ['cam-a'], expiresAt, now })
    expect(verifyCctvToken(SECRET, token, new Date(expiresAt.getTime() + 1000))).toBeNull()
    const [h, p, s] = token.split('.')
    const forged = Buffer.from(Buffer.from(p!, 'base64url').toString().replace('cam-a', 'cam-b')).toString('base64url')
    expect(verifyCctvToken(SECRET, `${h}.${forged}.${s}`, now)).toBeNull()
    expect(verifyCctvToken(`${SECRET}x`, token, now)).toBeNull()
    expect(verifyCctvToken(SECRET, 'not-a-token', now)).toBeNull()
  })

  it('names camera paths predictably', () => {
    expect(cameraPath('abc')).toBe('cam-abc')
    expect(cameraPath('abc', true)).toBe('cam-abc-hd')
  })
})

describe('relay settings file', () => {
  const nvr = { host: '192.168.1.108', port: 554, username: 'viewer', password: "p@ss:w'rd/1" }

  it('builds CP PLUS RTSP addresses with the password encoded', () => {
    expect(rtspUrl(nvr, 3)).toBe('rtsp://viewer:p%40ss%3Aw%27rd%2F1@192.168.1.108:554/cam/realmonitor?channel=3&subtype=1')
    expect(rtspUrl(nvr, 3, true)).toContain('subtype=0')
  })

  it('locks the relay to signed tokens and local HLS only', () => {
    const yaml = buildRelayConfig({
      schoolName: 'Demo School',
      jwksUrl: 'https://app.example.com/api/v1/cctv/jwks',
      audience: 'mcv-cctv-t1',
      issuer: CCTV_ISSUER,
      claimKey: CCTV_CLAIM_KEY,
      nvr,
      cameras: [{ path: 'cam-a', hdPath: 'cam-a-hd', name: 'Main gate', channel: 1 }],
      includeHd: false,
    })
    expect(yaml).toContain('authMethod: jwt')
    expect(yaml).toContain("authJWTJWKS: 'https://app.example.com/api/v1/cctv/jwks'")
    expect(yaml).toContain("authJWTAudience: 'mcv-cctv-t1'")
    expect(yaml).toContain('hlsAddress: 127.0.0.1:8888')
    for (const off of ['api', 'rtsp', 'rtmp', 'webrtc', 'srt', 'moq', 'playback']) expect(yaml).toContain(`\n${off}: false`)
    expect(yaml).toContain("  cam-a:\n    source: 'rtsp://viewer:p%40ss%3Aw%27rd%2F1@192.168.1.108:554/cam/realmonitor?channel=1&subtype=1'")
    expect(yaml).not.toContain('cam-a-hd')
    expect(yaml).not.toContain("w'rd")
  })

  it('adds HD paths only when asked', () => {
    const yaml = buildRelayConfig({
      schoolName: 'Demo',
      jwksUrl: 'https://x/jwks',
      audience: 'a',
      issuer: CCTV_ISSUER,
      claimKey: CCTV_CLAIM_KEY,
      nvr,
      cameras: [{ path: 'cam-a', hdPath: 'cam-a-hd', name: 'Gate', channel: 2 }],
      includeHd: true,
    })
    expect(yaml).toContain('  cam-a-hd:\n')
    expect(yaml).toContain('channel=2&subtype=0')
  })

  it('keeps the password placeholder intact for the relay app to fill in', () => {
    const yaml = buildRelayConfig({
      schoolName: 'Demo',
      jwksUrl: 'https://x/jwks',
      audience: 'a',
      issuer: CCTV_ISSUER,
      claimKey: CCTV_CLAIM_KEY,
      nvr: { ...nvr, password: RELAY_PASSWORD_PLACEHOLDER },
      cameras: [{ path: 'cam-a', hdPath: 'cam-a-hd', name: 'Gate', channel: 2 }],
      includeHd: false,
    })
    expect(yaml).toContain(`rtsp://viewer:${RELAY_PASSWORD_PLACEHOLDER}@192.168.1.108`)
  })
})

describe('relay app connection key', () => {
  it('round-trips the tenant and secret', () => {
    const secret = crypto.randomBytes(32).toString('base64url')
    const key = formatRelayKey('cmabc123xyz', secret)
    expect(parseRelayKey(key)).toEqual({ tenantId: 'cmabc123xyz', secret })
    expect(parseRelayKey(`  ${key}\n`)).toEqual({ tenantId: 'cmabc123xyz', secret })
  })

  it('rejects anything that is not a full key', () => {
    expect(parseRelayKey('')).toBeNull()
    expect(parseRelayKey('mcvr_cmabc123xyz_short')).toBeNull()
    expect(parseRelayKey(`other_cmabc123xyz_${'a'.repeat(43)}`)).toBeNull()
    expect(parseRelayKey(`mcvr_cm/../x_${'a'.repeat(43)}`)).toBeNull()
  })
})

describe('stream address', () => {
  it('accepts https and local http only', () => {
    expect(normaliseStreamBase('https://cctv.school.com/')).toBe('https://cctv.school.com')
    expect(normaliseStreamBase(' https://cctv.school.com/live/ ')).toBe('https://cctv.school.com/live')
    expect(normaliseStreamBase('http://localhost:8888')).toBe('http://localhost:8888')
    expect(normaliseStreamBase('http://cctv.school.com')).toBeNull()
    expect(normaliseStreamBase('https://user:pw@cctv.school.com')).toBeNull()
    expect(normaliseStreamBase('cctv.school.com')).toBeNull()
  })
})

describe('parent viewing window', () => {
  const site = { parentAccessEnabled: true, parentStart: '08:00', parentEnd: '14:00', parentDays: [1, 2, 3, 4, 5, 6] }

  it('is open during school hours and says when it closes', () => {
    // Monday 5 Oct 2026, 10:30 IST
    const w = parentWindow(site, new Date('2026-10-05T05:00:00Z'))
    expect(w.open).toBe(true)
    if (w.open) expect(w.closesAt.toISOString()).toBe('2026-10-05T08:30:00.000Z')
  })

  it('is closed outside hours, on off days, or when switched off', () => {
    expect(parentWindow(site, new Date('2026-10-05T09:00:00Z')).open).toBe(false) // 14:30 IST
    expect(parentWindow(site, new Date('2026-10-05T02:00:00Z')).open).toBe(false) // 07:30 IST
    expect(parentWindow(site, new Date('2026-10-04T05:00:00Z')).open).toBe(false) // Sunday
    expect(parentWindow({ ...site, parentAccessEnabled: false }, new Date('2026-10-05T05:00:00Z')).open).toBe(false)
  })
})

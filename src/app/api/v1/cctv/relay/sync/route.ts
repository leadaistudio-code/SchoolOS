import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ApiException } from '@/server/api/response'
import { rateLimit } from '@/server/rate-limit'
import { relaySync } from '@/server/modules/cctv/service'
import { parseRelayKey } from '@/lib/cctv'

export const dynamic = 'force-dynamic'

/**
 * The Windows relay app checks in here with its connection key and gets the
 * current camera list back. The recorder password is never sent either way.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  const key = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const parsed = parseRelayKey(key)
  const limited = await rateLimit(`cctv-relay:${parsed?.tenantId ?? 'invalid'}`, 30, 60)
  if (!limited.ok) throw new ApiException(429, 'RATE_LIMITED', 'Too many requests, please slow down')

  const body = (await req.json().catch(() => ({}))) as { appVersion?: unknown }
  const sync = await relaySync(key, { appVersion: typeof body.appVersion === 'string' ? body.appVersion : undefined })
  return NextResponse.json(sync, { headers: { 'Cache-Control': 'no-store' } })
})

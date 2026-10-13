import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { cctvKeyPair } from '@/server/cctv/token'

export const dynamic = 'force-dynamic'

/** Public key the school's CCTV relay uses to check viewing tokens. */
export async function GET() {
  const { jwk } = cctvKeyPair(env().AUTH_SECRET)
  return NextResponse.json(
    { keys: [jwk] },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  )
}

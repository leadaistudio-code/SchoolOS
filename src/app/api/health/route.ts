import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/server/db/prisma'
import { getRedis, redisConfigured } from '@/server/redis'
import { env } from '@/lib/env'
import { timingSafeEqual } from '@/server/crypto'

export const dynamic = 'force-dynamic'

function detailAuthorized(req: NextRequest): boolean {
  const secret = env().METRICS_SECRET ?? env().CRON_SECRET
  if (!secret) return false
  const provided =
    req.headers.get('x-metrics-secret') ??
    req.headers.get('x-health-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  return Boolean(provided) && timingSafeEqual(provided, secret)
}

/**
 * Liveness probe. Public callers only see a coarse status so the edge does not
 * advertise database/Redis topology. Authenticated scrapers get full checks.
 */
export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  let database: 'up' | 'down' = 'down'
  let dbLatencyMs: number | null = null
  let redis: 'up' | 'down' | 'skipped' = 'skipped'
  let redisLatencyMs: number | null = null

  try {
    await prisma.$queryRaw`SELECT 1`
    database = 'up'
    dbLatencyMs = Date.now() - startedAt
  } catch (err) {
    console.error('[health] database check failed', err)
  }

  if (redisConfigured() || env().RATE_LIMIT_DRIVER === 'redis') {
    const redisStarted = Date.now()
    try {
      const client = await getRedis()
      if (!client) {
        redis = 'down'
      } else {
        const pong = await client.ping()
        redis = pong === 'PONG' ? 'up' : 'down'
        redisLatencyMs = Date.now() - redisStarted
      }
    } catch (err) {
      console.error('[health] redis check failed', err)
      redis = 'down'
      redisLatencyMs = Date.now() - redisStarted
    }
  }

  const redisRequired = env().RATE_LIMIT_DRIVER === 'redis'
  const healthy = database === 'up' && (!redisRequired || redis === 'up')
  const status = healthy ? 200 : 503

  if (!detailAuthorized(req)) {
    return NextResponse.json({ status: healthy ? 'ok' : 'degraded' }, { status })
  }

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks: {
        database,
        latencyMs: dbLatencyMs,
        redis,
        redisLatencyMs,
      },
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status },
  )
}

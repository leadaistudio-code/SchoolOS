import { NextResponse } from 'next/server'
import { prisma } from '@/server/db/prisma'
import { getRedis, redisConfigured } from '@/server/redis'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * Liveness and readiness probe. Reports database (and Redis when configured)
 * so an orchestrator can tell "process is up" from "process can actually serve".
 */
export async function GET() {
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

  // Database is required; Redis is soft unless the rate-limit driver demands it.
  const redisRequired = env().RATE_LIMIT_DRIVER === 'redis'
  const healthy = database === 'up' && (!redisRequired || redis === 'up')

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
    { status: healthy ? 200 : 503 },
  )
}

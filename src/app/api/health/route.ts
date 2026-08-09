import { NextResponse } from 'next/server'
import { prisma } from '@/server/db/prisma'

export const dynamic = 'force-dynamic'

/**
 * Liveness and readiness probe. Reports the database round trip so an
 * orchestrator can tell "process is up" from "process can actually serve".
 */
export async function GET() {
  const startedAt = Date.now()
  let database: 'up' | 'down' = 'down'
  let latencyMs: number | null = null

  try {
    await prisma.$queryRaw`SELECT 1`
    database = 'up'
    latencyMs = Date.now() - startedAt
  } catch (err) {
    console.error('[health] database check failed', err)
  }

  const healthy = database === 'up'
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks: { database, latencyMs },
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  )
}

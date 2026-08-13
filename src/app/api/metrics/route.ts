import { NextResponse } from 'next/server'
import { prisma } from '@/server/db/prisma'
import { getRedis, redisConfigured } from '@/server/redis'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * Lightweight metrics for scrapers (Prometheus text format).
 * Unauthenticated on purpose — expose only behind a private network or
 * edge ACL in production.
 */
export async function GET() {
  const lines: string[] = []
  const push = (name: string, value: number, labels: Record<string, string> = {}) => {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
      .join(',')
    lines.push(`${name}${labelStr ? `{${labelStr}}` : ''} ${value}`)
  }

  push('mycampusview_uptime_seconds', Math.round(process.uptime()))
  const mem = process.memoryUsage()
  push('mycampusview_process_resident_memory_bytes', mem.rss)
  push('mycampusview_process_heap_used_bytes', mem.heapUsed)

  const dbStart = Date.now()
  let dbOk = 0
  try {
    await prisma.$queryRaw`SELECT 1`
    dbOk = 1
    push('mycampusview_db_latency_ms', Date.now() - dbStart)
  } catch {
    dbOk = 0
  }
  push('mycampusview_db_up', dbOk)

  let redisOk = 0
  if (redisConfigured() || env().RATE_LIMIT_DRIVER === 'redis') {
    const redisStart = Date.now()
    try {
      const client = await getRedis()
      if (client && (await client.ping()) === 'PONG') {
        redisOk = 1
        push('mycampusview_redis_latency_ms', Date.now() - redisStart)
      }
    } catch {
      redisOk = 0
    }
    push('mycampusview_redis_up', redisOk)
  }

  lines.push(`# TYPE mycampusview_info gauge`)
  push('mycampusview_info', 1, {
    app: env().APP_NAME,
    node: process.version,
    env: env().NODE_ENV,
  })

  return new NextResponse(lines.join('\n') + '\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

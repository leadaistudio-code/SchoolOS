/* eslint-disable no-console */
import 'dotenv/config'
import { env } from '../src/lib/env'
import { prisma } from '../src/server/db/prisma'
import { dispatchJob, NonRetryableJobError } from '../src/server/worker/dispatch'
import {
  claimJob,
  deadJob,
  expireOldNotificationJobs,
  failJob,
  recoverStaleNotificationJobs,
  succeedJob,
} from '../src/server/worker/queue'

const JOB_HANDLERS: Array<{ queue: string; name: string }> = [
  { queue: 'notifications', name: 'notification.send' },
  { queue: 'evaluation', name: 'evaluation.process' },
]

const config = env()
const pollMs = config.WORKER_POLL_MS
const concurrency = config.WORKER_CONCURRENCY
const staleAfterMs = config.WORKER_STALE_MINUTES * 60_000
const maxAgeMs = config.WORKER_NOTIFICATION_MAX_AGE_HOURS * 60 * 60_000

let stopping = false

function log(event: string, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ message: event, service: 'background-worker', event, ...details }))
}

function stop(signal: string) {
  if (stopping) return
  stopping = true
  log('shutdown.requested', { signal })
}

process.on('SIGTERM', () => stop('SIGTERM'))
process.on('SIGINT', () => stop('SIGINT'))

async function processNext(): Promise<boolean> {
  let job = null
  for (const handler of JOB_HANDLERS) {
    job = await claimJob(handler.queue, handler.name)
    if (job) break
  }
  if (!job) return false

  try {
    const result = await dispatchJob(job)
    await succeedJob(job.id, result as never)
    log('job.succeeded', {
      jobId: job.id,
      queue: job.queue,
      name: job.name,
      attempt: job.attempts,
      ...(typeof result === 'object' && result ? result : {}),
    })
  } catch (error) {
    if (error instanceof NonRetryableJobError) {
      await deadJob(job.id, error)
      log('job.dead', {
        jobId: job.id,
        queue: job.queue,
        name: job.name,
        attempt: job.attempts,
        error: error.message,
      })
      return true
    }

    const status = await failJob(job, error)
    log(status === 'DEAD' ? 'job.dead' : 'job.retry_scheduled', {
      jobId: job.id,
      queue: job.queue,
      name: job.name,
      attempt: job.attempts,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return true
}

async function maintainQueue() {
  const [recoveredNotifications, recoveredEvaluation, expired] = await Promise.all([
    recoverStaleNotificationJobs(staleAfterMs),
    recoverStaleNotificationJobs(staleAfterMs, 'evaluation', 'evaluation.process'),
    expireOldNotificationJobs(maxAgeMs),
  ])
  if (recoveredNotifications > 0 || recoveredEvaluation > 0 || expired > 0) {
    log('queue.maintained', {
      recoveredNotifications,
      recoveredEvaluation,
      expired,
    })
  }
}

async function main() {
  await maintainQueue()
  log('started', {
    concurrency,
    pollMs,
    staleMinutes: config.WORKER_STALE_MINUTES,
    notificationMaxAgeHours: config.WORKER_NOTIFICATION_MAX_AGE_HOURS,
  })

  let lastMaintenance = Date.now()
  while (!stopping) {
    const processed = await Promise.all(
      Array.from({ length: concurrency }, () => processNext()),
    )

    if (Date.now() - lastMaintenance >= 60_000) {
      await maintainQueue()
      lastMaintenance = Date.now()
    }

    if (!processed.some(Boolean) && !stopping) {
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    log('stopped')
  })

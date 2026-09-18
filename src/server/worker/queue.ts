import type { Job } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/prisma'

export type ClaimedJob = Pick<
  Job,
  'id' | 'tenantId' | 'queue' | 'name' | 'payload' | 'attempts' | 'maxAttempts'
>

const MAX_ERROR_LENGTH = 4_000

export function retryDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 8))
  return Math.min(15 * 60_000, 5_000 * 2 ** exponent)
}

/** Claim the next due job for a queue/name pair (FOR UPDATE SKIP LOCKED). */
export async function claimJob(
  queue: string,
  name: string,
): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
    WITH candidate AS (
      SELECT "id"
      FROM "Job"
      WHERE "queue" = ${queue}
        AND "name" = ${name}
        AND "status" IN (
          CAST('QUEUED' AS "JobStatus"),
          CAST('FAILED' AS "JobStatus")
        )
        AND "runAfter" <= NOW()
      ORDER BY "runAfter" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "Job" AS job
    SET "status" = CAST('RUNNING' AS "JobStatus"),
        "attempts" = job."attempts" + 1,
        "startedAt" = NOW(),
        "finishedAt" = NULL,
        "lastError" = NULL
    FROM candidate
    WHERE job."id" = candidate."id"
    RETURNING
      job."id",
      job."tenantId",
      job."queue",
      job."name",
      job."payload",
      job."attempts",
      job."maxAttempts"
  `)

  return rows[0] ?? null
}

export async function claimNotificationJob(
  queue = 'notifications',
  name = 'notification.send',
): Promise<ClaimedJob | null> {
  return claimJob(queue, name)
}

export async function succeedJob(jobId: string, result?: Prisma.InputJsonValue): Promise<void> {
  await prisma.job.updateMany({
    where: { id: jobId, status: 'RUNNING' },
    data: {
      status: 'SUCCEEDED',
      finishedAt: new Date(),
      lastError: null,
      ...(result === undefined ? {} : { result }),
    },
  })
}

export async function failJob(job: ClaimedJob, error: unknown): Promise<'FAILED' | 'DEAD'> {
  const terminal = job.attempts >= job.maxAttempts
  const message = errorMessage(error)
  const now = new Date()
  const status = terminal ? 'DEAD' : 'FAILED'

  await prisma.job.updateMany({
    where: { id: job.id, status: 'RUNNING' },
    data: {
      status,
      lastError: message,
      finishedAt: terminal ? now : null,
      runAfter: terminal ? now : new Date(now.getTime() + retryDelayMs(job.attempts)),
    },
  })

  return status
}

export async function deadJob(jobId: string, error: unknown): Promise<void> {
  await prisma.job.updateMany({
    where: { id: jobId, status: 'RUNNING' },
    data: {
      status: 'DEAD',
      finishedAt: new Date(),
      lastError: errorMessage(error),
    },
  })
}

export async function recoverStaleNotificationJobs(
  staleAfterMs: number,
  queue = 'notifications',
  name = 'notification.send',
): Promise<number> {
  const staleBefore = new Date(Date.now() - staleAfterMs)
  const recovered = await prisma.job.updateMany({
    where: {
      queue,
      name,
      status: 'RUNNING',
      startedAt: { lt: staleBefore },
    },
    data: {
      status: 'FAILED',
      runAfter: new Date(),
      startedAt: null,
      lastError: 'Recovered after the previous worker stopped before completing this job.',
    },
  })
  return recovered.count
}

export async function expireOldNotificationJobs(
  maxAgeMs: number,
  queue = 'notifications',
  name = 'notification.send',
): Promise<number> {
  const createdBefore = new Date(Date.now() - maxAgeMs)
  const expired = await prisma.job.updateMany({
    where: {
      queue,
      name,
      status: { in: ['QUEUED', 'FAILED'] },
      createdAt: { lt: createdBefore },
    },
    data: {
      status: 'DEAD',
      finishedAt: new Date(),
      lastError: 'Expired because this notification was queued more than 24 hours ago.',
    },
  })
  return expired.count
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, MAX_ERROR_LENGTH)
}

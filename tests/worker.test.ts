import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/server/db/prisma'
import {
  claimNotificationJob,
  expireOldNotificationJobs,
  failJob,
  recoverStaleNotificationJobs,
  retryDelayMs,
} from '@/server/worker/queue'
import { dispatchJob, NonRetryableJobError } from '@/server/worker/dispatch'
import { deliverNotification } from '@/server/notifications'

const providerSend = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, providerMessageId: 'worker-test-message' })),
)

vi.mock('@/server/mail/smtp', () => ({
  tenantEmailProvider: async () => ({ send: providerSend }),
}))

vi.mock('@/server/providers', () => ({
  emailProvider: () => ({ send: providerSend }),
  smsProvider: () => ({ send: providerSend }),
}))

vi.mock('@/server/messaging/send', () => ({
  sendParentMessage: async () => ({
    ok: true,
    providerMessageId: 'worker-test-whatsapp',
    channel: 'whatsapp',
  }),
}))

const jobIds: string[] = []
const notificationIds: string[] = []
const testQueue = `worker-test-${Date.now()}`
let recipient: { id: string; tenantId: string }

async function createJob(overrides: {
  status?: 'QUEUED' | 'RUNNING'
  attempts?: number
  maxAttempts?: number
  runAfter?: Date
  startedAt?: Date
  createdAt?: Date
  payload?: object
} = {}) {
  const job = await prisma.job.create({
    data: {
      queue: testQueue,
      name: 'notification.send',
      payload: overrides.payload ?? { notificationId: `missing-${Date.now()}` },
      status: overrides.status,
      attempts: overrides.attempts,
      maxAttempts: overrides.maxAttempts,
      runAfter: overrides.runAfter,
      startedAt: overrides.startedAt,
      createdAt: overrides.createdAt,
    },
  })
  jobIds.push(job.id)
  return job
}

beforeAll(async () => {
  const user = await prisma.user.findFirst({
    where: { tenantId: { not: null }, deletedAt: null },
    select: { id: true, tenantId: true },
  })
  if (!user?.tenantId) throw new Error('Worker tests require one seeded tenant user.')
  recipient = { id: user.id, tenantId: user.tenantId }
})

afterAll(async () => {
  await prisma.job.deleteMany({ where: { id: { in: jobIds } } })
  await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } })
})

describe('background worker queue', () => {
  it('claims concurrent jobs only once and increments attempts', async () => {
    const first = await createJob()
    const second = await createJob()

    const claimed = await Promise.all([
      claimNotificationJob(testQueue),
      claimNotificationJob(testQueue),
    ])
    expect(new Set(claimed.map((job) => job?.id))).toEqual(new Set([first.id, second.id]))
    expect(claimed.every((job) => job?.attempts === 1)).toBe(true)
  })

  it('backs off retryable failures and dead-letters the final attempt', async () => {
    const retrying = await createJob()
    const claimedRetry = await claimNotificationJob(testQueue)
    expect(claimedRetry?.id).toBe(retrying.id)
    await failJob(claimedRetry!, new Error('temporary provider failure'))

    const retryRow = await prisma.job.findUniqueOrThrow({ where: { id: retrying.id } })
    expect(retryRow.status).toBe('FAILED')
    expect(retryRow.runAfter.getTime()).toBeGreaterThan(Date.now())

    const terminal = await createJob({ attempts: 1, maxAttempts: 2 })
    await prisma.job.update({ where: { id: retrying.id }, data: { runAfter: new Date(Date.now() + 60_000) } })
    const claimedTerminal = await claimNotificationJob(testQueue)
    expect(claimedTerminal?.id).toBe(terminal.id)
    await failJob(claimedTerminal!, new Error('permanent provider failure'))

    const terminalRow = await prisma.job.findUniqueOrThrow({ where: { id: terminal.id } })
    expect(terminalRow.status).toBe('DEAD')
    expect(terminalRow.finishedAt).not.toBeNull()
    expect(retryDelayMs(20)).toBe(15 * 60_000)
  })

  it('recovers abandoned work and expires stale notifications', async () => {
    const stale = await createJob({
      status: 'RUNNING',
      startedAt: new Date(Date.now() - 30 * 60_000),
    })
    const old = await createJob({
      createdAt: new Date(Date.now() - 25 * 60 * 60_000),
    })

    expect(await recoverStaleNotificationJobs(15 * 60_000, testQueue)).toBeGreaterThanOrEqual(1)
    expect((await prisma.job.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('FAILED')

    expect(await expireOldNotificationJobs(24 * 60 * 60_000, testQueue)).toBeGreaterThanOrEqual(1)
    expect((await prisma.job.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('DEAD')
  })

  it('rejects malformed payloads without retrying them', async () => {
    const job = await createJob({ payload: { wrong: true } })
    await expect(
      dispatchJob({
        id: job.id,
        tenantId: null,
        queue: 'notifications',
        name: job.name,
        payload: job.payload,
        attempts: 1,
        maxAttempts: job.maxAttempts,
      }),
    ).rejects.toBeInstanceOf(NonRetryableJobError)
  })
})

describe('notification delivery', () => {
  it('records successful and unsupported channels and never resends either', async () => {
    const notification = await prisma.notification.create({
      data: {
        tenantId: recipient.tenantId,
        userId: recipient.id,
        eventKey: 'worker.test',
        title: 'Worker test',
        body: 'This message is intercepted by the test provider.',
        deliveries: {
          create: [
            { tenantId: recipient.tenantId, channel: 'EMAIL' },
            { tenantId: recipient.tenantId, channel: 'PUSH' },
          ],
        },
      },
    })
    notificationIds.push(notification.id)

    const first = await deliverNotification(notification.id)
    expect(first).toEqual({ attempted: 2, sent: 1, failed: 0, skipped: 1 })

    const second = await deliverNotification(notification.id)
    expect(second).toEqual({ attempted: 0, sent: 0, failed: 0, skipped: 0 })
    expect(providerSend).toHaveBeenCalledTimes(1)
  })
})

import { z } from 'zod'
import { deliverNotification, type NotificationDeliveryResult } from '@/server/notifications'
import type { ClaimedJob } from '@/server/worker/queue'
import { processEvaluationJob } from '@/server/modules/evaluation/service'
import { processReceiptOutbox } from '@/server/modules/whatsapp-receipts/worker'

const notificationPayloadSchema = z.object({
  notificationId: z.string().min(1),
})

const whatsappReceiptPayloadSchema = z.object({
  outboxId: z.string().min(8),
  tenantId: z.string().min(8),
})

const evaluationPayloadSchema = z.object({
  evaluationJobId: z.string().min(8),
  tenantId: z.string().min(8),
  answerSheetId: z.string().min(8).optional(),
})

export class RetryableJobError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetryableJobError'
  }
}

export class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NonRetryableJobError'
  }
}

export async function dispatchJob(
  job: ClaimedJob,
): Promise<NotificationDeliveryResult | { status: string; skipped?: boolean }> {
  if (job.queue === 'notifications' && job.name === 'notification.send') {
    const parsed = notificationPayloadSchema.safeParse(job.payload)
    if (!parsed.success) {
      throw new NonRetryableJobError(`Invalid notification job payload: ${parsed.error.message}`)
    }

    const result = await deliverNotification(parsed.data.notificationId)

    if (result.failed > 0) {
      throw new RetryableJobError(
        `${result.failed} of ${result.attempted} notification deliveries failed.`,
      )
    }

    return result
  }

  if (job.queue === 'evaluation' && job.name === 'evaluation.process') {
    const parsed = evaluationPayloadSchema.safeParse(job.payload)
    if (!parsed.success) {
      throw new NonRetryableJobError(`Invalid evaluation job payload: ${parsed.error.message}`)
    }
    if (job.tenantId && job.tenantId !== parsed.data.tenantId) {
      throw new NonRetryableJobError('Evaluation job tenant mismatch')
    }
    return processEvaluationJob(parsed.data.evaluationJobId, parsed.data.tenantId)
  }

  if (job.queue === 'whatsapp' && job.name === 'whatsapp.receipt') {
    const parsed = whatsappReceiptPayloadSchema.safeParse(job.payload)
    if (!parsed.success) {
      throw new NonRetryableJobError(`Invalid WhatsApp receipt job payload: ${parsed.error.message}`)
    }
    if (job.tenantId && job.tenantId !== parsed.data.tenantId) {
      throw new NonRetryableJobError('WhatsApp receipt job tenant mismatch')
    }
    const outcome = await processReceiptOutbox(parsed.data.outboxId, parsed.data.tenantId)
    if (outcome.status === 'retry') throw new RetryableJobError(outcome.error)
    return outcome
  }

  throw new NonRetryableJobError(`Unsupported worker job: ${job.queue}/${job.name}`)
}

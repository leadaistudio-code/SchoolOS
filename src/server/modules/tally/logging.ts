import { randomUUID } from 'node:crypto'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import type { TallySyncStatus } from '@prisma/client'

export async function writeTallySyncLog(input: {
  tenantId: string
  integrationId: string
  userId?: string | null
  operation: string
  entityKind?: string | null
  entityId?: string | null
  status: TallySyncStatus
  httpStatus?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  detailJson?: Record<string, unknown> | null
  durationMs?: number | null
  correlationId?: string
}) {
  const correlationId = input.correlationId ?? randomUUID()
  try {
    await (await import('@/server/db/tenant-client')).tenantDb(input.tenantId).tallySyncLog.create({
      data: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        userId: input.userId ?? null,
        operation: input.operation,
        entityKind: input.entityKind ?? null,
        entityId: input.entityId ?? null,
        correlationId,
        status: input.status,
        httpStatus: input.httpStatus ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage?.slice(0, 1000) ?? null,
        detailJson: input.detailJson ?? undefined,
        durationMs: input.durationMs ?? null,
      },
    })
  } catch (err) {
    console.error('[tally] sync log failed', err)
  }
  return correlationId
}

export async function auditTally(
  ctx: AppContext,
  input: {
    action: string
    entityType: string
    entityId: string
    summary: string
    after?: Record<string, unknown>
  },
) {
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: input.action,
    module: 'fees',
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    after: input.after,
  })
}

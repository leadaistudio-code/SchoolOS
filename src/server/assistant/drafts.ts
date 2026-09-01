import { z } from 'zod'
import { randomToken } from '@/server/crypto'
import { prisma } from '@/server/db/prisma'
import type { AppContext } from '@/server/context'
import { createNotice, noticeCreateSchema } from '@/server/modules/notices/service'
import { decideLeave } from '@/server/modules/leave/service'
import { audit } from '@/server/audit'
import { ApiException } from '@/server/api/response'

/**
 * Drafted actions, and the approval that executes them.
 *
 * The assistant may propose an action; it may not perform one. That separation
 * is the whole design, and it is enforced by where the code lives rather than by
 * instructions in a prompt: `tools.ts` can only *return* a draft, and the write
 * happens here, in a function the model cannot call, from an HTTP request the
 * user's own click produced.
 */

const TTL_MINUTES = 30

/** What the browser may send back. Never trusted as the source of the action. */
export const confirmSchema = z.object({
  draftId: z.string().min(10).max(80),
})

const noticeDraftSchema = z.object({
  title: z.string().min(3).max(160),
  body: z.string().min(10).max(4000),
  audienceKind: z.enum(['ALL', 'CLASS']),
  classLevelId: z.string().optional(),
})

const leaveApprovalsSchema = z.object({
  leaveRequestIds: z.array(z.string().min(8)).min(1).max(10),
  decisionNote: z.string().max(500).optional(),
})

export type StoredDraft = {
  kind: 'notice' | 'fee_reminder' | 'attendance_nudge' | 'leave_approvals'
  summary: string
  payload: unknown
}

export async function storeDraft(ctx: AppContext, draft: StoredDraft): Promise<string> {
  const draftId = randomToken(24)

  await prisma.job.create({
    data: {
      tenantId: ctx.tenant.id,
      queue: 'assistant',
      name: 'assistant.draft',
      payload: {
        draftId,
        kind: draft.kind,
        summary: draft.summary,
        input: draft.payload,
        createdBy: ctx.user.userId,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000).toISOString(),
      } as never,
    },
    select: { id: true },
  })

  return draftId
}

async function publishNoticeDraft(ctx: AppContext, input: z.infer<typeof noticeDraftSchema>) {
  return createNotice(
    ctx,
    noticeCreateSchema.parse({
      title: input.title,
      body: input.body,
      priority: 'NORMAL',
      audienceKind: input.audienceKind,
      ...(input.audienceKind === 'CLASS' ? { classLevelId: input.classLevelId } : {}),
      isPublished: true,
      notifyNow: true,
      pinned: false,
    }),
  )
}

export async function confirmDraft(ctx: AppContext, draftId: string) {
  const jobs = await prisma.job.findMany({
    where: { tenantId: ctx.tenant.id, queue: 'assistant', name: 'assistant.draft' },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, payload: true, status: true },
  })

  const row = jobs.find((job) => {
    const payload = job.payload as { draftId?: string } | null
    return payload?.draftId === draftId
  })

  if (!row) throw new ApiException(404, 'NOT_FOUND', 'That draft is no longer available.')

  const payload = row.payload as {
    kind: string
    summary: string
    input: unknown
    createdBy: string
    expiresAt: string
    executedAt?: string
  }

  if (payload.executedAt) {
    throw new ApiException(409, 'CONFLICT', 'That draft has already been sent.')
  }
  if (payload.createdBy !== ctx.user.userId) {
    throw new ApiException(403, 'FORBIDDEN', 'That draft was prepared for someone else.')
  }
  if (new Date(payload.expiresAt).getTime() < Date.now()) {
    throw new ApiException(410, 'GONE', 'That draft has expired. Ask again and I will prepare a fresh one.')
  }

  let result: { noticeId?: string; title?: string; approvedLeave?: number }

  if (
    payload.kind === 'notice' ||
    payload.kind === 'fee_reminder' ||
    payload.kind === 'attendance_nudge'
  ) {
    const input = noticeDraftSchema.parse(payload.input)
    const notice = await publishNoticeDraft(ctx, input)
    result = { noticeId: notice.id, title: input.title }
  } else if (payload.kind === 'leave_approvals') {
    const input = leaveApprovalsSchema.parse(payload.input)
    let approved = 0
    for (const id of input.leaveRequestIds) {
      await decideLeave(ctx, id, {
        status: 'APPROVED',
        decisionNote: input.decisionNote ?? 'Approved via Campus Assistant',
      })
      approved += 1
    }
    result = { approvedLeave: approved }
  } else {
    throw new ApiException(400, 'BAD_REQUEST', `Unknown draft type: ${payload.kind}`)
  }

  await prisma.job.update({
    where: { id: row.id },
    data: {
      payload: { ...payload, draftId, executedAt: new Date().toISOString(), result } as never,
      status: 'SUCCEEDED',
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'assistant.draft.approved',
    module: 'assistant',
    entityType: payload.kind === 'leave_approvals' ? 'LeaveRequest' : 'Notice',
    entityId: result.noticeId ?? draftId,
    summary: `Approved an assistant draft: ${payload.summary}`,
    after: { draftId, kind: payload.kind, ...result },
  })

  return result
}

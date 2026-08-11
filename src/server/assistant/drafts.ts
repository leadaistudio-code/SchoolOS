import { z } from 'zod'
import { randomToken } from '@/server/crypto'
import { prisma } from '@/server/db/prisma'
import type { AppContext } from '@/server/context'
import { createNotice, noticeCreateSchema } from '@/server/modules/notices/service'
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
 *
 * The consequence worth stating plainly: no misread question, and no instruction
 * smuggled into a student record, can send a message to parents. The worst it
 * can do is put a draft in front of somebody, who then declines it.
 *
 * Drafts are stored as `Job` rows on the `assistant` queue — the same durable
 * mechanism the demo form uses. They carry the user and tenant that created
 * them, are single-use, and expire.
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

export type StoredDraft = { kind: 'notice'; summary: string; payload: unknown }

/**
 * Records a draft and returns its id.
 *
 * The id is a random token, not the row id: it is handed to a browser, and a
 * guessable identifier for "an action somebody may approve" is worth avoiding
 * even though the confirm route checks ownership anyway.
 */
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

/**
 * Executes a draft the user has approved.
 *
 * Every check is made again here, at the moment of the write: that the draft
 * exists, that it belongs to this school, that the person approving it is the
 * person it was drafted for, that it has not expired, that it has not already
 * run, and that they still hold the permission. None of that is inferred from
 * the earlier conversation — a permission could have been revoked since, and the
 * approval is the only moment that matters.
 */
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
    // A draft belongs to the person it was drafted for. Another administrator
    // approving somebody else's drafted message is not an approval.
    throw new ApiException(403, 'FORBIDDEN', 'That draft was prepared for someone else.')
  }
  if (new Date(payload.expiresAt).getTime() < Date.now()) {
    throw new ApiException(410, 'GONE', 'That draft has expired. Ask again and I will prepare a fresh one.')
  }

  if (payload.kind !== 'notice') {
    throw new ApiException(400, 'BAD_REQUEST', `Unknown draft type: ${payload.kind}`)
  }

  const input = noticeDraftSchema.parse(payload.input)

  // `createNotice` asserts `notices.create` itself and writes its own audit
  // entry. This is a plain call to the same function the notice screen uses.
  const notice = await createNotice(
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

  await prisma.job.update({
    where: { id: row.id },
    data: {
      payload: { ...payload, draftId, executedAt: new Date().toISOString(), noticeId: notice.id } as never,
      status: 'SUCCEEDED',
    },
  })

  // Audited separately from `notice.create`, because the reviewable fact is not
  // just that a notice exists — it is that the assistant drafted it and a named
  // person approved it.
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'assistant.draft.approved',
    module: 'assistant',
    entityType: 'Notice',
    entityId: notice.id,
    summary: `Approved an assistant-drafted notice: ${payload.summary}`,
    after: { draftId, title: input.title, audience: input.audienceKind },
  })

  return { noticeId: notice.id, title: input.title }
}

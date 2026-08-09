import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { uploadFile } from '@/server/files'
import { audit } from '@/server/audit'

const ATTACH_TO = {
  homework: { column: 'homeworkId', permission: 'homework.edit', folder: 'homework' },
  submission: { column: 'submissionId', permission: 'homework.submit', folder: 'submissions' },
  classwork: { column: 'classworkId', permission: 'classwork.edit', folder: 'classwork' },
  notice: { column: 'noticeId', permission: 'notices.edit', folder: 'notices' },
} as const

/**
 * POST /api/v1/files/upload
 *
 * multipart/form-data: file, target (homework|submission|classwork|notice), targetId.
 * The storage key is generated server-side and prefixed with the tenant, so an
 * upload can never land in another school's namespace.
 */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const form = await req.formData()
    const file = form.get('file')
    const target = String(form.get('target') ?? '')
    const targetId = String(form.get('targetId') ?? '')

    if (!(file instanceof File)) {
      throw new ApiException(400, 'BAD_REQUEST', 'No file was uploaded')
    }

    const config = ATTACH_TO[target as keyof typeof ATTACH_TO]
    if (!config || !targetId) {
      throw new ApiException(400, 'BAD_REQUEST', 'Unknown attachment target')
    }
    ctx.require(config.permission)

    // The parent row must exist inside this tenant before anything is stored,
    // so an orphan object cannot be created by guessing an id.
    const owner = await ownerExists(ctx, target as keyof typeof ATTACH_TO, targetId)
    if (!owner) throw new ApiException(404, 'NOT_FOUND', 'The item to attach to was not found')

    const uploaded = await uploadFile(ctx, file, config.folder)

    const attachment = await ctx.db.attachment.create({
      data: {
        tenantId: ctx.tenant.id,
        storageKey: uploaded.storageKey,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        uploadedById: ctx.user.userId,
        [config.column]: targetId,
      } as never,
    })

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'file.upload',
      module: 'documents',
      entityType: 'Attachment',
      entityId: attachment.id,
      summary: `Uploaded ${uploaded.fileName} to ${target}`,
    })

    return ok(
      {
        id: attachment.id,
        fileName: attachment.fileName,
        sizeBytes: attachment.sizeBytes,
        url: `/api/v1/files/${encodeURIComponent(attachment.storageKey)}`,
      },
      undefined,
      { status: 201 },
    )
  },
  { rateLimitKey: 'mutation' },
)

async function ownerExists(
  ctx: Awaited<ReturnType<typeof import('@/server/context').requireApiContext>>,
  target: keyof typeof ATTACH_TO,
  id: string,
): Promise<boolean> {
  switch (target) {
    case 'homework':
      return !!(await ctx.db.homework.findFirst({ where: { id }, select: { id: true } }))
    case 'submission':
      return !!(await ctx.db.homeworkSubmission.findFirst({ where: { id }, select: { id: true } }))
    case 'classwork':
      return !!(await ctx.db.classwork.findFirst({ where: { id }, select: { id: true } }))
    case 'notice':
      return !!(await ctx.db.notice.findFirst({ where: { id }, select: { id: true } }))
  }
}

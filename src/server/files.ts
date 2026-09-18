import { randomToken, sha256 } from '@/server/crypto'
import { storageProvider } from '@/server/providers'
import { env } from '@/lib/env'
import { ApiException } from '@/server/api/response'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { PROFILE_PHOTO_CATEGORY } from '@/lib/student-documents'

/**
 * Upload handling.
 *
 * Two rules drive everything here:
 *  1. the client never chooses the storage key, so it cannot overwrite another
 *     tenant's object or escape the tenant prefix;
 *  2. the file type is decided by an allow-list, not by the Content-Type header
 *     the browser happens to send.
 */
const ALLOWED = new Map<string, string[]>([
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/png', ['png']],
  ['image/webp', ['webp']],
  ['application/pdf', ['pdf']],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ['docx'],
  ],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['xlsx']],
  ['text/plain', ['txt']],
  ['text/csv', ['csv']],
])

/**
 * Content signatures for the formats that have one.
 *
 * The check is positive, not merely "does it look like something else": if a
 * declared type has a known signature, the bytes MUST match it. An earlier
 * version only rejected recognised mismatches, which let a file with unknown
 * magic bytes (an .exe renamed to .pdf) through.
 */
const SIGNATURES: Record<string, string[]> = {
  'application/pdf': ['25504446'], // %PDF
  'image/jpeg': ['ffd8ff'],
  'image/png': ['89504e47'],
  'image/webp': ['52494646'], // RIFF....WEBP
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['504b0304'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['504b0304'],
}

/** Types that are legitimately free-form and have no signature to check. */
const SIGNATURE_EXEMPT = new Set(['text/plain', 'text/csv'])

function signatureMatches(buffer: Buffer, mimeType: string): boolean {
  if (SIGNATURE_EXEMPT.has(mimeType)) return true

  const expected = SIGNATURES[mimeType]
  if (!expected) return false

  const head = buffer.subarray(0, 8).toString('hex')
  return expected.some((prefix) => head.startsWith(prefix))
}

export type UploadedFile = {
  storageKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
  checksum: string
}

export async function uploadFile(
  ctx: AppContext,
  file: File,
  folder: string,
): Promise<UploadedFile> {
  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024
  if (file.size === 0) throw new ApiException(400, 'BAD_REQUEST', 'The file is empty')
  if (file.size > maxBytes) {
    throw new ApiException(
      413,
      'FILE_TOO_LARGE',
      `Files must be ${env().MAX_UPLOAD_MB}MB or smaller`,
    )
  }

  const extensions = ALLOWED.get(file.type)
  if (!extensions) {
    throw new ApiException(
      415,
      'UNSUPPORTED_FILE_TYPE',
      'Allowed file types are PDF, Word, Excel, CSV, text and images',
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  if (!signatureMatches(buffer, file.type)) {
    throw new ApiException(
      415,
      'UNSUPPORTED_FILE_TYPE',
      'The file contents do not match the type it claims to be',
    )
  }

  const extension = extensions[0]!
  const safeName = file.name.replace(/[^\w.\- ]+/g, '').slice(0, 120) || `file.${extension}`

  // Tenant-prefixed, server-generated key. Nothing from the client reaches it.
  const storageKey = `${ctx.tenant.id}/${folder}/${randomToken(12)}.${extension}`

  await storageProvider().put(storageKey, buffer, file.type)

  return {
    storageKey,
    fileName: safeName,
    mimeType: file.type,
    sizeBytes: buffer.length,
    checksum: sha256(buffer.toString('base64')),
  }
}

/**
 * Reads a stored object after proving the caller may have it.
 *
 * A storage key is not a capability: possession of the key grants nothing. The
 * key must belong to this tenant AND be referenced by a row the caller is
 * allowed to see.
 */
export async function readFileForCaller(
  ctx: AppContext,
  storageKey: string,
): Promise<{ body: Buffer; mimeType: string; fileName: string }> {
  if (!storageKey.startsWith(`${ctx.tenant.id}/`)) {
    // Deliberately the same error as "missing": do not confirm it exists.
    throw new ApiException(404, 'NOT_FOUND', 'File not found')
  }

  const [attachment, document, textbook, answerSheet] = await Promise.all([
    ctx.db.attachment.findFirst({
      where: { storageKey },
      select: {
        fileName: true,
        mimeType: true,
        noticeId: true,
        homeworkId: true,
        submissionId: true,
        classworkId: true,
        messageId: true,
        submission: { select: { studentId: true } },
      },
    }),
    ctx.db.document.findFirst({
      where: { storageKey, deletedAt: null },
      select: { title: true, mimeType: true, category: true, studentId: true, staffId: true, parentId: true },
    }),
    ctx.db.textbook.findFirst({
      where: { storageKey, deletedAt: null },
      select: { title: true, fileName: true, mimeType: true, classSubjectId: true },
    }),
    ctx.db.answerSheet.findFirst({
      where: { storageKey },
      select: {
        fileName: true,
        mimeType: true,
        studentId: true,
        assignment: { select: { assessment: { select: { classSubjectId: true } } } },
      },
    }),
  ])

  if (!attachment && !document && !textbook && !answerSheet) {
    throw new ApiException(404, 'NOT_FOUND', 'File not found')
  }

  if (answerSheet) {
    if (!ctx.can('assessments.evaluate')) {
      throw new ApiException(403, 'FORBIDDEN', 'You cannot view this answer sheet')
    }
    const { assertClassSubjectAccess, assertStudentAccess } = await import('@/server/scope')
    await assertClassSubjectAccess(ctx, answerSheet.assignment.assessment.classSubjectId)
    await assertStudentAccess(ctx, answerSheet.studentId)
    return {
      body: await storageProvider().get(storageKey),
      mimeType: answerSheet.mimeType,
      fileName: answerSheet.fileName,
    }
  }

  if (attachment) {
    await assertAttachmentAccess(ctx, attachment)
    return {
      body: await storageProvider().get(storageKey),
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
    }
  }

  if (textbook) {
    if (!ctx.can('questionbank.generate')) {
      throw new ApiException(403, 'FORBIDDEN', 'You cannot view this textbook')
    }
    const { assertClassSubjectAccess } = await import('@/server/scope')
    await assertClassSubjectAccess(ctx, textbook.classSubjectId)
    return {
      body: await storageProvider().get(storageKey),
      mimeType: textbook.mimeType,
      fileName: textbook.fileName || textbook.title,
    }
  }

  // A profile photo is authorised by who it is OF, not by the documents right:
  // rosters, the score pages and the parent portal all render avatars, and none
  // of those readers necessarily hold `documents.view`. Every other document
  // category keeps the stricter rule unchanged.
  if (document!.category === PROFILE_PHOTO_CATEGORY) {
    if (document!.studentId) {
      const { assertStudentAccess } = await import('@/server/scope')
      await assertStudentAccess(ctx, document!.studentId)
    } else if (document!.staffId) {
      if (!ctx.can('staff.view')) {
        throw new ApiException(403, 'FORBIDDEN', 'You cannot view this photo')
      }
    } else {
      throw new ApiException(403, 'FORBIDDEN', 'You cannot view this photo')
    }
  } else {
    if (!ctx.can('documents.view')) {
      throw new ApiException(403, 'FORBIDDEN', 'You cannot view this document')
    }
    if (document!.studentId) {
      const { assertStudentAccess } = await import('@/server/scope')
      await assertStudentAccess(ctx, document!.studentId)
    } else if (document!.parentId) {
      const parent = await ctx.db.parent.findFirst({
        where: { id: document!.parentId, userId: ctx.user.userId },
        select: { id: true },
      })
      if (!parent && !ctx.can('documents.manage')) {
        throw new ApiException(403, 'FORBIDDEN', 'You cannot view this document')
      }
    } else if (document!.staffId) {
      if (!ctx.can('staff.view')) {
        throw new ApiException(403, 'FORBIDDEN', 'You cannot view this document')
      }
    } else if (!ctx.can('documents.manage')) {
      throw new ApiException(403, 'FORBIDDEN', 'You cannot view this document')
    }
  }

  return {
    body: await storageProvider().get(storageKey),
    mimeType: document!.mimeType,
    fileName: document!.title,
  }
}

async function assertAttachmentAccess(
  ctx: AppContext,
  attachment: {
    noticeId: string | null
    homeworkId: string | null
    submissionId: string | null
    classworkId: string | null
    messageId: string | null
    submission: { studentId: string } | null
  },
) {
  const deny = () => {
    throw new ApiException(403, 'FORBIDDEN', 'You cannot view this file')
  }

  if (attachment.noticeId) {
    if (!ctx.can('notices.view')) deny()
    const { getNotice } = await import('@/server/modules/notices/service')
    await getNotice(ctx, attachment.noticeId)
  }
  if (attachment.homeworkId) {
    if (!ctx.can('homework.view')) deny()
    const { getHomework } = await import('@/server/modules/homework/service')
    await getHomework(ctx, attachment.homeworkId)
  }
  if (attachment.classworkId) {
    if (!ctx.can('classwork.view')) deny()
    const allowed = await classworkVisibleToCaller(ctx, attachment.classworkId)
    if (!allowed) deny()
  }
  if (attachment.messageId) {
    if (!ctx.can('messages.view')) deny()
    const message = await ctx.db.message.findFirst({
      where: {
        id: attachment.messageId,
        conversation: { participants: { some: { userId: ctx.user.userId } } },
      },
      select: { id: true },
    })
    if (!message) deny()
  }

  // A submission attachment belongs to one student: only that student (or
  // their guardians) and a reviewer may read it.
  if (attachment.submissionId) {
    if (!ctx.can('homework.view')) deny()
    if (!ctx.can('homework.review') && attachment.submission) {
      const { accessibleStudentIds } = await import('@/server/scope')
      const allowed = await accessibleStudentIds(ctx)
      if (allowed !== null && !allowed.includes(attachment.submission.studentId)) deny()
    }
  }
}

async function classworkVisibleToCaller(ctx: AppContext, classworkId: string) {
  const classwork = await ctx.db.classwork.findFirst({
    where: { id: classworkId, deletedAt: null },
    select: { classLevelId: true, sectionId: true },
  })
  if (!classwork) return false

  const { accessibleStudentIds } = await import('@/server/scope')
  const studentIds = await accessibleStudentIds(ctx)
  if (studentIds === null) return true

  return !!(await ctx.db.enrollment.findFirst({
    where: {
      studentId: { in: studentIds },
      classLevelId: classwork.classLevelId,
      ...(classwork.sectionId ? { sectionId: classwork.sectionId } : {}),
      isCurrent: true,
    },
    select: { id: true },
  }))
}

export async function deleteAttachment(ctx: AppContext, id: string) {
  const attachment = await ctx.db.attachment.findFirst({
    where: { id },
    select: {
      id: true,
      storageKey: true,
      fileName: true,
      uploadedById: true,
      noticeId: true,
      homeworkId: true,
      submissionId: true,
      classworkId: true,
      messageId: true,
      submission: { select: { studentId: true } },
    },
  })
  if (!attachment) throw new ApiException(404, 'NOT_FOUND', 'File not found')
  await assertAttachmentAccess(ctx, attachment)
  if (attachment.uploadedById !== ctx.user.userId && !ctx.can('documents.manage')) {
    throw new ApiException(403, 'FORBIDDEN', 'You cannot delete this file')
  }

  await storageProvider().delete(attachment.storageKey).catch(() => undefined)
  await ctx.db.attachment.delete({ where: { id } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'file.delete',
    module: 'documents',
    entityType: 'Attachment',
    entityId: id,
    summary: `Deleted file ${attachment.fileName}`,
  })
}

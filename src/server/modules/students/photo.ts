import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound, ApiException } from '@/server/api/response'
import { uploadFile } from '@/server/files'
import { storageProvider } from '@/server/providers'
import { assertStudentAccess } from '@/server/scope'
import { PROFILE_PHOTO_CATEGORY, isProfilePhotoMime } from '@/lib/student-documents'

/**
 * The profile photo.
 *
 * A photo is a `Document` like any other file we hold — same storage, same
 * proxy, same audit trail — but under the reserved `PROFILE_PHOTO` category so
 * it never appears in the admission file or the missing-document report. The
 * one extra thing it does is set `Student.photoUrl` to the servable proxy path,
 * which is what lights the avatar up everywhere the roster and score pages
 * already render one.
 *
 * `photoUrl` holds the proxy path (`/api/v1/files/{key}`), never a public URL:
 * every read still goes through `readFileForCaller`, which re-proves the caller
 * may see this child before returning a byte.
 */

/** The proxy path an `<img>` loads. The key is URL-encoded so a `/` in it survives. */
function photoPathFor(storageKey: string): string {
  return '/api/v1/files/' + encodeURIComponent(storageKey)
}

/**
 * Sets (or replaces) a student's profile photo.
 *
 * The new bytes are uploaded before anything is torn down, so a rejected file
 * — wrong type, too big — leaves the existing photo untouched. Only once the
 * replacement is safely stored is the previous one soft-deleted and its object
 * dropped, which also means the storage key changes on every replace and no
 * stale image can be served from a cache keyed on the old path.
 */
export async function setStudentPhoto(
  ctx: AppContext,
  studentId: string,
  file: File,
): Promise<{ photoUrl: string }> {
  ctx.require('students.edit')
  await assertStudentAccess(ctx, studentId)

  // The avatar control only accepts images client-side, but that is a hint the
  // browser can be made to ignore — the real gate is here. `uploadFile` would
  // otherwise store a PDF or spreadsheet just as happily as a photo.
  if (!isProfilePhotoMime(file.type)) {
    throw new ApiException(
      415,
      'UNSUPPORTED_FILE_TYPE',
      'A profile photo must be a JPEG, PNG or WebP image',
    )
  }

  const student = await ctx.db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!student) throw notFound('Student')

  // The ones we are about to replace. Read before the upload so a failed upload
  // cannot orphan them.
  const previous = await ctx.db.document.findMany({
    where: {
      ownerType: 'STUDENT',
      studentId: student.id,
      category: PROFILE_PHOTO_CATEGORY,
      deletedAt: null,
    },
    select: { id: true, storageKey: true },
  })

  const stored = await uploadFile(ctx, file, 'avatars')
  const photoUrl = photoPathFor(stored.storageKey)

  const created = await ctx.db.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        tenantId: ctx.tenant.id,
        ownerType: 'STUDENT',
        studentId: student.id,
        category: PROFILE_PHOTO_CATEGORY,
        title: 'Profile photo',
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksum,
        uploadedById: ctx.user.userId,
      },
    })

    if (previous.length > 0) {
      await tx.document.updateMany({
        where: { id: { in: previous.map((p) => p.id) } },
        data: { deletedAt: new Date() },
      })
    }

    await tx.student.update({ where: { id: student.id }, data: { photoUrl } })
    return doc
  })

  // Best effort, outside the transaction: the row is already gone from every
  // screen, and an unreferenced object is unreachable rather than exposed.
  await Promise.all(
    previous.map((p) => storageProvider().delete(p.storageKey).catch(() => undefined)),
  )

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'student.photo.update',
    module: 'students',
    entityType: 'Student',
    entityId: student.id,
    summary: `Updated profile photo for ${student.firstName} ${student.lastName}`.trim(),
    after: created,
  })

  return { photoUrl }
}

/** Removes a student's profile photo, clearing the avatar everywhere. */
export async function removeStudentPhoto(ctx: AppContext, studentId: string): Promise<void> {
  ctx.require('students.edit')
  await assertStudentAccess(ctx, studentId)

  const student = await ctx.db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!student) throw notFound('Student')

  const existing = await ctx.db.document.findMany({
    where: {
      ownerType: 'STUDENT',
      studentId: student.id,
      category: PROFILE_PHOTO_CATEGORY,
      deletedAt: null,
    },
    select: { id: true, storageKey: true },
  })

  await ctx.db.$transaction(async (tx) => {
    if (existing.length > 0) {
      await tx.document.updateMany({
        where: { id: { in: existing.map((e) => e.id) } },
        data: { deletedAt: new Date() },
      })
    }
    await tx.student.update({ where: { id: student.id }, data: { photoUrl: null } })
  })

  await Promise.all(
    existing.map((e) => storageProvider().delete(e.storageKey).catch(() => undefined)),
  )

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'student.photo.remove',
    module: 'students',
    entityType: 'Student',
    entityId: student.id,
    summary: `Removed profile photo for ${student.firstName} ${student.lastName}`.trim(),
  })
}

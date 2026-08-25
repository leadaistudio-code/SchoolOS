import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound, ApiException } from '@/server/api/response'
import { uploadFile } from '@/server/files'
import { storageProvider } from '@/server/providers'
import { PROFILE_PHOTO_CATEGORY, isProfilePhotoMime } from '@/lib/student-documents'

/**
 * A staff member's profile photo.
 *
 * The student equivalent's twin (`students/photo.ts`): same `PROFILE_PHOTO`
 * category, same proxy-path convention on `Staff.photoUrl`, same upload-then-
 * replace ordering. The only difference is the gate — `staff.edit` rather than
 * `students.edit` — and that a staff row is not parent-scoped, so there is no
 * per-record access check beyond the tenant-scoped `ctx.db`.
 */

function photoPathFor(storageKey: string): string {
  return '/api/v1/files/' + encodeURIComponent(storageKey)
}

/** Sets (or replaces) a staff member's profile photo. */
export async function setStaffPhoto(
  ctx: AppContext,
  staffId: string,
  file: File,
): Promise<{ photoUrl: string }> {
  ctx.require('staff.edit')

  // Image-only, enforced server-side: the `accept` attribute on the picker is a
  // hint, not a guarantee, and `uploadFile` on its own would take a PDF here.
  if (!isProfilePhotoMime(file.type)) {
    throw new ApiException(
      415,
      'UNSUPPORTED_FILE_TYPE',
      'A profile photo must be a JPEG, PNG or WebP image',
    )
  }

  const staff = await ctx.db.staff.findFirst({
    where: { id: staffId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!staff) throw notFound('Staff member')

  const previous = await ctx.db.document.findMany({
    where: {
      ownerType: 'STAFF',
      staffId: staff.id,
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
        ownerType: 'STAFF',
        staffId: staff.id,
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

    await tx.staff.update({ where: { id: staff.id }, data: { photoUrl } })
    return doc
  })

  await Promise.all(
    previous.map((p) => storageProvider().delete(p.storageKey).catch(() => undefined)),
  )

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.photo.update',
    module: 'staff',
    entityType: 'Staff',
    entityId: staff.id,
    summary: `Updated profile photo for ${staff.firstName} ${staff.lastName}`.trim(),
    after: created,
  })

  return { photoUrl }
}

/** Removes a staff member's profile photo. */
export async function removeStaffPhoto(ctx: AppContext, staffId: string): Promise<void> {
  ctx.require('staff.edit')

  const staff = await ctx.db.staff.findFirst({
    where: { id: staffId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!staff) throw notFound('Staff member')

  const existing = await ctx.db.document.findMany({
    where: {
      ownerType: 'STAFF',
      staffId: staff.id,
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
    await tx.staff.update({ where: { id: staff.id }, data: { photoUrl: null } })
  })

  await Promise.all(
    existing.map((e) => storageProvider().delete(e.storageKey).catch(() => undefined)),
  )

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.photo.remove',
    module: 'staff',
    entityType: 'Staff',
    entityId: staff.id,
    summary: `Removed profile photo for ${staff.firstName} ${staff.lastName}`.trim(),
  })
}

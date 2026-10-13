import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict } from '@/server/api/response'
import { uploadFile } from '@/server/files'
import { storageProvider } from '@/server/providers'
import { normalizePhone } from '@/server/auth/phone'
import { isProfilePhotoMime } from '@/lib/student-documents'

export const updateOwnProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().max(60).default(''),
  displayName: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
})

function photoPathFor(storageKey: string): string {
  return '/api/v1/files/' + encodeURIComponent(storageKey)
}

function storageKeyFromAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null
  const match = avatarUrl.match(/\/api\/v1\/files\/(.+)$/)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export async function getOwnProfile(ctx: AppContext) {
  const user = await ctx.db.user.findFirst({
    where: { id: ctx.user.userId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      email: true,
      phone: true,
      avatarUrl: true,
    },
  })
  if (!user) throw new ApiException(404, 'NOT_FOUND', 'Account not found')
  return user
}

export async function updateOwnProfile(ctx: AppContext, raw: unknown) {
  const input = updateOwnProfileSchema.parse(raw)
  const phone = input.phone ? normalizePhone(input.phone) : null
  if (input.phone && !phone) {
    throw conflict('Enter a valid mobile number')
  }

  if (phone) {
    const taken = await ctx.db.user.findFirst({
      where: {
        tenantId: ctx.tenant.id,
        phone,
        deletedAt: null,
        NOT: { id: ctx.user.userId },
      },
      select: { id: true },
    })
    if (taken) throw conflict('That mobile number is already used by another account')
  }

  const updated = await ctx.db.user.update({
    where: { id: ctx.user.userId },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: input.displayName,
      phone,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      phone: true,
      email: true,
      avatarUrl: true,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${updated.firstName} ${updated.lastName}`.trim(),
    action: 'account.profile.update',
    module: 'settings',
    entityType: 'User',
    entityId: updated.id,
    summary: 'Updated own profile',
    after: updated,
  })

  return updated
}

export async function setOwnAvatar(ctx: AppContext, file: File): Promise<{ avatarUrl: string }> {
  if (!isProfilePhotoMime(file.type)) {
    throw new ApiException(
      415,
      'UNSUPPORTED_FILE_TYPE',
      'A profile photo must be a JPEG, PNG or WebP image',
    )
  }

  const current = await ctx.db.user.findFirst({
    where: { id: ctx.user.userId, deletedAt: null },
    select: { id: true, avatarUrl: true, firstName: true, lastName: true },
  })
  if (!current) throw new ApiException(404, 'NOT_FOUND', 'Account not found')

  const previousKey = storageKeyFromAvatarUrl(current.avatarUrl)
  const stored = await uploadFile(ctx, file, 'avatars')
  const avatarUrl = photoPathFor(stored.storageKey)

  await ctx.db.user.update({
    where: { id: current.id },
    data: { avatarUrl },
  })

  if (previousKey && previousKey !== stored.storageKey) {
    await storageProvider().delete(previousKey).catch(() => undefined)
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${current.firstName} ${current.lastName}`.trim(),
    action: 'account.avatar.update',
    module: 'settings',
    entityType: 'User',
    entityId: current.id,
    summary: 'Updated own profile photo',
  })

  return { avatarUrl }
}

export async function removeOwnAvatar(ctx: AppContext): Promise<void> {
  const current = await ctx.db.user.findFirst({
    where: { id: ctx.user.userId, deletedAt: null },
    select: { id: true, avatarUrl: true, firstName: true, lastName: true },
  })
  if (!current) throw new ApiException(404, 'NOT_FOUND', 'Account not found')

  const previousKey = storageKeyFromAvatarUrl(current.avatarUrl)
  await ctx.db.user.update({
    where: { id: current.id },
    data: { avatarUrl: null },
  })
  if (previousKey) {
    await storageProvider().delete(previousKey).catch(() => undefined)
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${current.firstName} ${current.lastName}`.trim(),
    action: 'account.avatar.remove',
    module: 'settings',
    entityType: 'User',
    entityId: current.id,
    summary: 'Removed own profile photo',
  })
}

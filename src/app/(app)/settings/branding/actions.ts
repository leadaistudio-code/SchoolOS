'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/server/context'
import { audit } from '@/server/audit'
import { uploadAndSaveBrandingAsset, type BrandingAssetKind } from '@/server/branding-assets'

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour such as #E41F07')

export const brandingSchema = z.object({
  primaryHex: hex,
  accentHex: hex,
  secondaryHex: hex,
  radius: z.enum(['4px', '6px', '8px', '12px', '16px']),
  loginHeadline: z.string().trim().max(120).optional(),
  loginSubtext: z.string().trim().max(200).optional(),
  footerText: z.string().trim().max(200).optional(),
})

export type BrandingResult = { ok: boolean; message: string }

export async function uploadBrandingAssetAction(
  formData: FormData,
): Promise<BrandingResult> {
  const ctx = await requireContext('settings.branding')
  const kind = formData.get('kind')
  const file = formData.get('file')

  if (kind !== 'logo' && kind !== 'banner') {
    return { ok: false, message: 'Unknown asset type' }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose an image to upload' }
  }

  try {
    await uploadAndSaveBrandingAsset(ctx.tenant.id, file, kind as BrandingAssetKind)

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'branding.asset.upload',
      module: 'settings',
      entityType: 'Branding',
      summary: `Uploaded ${kind} image`,
    })

    revalidatePath('/', 'layout')
    revalidatePath('/settings/branding')

    return {
      ok: true,
      message: kind === 'logo' ? 'Header logo updated.' : 'Login banner updated.',
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The image could not be uploaded',
    }
  }
}

/**
 * Saves the school's palette.
 *
 * This is the control surface for the theme engine: the values written here
 * are emitted as CSS custom properties on the next request, so the change is
 * live everywhere without a rebuild.
 */
export async function saveBrandingAction(payload: unknown): Promise<BrandingResult> {
  const ctx = await requireContext('settings.branding')

  try {
    const input = brandingSchema.parse(payload)

    const school = await ctx.db.school.findFirst({ select: { id: true } })
    if (!school) return { ok: false, message: 'No school profile found for this tenant' }

    const before = await ctx.db.branding.findFirst({ where: { schoolId: school.id } })

    await ctx.db.branding.upsert({
      where: { schoolId: school.id },
      create: { tenantId: ctx.tenant.id, schoolId: school.id, ...input },
      update: input,
    })

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'branding.update',
      module: 'settings',
      entityType: 'Branding',
      entityId: school.id,
      summary: `Updated school branding to ${input.primaryHex}`,
      before,
      after: input,
    })

    // The palette is read in the root layout, so every route revalidates.
    revalidatePath('/', 'layout')

    return { ok: true, message: 'Branding saved. The new colours are live across the portal.' }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, message: err.issues[0]?.message ?? 'Invalid branding' }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The branding could not be saved',
    }
  }
}

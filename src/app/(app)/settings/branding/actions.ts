'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/server/context'
import { audit } from '@/server/audit'
import { uploadAndSaveBrandingAsset, deleteBrandingAsset, type BrandingAssetKind } from '@/server/branding-assets'

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour such as #E41F07')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v))

// Keep schema private — Next.js "use server" files may only export async functions.
const brandingSchema = z.object({
  primaryHex: hex,
  accentHex: hex,
  secondaryHex: hex,
  radius: z.enum(['4px', '6px', '8px', '12px', '16px']),
  loginHeadline: optionalText(120),
  loginSubtext: optionalText(200),
  footerText: optionalText(200),
  pdfHeaderHtml: optionalText(4000),
  pdfFooterHtml: optionalText(4000),
  pwaName: optionalText(60),
  pwaShortName: optionalText(20),
  pwaThemeHex: hex.optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
})

type BrandingResult = { ok: boolean; message: string }

const ASSET_KINDS = new Set<BrandingAssetKind>([
  'logo',
  'banner',
  'favicon',
  'darkLogo',
  'signature',
  'letterheadHeader',
  'letterheadFooter',
])

export async function uploadBrandingAssetAction(
  formData: FormData,
): Promise<BrandingResult> {
  const ctx = await requireContext('settings.branding')
  const kind = String(formData.get('kind') ?? '') as BrandingAssetKind
  const file = formData.get('file')

  if (!ASSET_KINDS.has(kind)) {
    return { ok: false, message: 'Unknown asset type' }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose an image to upload' }
  }

  try {
    await uploadAndSaveBrandingAsset(ctx.tenant.id, file, kind)

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
    revalidatePath('/manifest.webmanifest')

    return { ok: true, message: `${kind} image updated.` }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The image could not be uploaded',
    }
  }
}

export async function deleteBrandingAssetAction(
  formData: FormData,
): Promise<BrandingResult> {
  const ctx = await requireContext('settings.branding')
  const kind = String(formData.get('kind') ?? '') as BrandingAssetKind

  if (!ASSET_KINDS.has(kind)) {
    return { ok: false, message: 'Unknown asset type' }
  }

  try {
    await deleteBrandingAsset(ctx.tenant.id, kind)

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'branding.asset.delete',
      module: 'settings',
      entityType: 'Branding',
      summary: `Removed ${kind} image`,
    })

    revalidatePath('/', 'layout')
    revalidatePath('/settings/branding')
    revalidatePath('/manifest.webmanifest')

    return { ok: true, message: `${kind} image removed.` }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The image could not be removed',
    }
  }
}

/**
 * Saves the school's palette and white-label copy.
 */
export async function saveBrandingAction(payload: unknown): Promise<BrandingResult> {
  const ctx = await requireContext('settings.branding')

  try {
    const input = brandingSchema.parse(payload)

    const school = await ctx.db.school.findFirst({ select: { id: true } })
    if (!school) return { ok: false, message: 'No school profile found for this tenant' }

    const before = await ctx.db.branding.findFirst({ where: { schoolId: school.id } })

    const data = {
      primaryHex: input.primaryHex,
      accentHex: input.accentHex,
      secondaryHex: input.secondaryHex,
      radius: input.radius,
      loginHeadline: input.loginHeadline ?? null,
      loginSubtext: input.loginSubtext ?? null,
      footerText: input.footerText ?? null,
      pdfHeaderHtml: input.pdfHeaderHtml ?? null,
      pdfFooterHtml: input.pdfFooterHtml ?? null,
      pwaName: input.pwaName ?? null,
      pwaShortName: input.pwaShortName ?? null,
      pwaThemeHex: input.pwaThemeHex ?? null,
    }

    await ctx.db.branding.upsert({
      where: { schoolId: school.id },
      create: { tenantId: ctx.tenant.id, schoolId: school.id, ...data },
      update: data,
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
      after: data,
    })

    revalidatePath('/', 'layout')
    revalidatePath('/settings/branding')
    revalidatePath('/manifest.webmanifest')

    return { ok: true, message: 'Branding saved. Colours and PWA details are live.' }
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

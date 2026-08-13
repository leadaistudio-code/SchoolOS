import { storageProvider } from '@/server/providers'
import { prisma } from '@/server/db/prisma'
import { env } from '@/lib/env'
import { ApiException } from '@/server/api/response'

export type BrandingAssetKind = 'logo' | 'banner' | 'favicon' | 'darkLogo' | 'signature'

const IMAGE_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/x-icon', 'ico'],
  ['image/vnd.microsoft.icon', 'ico'],
])

const SIGNATURES: Record<string, string[]> = {
  'image/jpeg': ['ffd8ff'],
  'image/png': ['89504e47'],
  'image/webp': ['52494646'],
  'image/x-icon': ['00000100'],
  'image/vnd.microsoft.icon': ['00000100'],
}

const FIELD: Record<
  BrandingAssetKind,
  'logoUrl' | 'loginImageUrl' | 'faviconUrl' | 'darkLogoUrl' | 'signatureUrl'
> = {
  logo: 'logoUrl',
  banner: 'loginImageUrl',
  favicon: 'faviconUrl',
  darkLogo: 'darkLogoUrl',
  signature: 'signatureUrl',
}

function signatureMatches(buffer: Buffer, mimeType: string): boolean {
  const expected = SIGNATURES[mimeType]
  if (!expected) return true // ico variants vary; allow after mime check
  const head = buffer.subarray(0, 8).toString('hex')
  return expected.some((prefix) => head.startsWith(prefix))
}

/** Public URL served without authentication (login page, PWA, etc.). */
export function brandingAssetPublicUrl(kind: BrandingAssetKind): string {
  return `/api/v1/branding/${kind}`
}

/**
 * Maps a stored branding value to a browser-safe URL.
 * Supports external URLs, legacy public paths, and tenant storage keys.
 */
export function resolveBrandingAssetUrl(
  stored: string | null | undefined,
  kind: BrandingAssetKind,
): string | null {
  if (!stored) return null
  if (stored.startsWith('http://') || stored.startsWith('https://')) return stored
  if (stored.startsWith('/api/v1/branding/')) return stored
  return brandingAssetPublicUrl(kind)
}

function assertImageFile(file: File, kind: BrandingAssetKind) {
  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024
  if (file.size === 0) throw new ApiException(400, 'BAD_REQUEST', 'The file is empty')
  if (file.size > maxBytes) {
    throw new ApiException(
      413,
      'FILE_TOO_LARGE',
      `Images must be ${env().MAX_UPLOAD_MB}MB or smaller`,
    )
  }
  if (kind === 'favicon') {
    if (!IMAGE_TYPES.has(file.type) && file.type !== 'image/png') {
      throw new ApiException(415, 'UNSUPPORTED_FILE_TYPE', 'Favicon must be PNG, JPEG, WebP or ICO')
    }
    return
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new ApiException(
      415,
      'UNSUPPORTED_FILE_TYPE',
      'Images must be JPEG, PNG or WebP',
    )
  }
}

/** Stores a school branding image under the tenant prefix. */
export async function uploadBrandingAsset(
  tenantId: string,
  file: File,
  kind: BrandingAssetKind,
): Promise<string> {
  assertImageFile(file, kind)

  const buffer = Buffer.from(await file.arrayBuffer())
  if (SIGNATURES[file.type] && !signatureMatches(buffer, file.type)) {
    throw new ApiException(
      415,
      'UNSUPPORTED_FILE_TYPE',
      'The file contents do not match the type it claims to be',
    )
  }

  const extension = IMAGE_TYPES.get(file.type) ?? 'png'
  const storageKey = `${tenantId}/branding/${kind}.${extension}`

  await storageProvider().put(storageKey, buffer, file.type || 'image/png')
  return storageKey
}

/** Persists a branding asset key on the school's Branding row. */
export async function saveBrandingAsset(
  tenantId: string,
  kind: BrandingAssetKind,
  storageKey: string,
) {
  const school = await prisma.school.findFirst({
    where: { tenantId },
    select: { id: true, branding: { select: { id: true } } },
  })
  if (!school) throw new ApiException(404, 'NOT_FOUND', 'School not found')

  const field = FIELD[kind]
  await prisma.branding.upsert({
    where: { schoolId: school.id },
    create: { tenantId, schoolId: school.id, [field]: storageKey },
    update: { [field]: storageKey },
  })

  return storageKey
}

export async function readBrandingAsset(tenantId: string, kind: BrandingAssetKind) {
  const school = await prisma.school.findFirst({
    where: { tenantId },
    select: {
      branding: {
        select: {
          logoUrl: true,
          loginImageUrl: true,
          faviconUrl: true,
          darkLogoUrl: true,
          signatureUrl: true,
        },
      },
    },
  })

  const b = school?.branding
  const stored =
    kind === 'logo'
      ? b?.logoUrl
      : kind === 'banner'
        ? b?.loginImageUrl
        : kind === 'favicon'
          ? b?.faviconUrl
          : kind === 'darkLogo'
            ? b?.darkLogoUrl
            : b?.signatureUrl

  if (!stored) return null
  if (stored.startsWith('http://') || stored.startsWith('https://')) return null
  if (stored.startsWith('/api/v1/branding/')) return null

  const storageKey = stored

  try {
    const body = await storageProvider().get(storageKey)
    const mimeType =
      storageKey.endsWith('.jpg') || storageKey.endsWith('.jpeg')
        ? 'image/jpeg'
        : storageKey.endsWith('.webp')
          ? 'image/webp'
          : storageKey.endsWith('.ico')
            ? 'image/x-icon'
            : 'image/png'

    return { body, mimeType, storageKey }
  } catch {
    return null
  }
}

/** Upload and persist in one step (platform provisioning, settings). */
export async function uploadAndSaveBrandingAsset(
  tenantId: string,
  file: File,
  kind: BrandingAssetKind,
) {
  const storageKey = await uploadBrandingAsset(tenantId, file, kind)
  await saveBrandingAsset(tenantId, kind, storageKey)
  return storageKey
}

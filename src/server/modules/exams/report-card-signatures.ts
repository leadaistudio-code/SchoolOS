import type { AppContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { uploadFile } from '@/server/files'
import { audit } from '@/server/audit'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 2 * 1024 * 1024

/**
 * Stores a signatory's signature image for report card templates.
 *
 * Only the file is stored here; it is attached to a template when the template
 * (or the design studio) is saved, which is where the change is audited.
 */
export async function uploadReportCardSignature(ctx: AppContext, file: File): Promise<{ url: string }> {
  ctx.require('exams.manage')
  if (!IMAGE_TYPES.has(file.type)) {
    throw new ApiException(415, 'UNSUPPORTED_FILE_TYPE', 'A signature must be a PNG, JPEG or WebP image')
  }
  if (file.size > MAX_BYTES) {
    throw new ApiException(413, 'FILE_TOO_LARGE', 'Signature images must be 2 MB or smaller')
  }
  const stored = await uploadFile(ctx, file, 'report-card-signatures')
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'report_card.signature.upload',
    module: 'exams',
    entityType: 'ReportCardTemplate',
    summary: 'Uploaded a report card signature image',
  })
  return { url: '/api/v1/files/' + encodeURIComponent(stored.storageKey) }
}

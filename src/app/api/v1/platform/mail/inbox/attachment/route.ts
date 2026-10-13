import { platformRoute } from '@/server/api/handler'
import { badRequest } from '@/server/api/response'
import { readInboxAttachment } from '@/server/modules/platform/mail/inbox'
import { INLINE_SAFE, fileResponse } from '@/server/modules/platform/mail/download'

export const GET = platformRoute(async (req, ctx) => {
  const sp = new URL(req.url).searchParams
  const box = sp.get('box')
  const folder = sp.get('folder')
  const uid = Number(sp.get('uid'))
  const part = Number(sp.get('part'))
  if (!box || !folder || !Number.isInteger(uid) || uid < 1 || !Number.isInteger(part) || part < 0) {
    throw badRequest('Missing attachment reference')
  }
  const file = await readInboxAttachment(ctx, box, folder, uid, part)
  // The sender chose this content type; only the inline-safe ones are passed on.
  const mimeType = INLINE_SAFE.has(file.mimeType.toLowerCase()) ? file.mimeType.toLowerCase() : 'application/octet-stream'
  return fileResponse(req, { body: file.body, mimeType, fileName: file.fileName })
})

import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { readFileForCaller } from '@/server/files'

/**
 * GET /api/v1/files/{key}
 *
 * Every download is authenticated, tenant-checked and permission-checked. A
 * storage key on its own grants nothing: the object must belong to this tenant
 * and be referenced by a row the caller is allowed to see.
 */
export const GET = route(async (_req: NextRequest, ctx, params) => {
  const key = decodeURIComponent(params.key!)
  const file = await readFileForCaller(ctx, key)

  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.body.length),
      // Attachment, not inline: an uploaded HTML/SVG file must never execute
      // in the application origin.
      'Content-Disposition': `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
    },
  })
})

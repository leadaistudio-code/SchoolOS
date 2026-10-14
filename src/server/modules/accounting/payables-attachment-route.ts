import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ApiException, ok } from '@/server/api/response'
import {
  attachPayablesDocument,
  readPayablesDocument,
  type PayablesDocumentKind,
} from './payables-service'

/** GET downloads, POST (multipart `file`) replaces the supporting document. */
export function payablesAttachmentRoute(kind: PayablesDocumentKind) {
  return {
    GET: route(
      async (_req: NextRequest, ctx, params) => {
        const file = await readPayablesDocument(ctx, kind, params.id!)
        return new Response(new Uint8Array(file.body), {
          headers: {
            'Content-Type': file.mimeType,
            'Content-Length': String(file.body.length),
            'Content-Disposition': `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, max-age=300',
          },
        })
      },
      { permission: 'accounts.view' },
    ),
    POST: route(
      async (req: NextRequest, ctx, params) => {
        const form = await req.formData()
        const file = form.get('file')
        if (!(file instanceof File)) throw new ApiException(400, 'BAD_REQUEST', 'No file was uploaded')
        return ok(await attachPayablesDocument(ctx, kind, params.id!, file), undefined, { status: 201 })
      },
      { permission: 'accounts.manage', rateLimitKey: 'mutation' },
    ),
  }
}

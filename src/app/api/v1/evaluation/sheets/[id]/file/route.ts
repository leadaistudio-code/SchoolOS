import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { readAnswerSheetFile } from '@/server/modules/evaluation/service'

/** Inline preview for review desk (images/PDF). */
export const GET = route(
  async (_req: NextRequest, ctx, params) => {
    const file = await readAnswerSheetFile(ctx, params.id!)
    const inline = file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf'
    return new Response(new Uint8Array(file.body), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(file.body.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${file.fileName.replace(/"/g, '')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=120',
      },
    })
  },
  { permission: 'assessments.evaluate' },
)

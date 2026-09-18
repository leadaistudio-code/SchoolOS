import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { buildSchoolDataExport } from '@/server/modules/settings/data-export'

/**
 * GET /api/v1/settings/data-export
 *
 * One-click school archive: ZIP of CSVs covering every module the caller may
 * export. Returned as a file download rather than the usual JSON envelope.
 */
export const GET = route(
  async (_req: NextRequest, ctx) => {
    const { filename, bytes } = await buildSchoolDataExport(ctx)
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  },
  { permission: 'settings.export', rateLimitKey: 'mutation' },
)

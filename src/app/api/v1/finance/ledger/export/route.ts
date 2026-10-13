import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import {
  exportStudentFeeLedger,
  feeLedgerExportQuerySchema,
} from '@/server/modules/finance/simplicity'

/**
 * GET /api/v1/finance/ledger/export?format=csv|xlsx|tally|pdf&q=&classLevelId=&sectionId=&balance=
 *
 * Same filters as Ledger list. PDF is a printable HTML report.
 */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const query = feeLedgerExportQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )
    const file = await exportStudentFeeLedger(ctx, query)
    const disposition = query.format === 'pdf' ? 'inline' : 'attachment'

    return new Response(new Uint8Array(file.body), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `${disposition}; filename="${file.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    })
  },
  { permission: 'fees.export' },
)

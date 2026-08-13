import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { exportReport } from '@/server/modules/reports/export'

/**
 * GET /api/v1/reports/export?report=&table=&from=&to=
 *
 * Returns a CSV attachment rather than the usual JSON envelope: the caller is
 * a browser following a link, and a download is the whole point.
 */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const query = Object.fromEntries(req.nextUrl.searchParams.entries())
    const { filename, csv } = await exportReport(ctx, query)

    // The BOM keeps Excel from mangling non-ASCII names on Windows.
    return new Response(`﻿${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  },
  { permission: 'reports.export' },
)

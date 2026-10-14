import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getDayBook } from '@/server/modules/accounting/day-book-service'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const book = await getDayBook(ctx, Object.fromEntries(req.nextUrl.searchParams))
    const { rows, page, pageSize, total, ...summary } = book
    return ok({ ...summary, rows }, { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
  },
  { permission: 'accounts.view' },
)

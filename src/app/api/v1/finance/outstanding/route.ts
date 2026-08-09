import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { outstandingByClass } from '@/server/modules/finance/service'

/** Outstanding grouped by class - the view collection chasing is driven from. */
export const GET = route(
  async (_req, ctx) => {
    const rows = await outstandingByClass(ctx)
    return ok(
      rows.map((r) => ({
        className: r.className,
        students: Number(r.students),
        outstandingMinor: Number(r.outstanding),
        overdueMinor: Number(r.overdue),
      })),
    )
  },
  { permission: 'fees.view' },
)

import { route } from '@/server/api/handler'
import { getPendingRefreshers } from '@/server/modules/teacher-refresh/service'
import { ok } from '@/server/api/response'

export const GET = route(
  async (_req, ctx) => {
    const staff = await ctx.db.staff.findFirst({ 
      where: { userId: ctx.user.userId, tenantId: ctx.tenant.id, deletedAt: null } 
    })
    if (!staff) return ok({ pending: [] })

    const pending = await getPendingRefreshers(ctx, staff.id)
    return ok({ pending })
  }
)

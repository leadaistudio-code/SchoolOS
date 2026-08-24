import { nextContext } from '@/server/context/next'
import { getPendingRefreshers } from '@/server/modules/teacher-refresh/service'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const ctx = await nextContext(req)
  const staff = await ctx.db.staff.findFirst({ 
    where: { userId: ctx.user.userId, tenantId: ctx.tenant.id, deletedAt: null } 
  })
  if (!staff) return NextResponse.json({ pending: [] })

  const pending = await getPendingRefreshers(ctx, staff.id)
  return NextResponse.json({ pending })
}

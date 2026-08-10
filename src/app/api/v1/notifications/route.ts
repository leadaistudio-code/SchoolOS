import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'

/**
 * The notification bell's feed.
 *
 * Always the signed-in user's own rows — there is no `userId` parameter to
 * tamper with. The category is derived from the event key rather than stored,
 * so a new notification type groups itself without a migration.
 */
export const GET = route(async (_req: NextRequest, ctx) => {
  const [rows, unread] = await Promise.all([
    ctx.db.notification.findMany({
      where: { userId: ctx.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        eventKey: true,
        title: true,
        body: true,
        linkUrl: true,
        readAt: true,
        createdAt: true,
      },
    }),
    ctx.db.notification.count({ where: { userId: ctx.user.userId, readAt: null } }),
  ])

  return ok({
    unread,
    rows: rows.map((row) => ({ ...row, category: categoryOf(row.eventKey) })),
  })
})

/** Marks one notification, or everything unread, as read. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const body = (await req.json().catch(() => ({}))) as { id?: string }

    const result = await ctx.db.notification.updateMany({
      where: {
        userId: ctx.user.userId,
        readAt: null,
        ...(body.id ? { id: body.id } : {}),
      },
      data: { readAt: new Date() },
    })

    return ok({ marked: result.count })
  },
  { rateLimitKey: 'mutation' },
)

export type NotificationCategory =
  | 'Attendance'
  | 'Fees'
  | 'Admissions'
  | 'Transport'
  | 'Academic'
  | 'System'

function categoryOf(eventKey: string): NotificationCategory {
  const domain = eventKey.split('.')[0]
  switch (domain) {
    case 'attendance':
      return 'Attendance'
    case 'fees':
    case 'invoice':
    case 'payment':
      return 'Fees'
    case 'admissions':
    case 'lead':
      return 'Admissions'
    case 'transport':
      return 'Transport'
    case 'exam':
    case 'exams':
    case 'result':
    case 'results':
    case 'homework':
    case 'notice':
      return 'Academic'
    default:
      return 'System'
  }
}

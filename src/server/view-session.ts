import { cache } from 'react'
import { cookies } from 'next/headers'
import type { AppContext } from '@/server/context'
import { schoolToday } from '@/lib/periods'

/**
 * The academic session the finance pages are looking at.
 *
 * Choosing one is a viewing preference, kept in a cookie for this browser. It
 * never changes the school's current session, which is a Settings decision
 * that moves enrolments; a stale or foreign id simply falls back to the
 * current session.
 */
export const VIEW_SESSION_COOKIE = 'mcv_view_session'

export type ViewSession = {
  id: string
  name: string
  /** First and last day of the session, YYYY-MM-DD. */
  startsOn: string
  endsOn: string
  isCurrent: boolean
  /** The session's dates up to today: the default period for date-based pages. */
  range: { from: string; to: string }
}

type SessionRow = { id: string; name: string; startsOn: Date; endsOn: Date; isCurrent: boolean }

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function toViewSession(row: SessionRow, today: string = schoolToday()): ViewSession {
  const startsOn = iso(row.startsOn)
  const endsOn = iso(row.endsOn)
  // The current session runs to today even past its end date: a school that
  // has not rolled over yet must still see this week's receipts.
  const to = startsOn <= today && (endsOn > today || row.isCurrent) ? today : endsOn
  return { id: row.id, name: row.name, startsOn, endsOn, isCurrent: row.isCurrent, range: { from: startsOn, to } }
}

const SELECT = { id: true, name: true, startsOn: true, endsOn: true, isCurrent: true } as const

/** All sessions, newest first, for the header dropdown. */
export const listViewSessions = cache(async (ctx: AppContext): Promise<ViewSession[]> => {
  const rows = await ctx.db.academicSession.findMany({ orderBy: { startsOn: 'desc' }, select: SELECT })
  const today = schoolToday()
  return rows.map((r) => toViewSession(r, today))
})

/** The chosen session, else the current one, else the latest; null before any session exists. */
export const getViewSession = cache(async (ctx: AppContext): Promise<ViewSession | null> => {
  const sessions = await listViewSessions(ctx)
  if (sessions.length === 0) return null
  const chosen = (await cookies()).get(VIEW_SESSION_COOKIE)?.value
  return (
    (chosen ? sessions.find((s) => s.id === chosen) : undefined) ??
    sessions.find((s) => s.isCurrent) ??
    sessions[0]!
  )
})

/** Preset value that keeps a list unbounded instead of defaulting to the session. */
export const ALL_DATES = 'all'

/**
 * For list filters with a period preset: no preset and no dates means the
 * viewed session's dates; `preset=all` means no date limit at all.
 */
export function withSessionPeriod<T extends { preset?: string; from?: string; to?: string }>(
  filter: T,
  view: ViewSession | null,
): T {
  if (filter.preset === ALL_DATES) return { ...filter, preset: undefined }
  if (filter.preset || filter.from || filter.to || !view) return filter
  return { ...filter, from: view.range.from, to: view.range.to }
}

/**
 * Default period for pages that already have their own default (accounts use
 * the financial year to date): that default stays for the current session,
 * and a past session picked in the header swaps in that session's dates.
 */
export async function viewedPeriodOr(
  ctx: AppContext,
  fallback: { from: string; to: string },
): Promise<{ from: string; to: string }> {
  const view = await getViewSession(ctx)
  return view && !view.isCurrent ? view.range : fallback
}

/** Explicit dates win; otherwise the viewed session's dates. */
export function periodOrSession(
  view: ViewSession | null,
  from: string | undefined,
  to: string | undefined,
): { from?: string; to?: string } {
  if (from || to || !view) return { from, to }
  return view.range
}

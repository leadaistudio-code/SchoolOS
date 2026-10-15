'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import { VIEW_SESSION_COOKIE, listViewSessions } from '@/server/view-session'

/** Switches the session the finance pages show, for this browser only. */
export async function setViewSessionAction(sessionId: string): Promise<{ ok: boolean }> {
  const ctx = await requireContext()
  const sessions = await listViewSessions(ctx)
  const target = sessions.find((s) => s.id === sessionId)
  if (!target) return { ok: false }

  const jar = await cookies()
  if (target.isCurrent) {
    jar.delete(VIEW_SESSION_COOKIE)
  } else {
    jar.set(VIEW_SESSION_COOKIE, target.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  revalidatePath('/', 'layout')
  return { ok: true }
}

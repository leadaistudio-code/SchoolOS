import { NextResponse } from 'next/server'
import { getSessionUser } from '@/server/auth/session'
import { stopImpersonation } from '@/server/modules/platform/impersonation'
import { env } from '@/lib/env'
import { platformUrl } from '@/server/tenant'

export async function POST() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.redirect(new URL('/login', env().APP_URL))
    }

    const result = await stopImpersonation(user.sessionId, user.impersonatedById)
    return NextResponse.redirect(result.redirectTo)
  } catch {
    return NextResponse.redirect(platformUrl('/platform'))
  }
}

import { NextResponse } from 'next/server'
import { getContext } from '@/server/context'
import { joinLiveClass } from '@/server/modules/lms/live'

/** Relative, so the browser stays on the school's own hostname behind the proxy. */
function goTo(location: string) {
  return new NextResponse(null, { status: 307, headers: { Location: location } })
}

/** Records that the student joined, then hands them to Zoom / Meet. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext()
  if (!ctx) return goTo(`/login?next=${encodeURIComponent('/my/learning/live')}`)
  try {
    return NextResponse.redirect(await joinLiveClass(ctx, id))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not join the class'
    return goTo(`/my/learning/live?error=${encodeURIComponent(message)}`)
  }
}

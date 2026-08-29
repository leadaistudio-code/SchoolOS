'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { issueParentPortalLogin } from '@/server/modules/people/service'

/**
 * Issues a portal login for a parent who does not yet have one.
 * Redirects to the profile with the one-time password in `?welcome=`.
 */
export async function issueParentPortalLoginAction(parentId: string): Promise<void> {
  const ctx = await requireContext()
  if (!ctx.can('users.create') && !ctx.can('parents.create') && !ctx.can('parents.edit')) {
    ctx.require('parents.edit')
  }

  try {
    const { temporaryPassword } = await issueParentPortalLogin(ctx, parentId)
    revalidatePath(`/parents/${parentId}`)
    redirect(`/parents/${parentId}?welcome=${encodeURIComponent(temporaryPassword)}`)
  } catch (err) {
    if (isRedirectError(err)) throw err
    const message =
      err instanceof ApiException
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Could not issue a portal login'
    redirect(`/parents/${parentId}?issueError=${encodeURIComponent(message)}`)
  }
}

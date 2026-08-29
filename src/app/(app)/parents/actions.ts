'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
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

  const { temporaryPassword } = await issueParentPortalLogin(ctx, parentId)

  revalidatePath(`/parents/${parentId}`)
  redirect(`/parents/${parentId}?welcome=${encodeURIComponent(temporaryPassword)}`)
}

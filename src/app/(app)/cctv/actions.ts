'use server'

import { requireContext } from '@/server/context'
import { issueViewGrant, type ViewGrant } from '@/server/modules/cctv/service'

export async function viewGrantAction(refresh: boolean): Promise<{ ok: true; grant: ViewGrant } | { ok: false; message: string }> {
  const ctx = await requireContext()
  try {
    return { ok: true, grant: await issueViewGrant(ctx, { refresh }) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not start live view' }
  }
}

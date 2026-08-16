'use server'

import { redirect } from 'next/navigation'
import { redeemPasswordForm } from '@/server/auth/redeem-form'
import type { FormState } from '@/lib/form-state'

export async function acceptInviteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const state = await redeemPasswordForm('INVITE', formData)
  if (state.ok) redirect('/login?notice=account-ready')
  return state
}

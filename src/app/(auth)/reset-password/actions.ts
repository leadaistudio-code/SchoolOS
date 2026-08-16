'use server'

import { redirect } from 'next/navigation'
import { redeemPasswordForm } from '@/server/auth/redeem-form'
import type { FormState } from '@/lib/form-state'

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const state = await redeemPasswordForm('PASSWORD_RESET', formData)
  // Sign-in is deliberate rather than automatic, so MFA still stands between a
  // redeemed link and an active session.
  if (state.ok) redirect('/login?notice=password-set')
  return state
}

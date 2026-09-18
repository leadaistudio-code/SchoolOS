import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { getContext } from '@/server/context'
import { passwordMinLength, passwordPolicyHint } from '@/server/auth/password'
import { PasswordForm } from './password-form'

export const metadata = { title: 'Change password' }

export default async function ChangePasswordPage() {
  // Use getContext — not requireContext — so mustChangePassword users are not
  // redirected back to this page in a loop (which renders as a blank screen).
  const ctx = await getContext()
  if (!ctx) redirect('/login')

  return (
    <div className="max-w-lg">
      <PageHeader
        title="Change your password"
        description={
          ctx.user.mustChangePassword
            ? 'Your school requires you to set a new password before continuing.'
            : 'Choose a new password for your account.'
        }
      />
      <PasswordForm
        minLength={passwordMinLength(ctx.user.roleKeys)}
        hint={passwordPolicyHint(ctx.user.roleKeys)}
        forced={ctx.user.mustChangePassword}
      />
    </div>
  )
}

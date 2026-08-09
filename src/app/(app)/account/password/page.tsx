import { PageHeader } from '@/components/page-header'
import { requireContext } from '@/server/context'
import { PasswordForm } from './password-form'
import { env } from '@/lib/env'

export const metadata = { title: 'Change password' }

export default async function ChangePasswordPage() {
  const ctx = await requireContext()

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
      <PasswordForm minLength={env().PASSWORD_MIN_LENGTH} forced={ctx.user.mustChangePassword} />
    </div>
  )
}

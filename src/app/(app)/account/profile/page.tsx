import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card, CardContent } from '@/components/ui/card'
import { getContext } from '@/server/context'
import { getOwnProfile } from '@/server/modules/account/profile'
import { ProfileForm } from './profile-form'

export const metadata = { title: 'Edit profile' }

export default async function EditProfilePage() {
  const ctx = await getContext()
  if (!ctx) redirect('/login')

  const profile = await getOwnProfile(ctx)

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Edit profile"
        description="Update how your name and photo appear in MyCampusView."
        actions={<BackButton fallbackHref="/" />}
      />
      <Card>
        <CardContent className="pt-5">
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>
    </div>
  )
}

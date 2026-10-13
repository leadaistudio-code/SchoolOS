'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { EditableAvatar } from '@/components/ui/editable-avatar'
import { useToast } from '@/components/ui/toast'
import {
  removeOwnAvatarAction,
  updateProfileAction,
  uploadOwnAvatarAction,
} from './actions'

export function ProfileForm({
  profile,
}: {
  profile: {
    firstName: string
    lastName: string
    displayName: string | null
    email: string | null
    phone: string | null
    avatarUrl: string | null
  }
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await updateProfileAction(formData)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Profile saved' : 'Could not save',
        description: result.message,
      })
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <EditableAvatar
          firstName={profile.firstName}
          lastName={profile.lastName}
          photoUrl={profile.avatarUrl}
          canEdit
          uploadAction={uploadOwnAvatarAction}
          removeAction={removeOwnAvatarAction}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Profile photo</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            JPEG, PNG or WebP. Click the photo to upload or replace.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="profile-first" required>
            <Input
              id="profile-first"
              name="firstName"
              defaultValue={profile.firstName}
              required
              maxLength={60}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name" htmlFor="profile-last">
            <Input
              id="profile-last"
              name="lastName"
              defaultValue={profile.lastName}
              maxLength={60}
              autoComplete="family-name"
            />
          </Field>
        </div>

        <Field
          label="Display name / alias"
          htmlFor="profile-alias"
          hint="Shown in the top bar instead of your full name. Leave blank to use first + last name."
        >
          <Input
            id="profile-alias"
            name="displayName"
            defaultValue={profile.displayName ?? ''}
            maxLength={80}
            placeholder="e.g. Principal Sharma"
            autoComplete="nickname"
          />
        </Field>

        <Field
          label="Mobile number"
          htmlFor="profile-phone"
          hint="Used for WhatsApp / SMS alerts when your school has messaging enabled."
        >
          <Input
            id="profile-phone"
            name="phone"
            type="tel"
            defaultValue={profile.phone ?? ''}
            maxLength={20}
            placeholder="10-digit mobile number"
            autoComplete="tel"
          />
        </Field>

        <Field label="Email" htmlFor="profile-email" hint="Contact your school admin to change email.">
          <Input
            id="profile-email"
            value={profile.email ?? ''}
            disabled
            readOnly
            autoComplete="email"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </form>
    </div>
  )
}

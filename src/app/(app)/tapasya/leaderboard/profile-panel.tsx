'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { AVATAR_KEYS } from '@/lib/tapasya/alias'
import { cn } from '@/lib/utils'
import { api } from '../_components/api'
import { CheckRow } from '../_components/check-row'
import { AVATAR_ICON } from '../_components/alias-avatar'

type Profile = { alias: string; avatarKey: string; showBadges: boolean; division: string | null; status: string; consentAt: string | null }

const DIVISIONS = [
  { value: '', label: 'Open (everyone)' },
  { value: 'GRADES_6_8', label: 'Grades 6–8' },
  { value: 'GRADES_9_10', label: 'Grades 9–10' },
  { value: 'GRADES_11_12', label: 'Grades 11–12' },
]

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger'; help: string }> = {
  ACTIVE: { label: 'Visible', tone: 'success', help: 'Your alias and XP appear on the global board.' },
  PENDING_GUARDIAN: { label: 'Waiting for guardian', tone: 'warning', help: 'A parent or guardian must approve before your alias appears. They can do this from the MyCampusView parent app.' },
  OPTED_OUT: { label: 'Not on the board', tone: 'neutral', help: 'You left, or your guardian did not approve. Your XP still counts for you, and you can ask again.' },
  SUSPENDED: { label: 'Hidden', tone: 'danger', help: 'Your profile is hidden while MyCampusView reviews it. Your XP is kept.' },
  SCHOOL_DISABLED: { label: 'Paused by school', tone: 'neutral', help: 'Your school is not taking part in the global board right now.' },
}

export function ProfilePanel({ profile, allowed }: { profile: Profile | null; allowed: boolean }) {
  const router = useRouter()
  const { push } = useToast()
  const [editing, setEditing] = React.useState(!profile)
  const [alias, setAlias] = React.useState(profile?.alias ?? '')
  const [avatarKey, setAvatarKey] = React.useState(profile?.avatarKey ?? AVATAR_KEYS[0])
  const [showBadges, setShowBadges] = React.useState(profile?.showBadges ?? true)
  const [division, setDivision] = React.useState(profile?.division ?? '')
  const [errors, setErrors] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)

  if (!allowed) {
    return <Notice tone="info" title="Not available at your school">Your school has not joined the global leaderboard. Your XP and achievements still count for you.</Notice>
  }

  async function save() {
    setBusy(true)
    setErrors([])
    try {
      await api('/api/v1/tapasya/profile', { method: 'PUT', body: { alias, avatarKey, showBadges, division: division || null } })
      const rejoining = !profile || profile.status === 'OPTED_OUT' || profile.status === 'SCHOOL_DISABLED'
      push({ tone: 'success', title: rejoining ? 'Request sent' : 'Profile updated', description: rejoining ? 'Your guardian has been asked to approve.' : undefined })
      setEditing(false)
      router.refresh()
    } catch (e) {
      const details = (e as { details?: unknown }).details
      setErrors(Array.isArray(details) ? details.map(String) : [(e as Error).message])
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    if (!window.confirm('Leave the global leaderboard? Your XP and achievements are kept, but your alias is removed from every ranking.')) return
    setBusy(true)
    try {
      await api('/api/v1/tapasya/profile', { method: 'DELETE' })
      push({ tone: 'success', title: 'You have left the leaderboard' })
      router.refresh()
    } catch (e) {
      push({ tone: 'error', title: 'Could not leave', description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const status = profile ? STATUS[profile.status] : null

  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="font-medium text-ink">Your global profile</h2>
        {profile && status ? (
          <div className="mt-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <p className="mt-2 text-sm text-ink-muted">{status.help}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Choose an alias to appear on the board. Do not use your real name. A guardian must approve before you appear.</p>
        )}

        {editing ? (
          <div className="mt-4 space-y-3">
            <Field htmlFor="tpp-alias" label="Alias" hint="3–20 letters, numbers, spaces or underscores. No real names." required>
              <Input id="tpp-alias" value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={20} />
            </Field>
            <div>
              <span className="text-sm font-medium text-ink">Avatar</span>
              <div className="mt-2 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Avatar">
                {AVATAR_KEYS.map((k) => {
                  const I = AVATAR_ICON[k]!
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={avatarKey === k}
                      aria-label={k}
                      onClick={() => setAvatarKey(k)}
                      className={cn('flex size-10 items-center justify-center rounded-full border', avatarKey === k ? 'border-[var(--brand-600)] bg-[var(--brand-50)] text-[var(--brand-600)]' : 'border-[var(--border)] text-ink-muted')}
                    >
                      <I className="size-4" aria-hidden />
                    </button>
                  )
                })}
              </div>
            </div>
            <Field htmlFor="tpp-division" label="Division">
              <Select id="tpp-division" value={division} onChange={(e) => setDivision(e.target.value)}>
                {DIVISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </Select>
            </Field>
            <CheckRow label="Show my achievement badges" checked={showBadges} onChange={(e) => setShowBadges(e.target.checked)} />
            {errors.length ? <Notice tone="danger">{errors.join(' ')}</Notice> : null}
            <div className="flex gap-2">
              <Button onClick={save} loading={busy} disabled={alias.trim().length < 3}>{profile ? 'Save' : 'Join leaderboard'}</Button>
              {profile ? <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button> : null}
            </div>
          </div>
        ) : profile ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>{profile.status === 'OPTED_OUT' ? 'Join again' : 'Edit'}</Button>
            {profile.status !== 'OPTED_OUT' ? <Button variant="ghost" size="sm" onClick={leave} loading={busy}>Leave leaderboard</Button> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

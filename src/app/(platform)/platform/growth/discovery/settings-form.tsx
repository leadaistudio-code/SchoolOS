'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Checkbox } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { addDiscoveryLocationAction, saveDiscoverySettingsAction } from './actions'

export function DiscoverySettingsForm({
  settings,
  locations,
}: {
  settings: {
    enabled: boolean
    minConfidence: number
    autoAddVerified: boolean
    autoAddStrongLead: boolean
    autoAddNeedsVerification: boolean
  } | null
  locations: { id: string; city: string; state: string; enabled: boolean; priority: number }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = React.useTransition()

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Lead Discovery settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 py-3">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            start(async () => {
              const result = await saveDiscoverySettingsAction(fd)
              toast.push({
                tone: result.ok ? 'success' : 'error',
                title: result.message,
              })
              router.refresh()
            })
          }}
        >
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="enabled" defaultChecked={settings?.enabled ?? true} />
            Discovery enabled
          </label>
          <Field label="Minimum confidence for auto-create" htmlFor="minConfidence">
            <Input
              id="minConfidence"
              name="minConfidence"
              type="number"
              min={0}
              max={100}
              defaultValue={settings?.minConfidence ?? 60}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="autoAddVerified" defaultChecked={settings?.autoAddVerified ?? true} />
            Auto-add Verified
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="autoAddStrongLead"
              defaultChecked={settings?.autoAddStrongLead ?? true}
            />
            Auto-add Strong leads
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="autoAddNeedsVerification"
              defaultChecked={settings?.autoAddNeedsVerification ?? false}
            />
            Auto-add Needs verification
          </label>
          <Button type="submit" size="sm" loading={pending}>
            Save settings
          </Button>
        </form>

        <div className="border-t border-line pt-3">
          <p className="text-sm font-medium text-ink mb-2">Target cities</p>
          <ul className="mb-3 space-y-1 text-sm text-ink-muted">
            {locations.map((l) => (
              <li key={l.id}>
                {l.city}, {l.state} · priority {l.priority}
                {!l.enabled ? ' (off)' : ''}
              </li>
            ))}
          </ul>
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              start(async () => {
                const result = await addDiscoveryLocationAction(fd)
                toast.push({
                  tone: result.ok ? 'success' : 'error',
                  title: result.message,
                })
                if (result.ok) e.currentTarget.reset()
                router.refresh()
              })
            }}
          >
            <Input name="city" placeholder="City (e.g. Gurugram)" required />
            <Input name="state" placeholder="State" defaultValue="Haryana" />
            <Input name="region" placeholder="Region (optional)" />
            <Button type="submit" size="sm" variant="secondary" loading={pending}>
              Add city
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}

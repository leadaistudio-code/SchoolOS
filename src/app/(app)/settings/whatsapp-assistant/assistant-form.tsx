'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import type { AssistantConfig } from '@/server/modules/whatsapp-bot/service'
import { saveAssistantAction } from './actions'

export function AssistantForm({ config, ready }: { config: AssistantConfig; ready: boolean }) {
  const toast = useToast()
  const [enabled, setEnabled] = useState(config.enabled)
  const [greeting, setGreeting] = useState(config.greeting)
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      const r = await saveAssistantAction({ enabled, greeting })
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Saved' : 'Could not save', description: r.message })
    })
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-line p-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={!ready && !enabled}
          className="mt-1 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block text-sm font-medium text-ink">Answer parents on WhatsApp</span>
          <span className="block text-xs text-ink-subtle">
            Parents whose number is on a student&apos;s profile can check fees, receipts, attendance, exams and homework, or leave a
            message for the office, any time of day.
          </span>
        </span>
      </label>
      <Field label="Greeting (optional)" htmlFor="wa-greeting" hint="Shown above the menu when a parent says hi.">
        <Textarea
          id="wa-greeting"
          rows={3}
          maxLength={300}
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="Namaste! Welcome to the school’s WhatsApp helpdesk."
        />
      </Field>
      <Button onClick={save} loading={pending}>
        Save
      </Button>
    </div>
  )
}

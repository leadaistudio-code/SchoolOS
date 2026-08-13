'use client'

import { useActionState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTemplateAction, saveTemplateAction, seedTemplatesAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { TEMPLATE_CHANNELS, TEMPLATE_EVENTS } from '@/lib/notification-templates'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export function TemplateForm() {
  const [state, action, pending] = useActionState(saveTemplateAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Event" htmlFor="eventKey">
        <Select id="eventKey" name="eventKey" defaultValue={TEMPLATE_EVENTS[0].key}>
          {TEMPLATE_EVENTS.map((e) => (
            <option key={e.key} value={e.key}>
              {e.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Channel" htmlFor="channel">
        <Select id="channel" name="channel" defaultValue="EMAIL">
          {TEMPLATE_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Subject (email)" htmlFor="subject">
        <Input id="subject" name="subject" />
      </Field>
      <Field
        label="Body"
        htmlFor="body"
        hint="Variables: {{school_name}}, {{student_name}}, {{parent_name}}, {{detail}}"
      >
        <Textarea id="body" name="body" rows={6} required />
      </Field>
      <Button type="submit" loading={pending} block>
        Save template
      </Button>
    </form>
  )
}

export function SeedTemplatesButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await seedTemplatesAction()
          router.refresh()
        })
      }
    >
      Seed defaults
    </Button>
  )
}

export function DeleteTemplateButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteTemplateAction(id)
          router.refresh()
        })
      }
    >
      Delete
    </Button>
  )
}

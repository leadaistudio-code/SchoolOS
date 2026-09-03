'use client'

import { useActionState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createTemplateAction,
  deleteTemplateAction,
  seedTemplatesAction,
  toggleTemplateAction,
} from '../actions'
import { emptyFormState } from '@/lib/form-state'
import {
  CRM_CHANNELS,
  CRM_CHANNEL_LABELS,
  CRM_TEMPLATE_CATEGORIES,
  CRM_TEMPLATE_VAR_HINT,
} from '@/lib/growth-crm'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export function TemplateForm() {
  const [state, action, pending] = useActionState(createTemplateAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Name" htmlFor="name" required>
        <Input id="name" name="name" required />
      </Field>
      <Field label="Category" htmlFor="category">
        <Select id="category" name="category" defaultValue={CRM_TEMPLATE_CATEGORIES[0]}>
          {CRM_TEMPLATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Channel" htmlFor="channel">
        <Select id="channel" name="channel" defaultValue="WHATSAPP">
          {CRM_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CRM_CHANNEL_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Subject (email)" htmlFor="subject">
        <Input id="subject" name="subject" />
      </Field>
      <Field label="Body" htmlFor="body" hint={CRM_TEMPLATE_VAR_HINT} required>
        <Textarea id="body" name="body" rows={6} required />
      </Field>
      <Button type="submit" loading={pending} size="sm">
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

export function ToggleTemplateButton({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await toggleTemplateAction(id, !isActive)
          router.refresh()
        })
      }
    >
      {isActive ? 'Turn off' : 'Turn on'}
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

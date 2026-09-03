'use client'

import { useActionState, useMemo, useState } from 'react'
import { sendMessageAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { renderTemplate } from '@/lib/notification-templates'
import {
  CRM_CHANNELS,
  CRM_CHANNEL_LABELS,
  CRM_TEMPLATE_VAR_HINT,
  crmMessageVars,
  type CrmMessageChannel,
} from '@/lib/growth-crm'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

type Contact = {
  id: string
  fullName: string
  mobile?: string | null
  whatsapp?: string | null
  email?: string | null
}

type Template = {
  id: string
  name: string
  category: string
  channel: string
  subject: string | null
  body: string
}

export function ComposeForm({
  schoolId,
  schoolName,
  schoolPhone,
  schoolEmail,
  contacts,
  templates,
  ownerName,
  meetingDate,
  meetingTime,
}: {
  schoolId: string
  schoolName: string
  schoolPhone?: string | null
  schoolEmail?: string | null
  contacts: Contact[]
  templates: Template[]
  ownerName: string
  meetingDate?: string
  meetingTime?: string
}) {
  const action = sendMessageAction.bind(null, schoolId)
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  const [channel, setChannel] = useState<CrmMessageChannel>('WHATSAPP')
  const [contactId, setContactId] = useState(contacts[0]?.id ?? '')
  const [templateId, setTemplateId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [proposalLink, setProposalLink] = useState('')

  const channelTemplates = useMemo(
    () => templates.filter((t) => t.channel === channel),
    [templates, channel],
  )
  const contact = contacts.find((c) => c.id === contactId)
  const vars = crmMessageVars({
    contactName: contact?.fullName,
    schoolName,
    meetingDate,
    meetingTime,
    ownerName,
    proposalLink,
  })
  const preview = body ? renderTemplate(body, vars) : ''
  const subjectPreview = subject ? renderTemplate(subject, vars) : ''
  const destination =
    channel === 'EMAIL'
      ? contact?.email || schoolEmail
      : channel === 'WHATSAPP'
        ? contact?.whatsapp || contact?.mobile || schoolPhone
        : contact?.mobile || schoolPhone

  function applyChannel(next: CrmMessageChannel) {
    setChannel(next)
    setTemplateId('')
    setSubject('')
    setBody('')
  }

  function applyTemplate(id: string) {
    setTemplateId(id)
    const template = channelTemplates.find((t) => t.id === id)
    if (!template) {
      setSubject('')
      setBody('')
      return
    }
    setSubject(template.subject ?? '')
    setBody(template.body)
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Channel" htmlFor="channel">
        <Select
          id="channel"
          name="channel"
          value={channel}
          onChange={(e) => applyChannel(e.target.value as CrmMessageChannel)}
        >
          {CRM_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CRM_CHANNEL_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Contact" htmlFor="contactId">
        <Select id="contactId" name="contactId" value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">School number / email</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Template" htmlFor="templateId">
        <Select id="templateId" name="templateId" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
          <option value="">Write your own</option>
          {channelTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.category} · {t.name}
            </option>
          ))}
        </Select>
      </Field>
      {channel === 'EMAIL' ? (
        <Field label="Subject" htmlFor="subject">
          <Input id="subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
      ) : null}
      <Field label="Message" htmlFor="body" hint={CRM_TEMPLATE_VAR_HINT} required>
        <Textarea id="body" name="body" rows={6} required value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Field label="Proposal link" htmlFor="proposalLink" hint="Fills {{proposalLink}}">
        <Input
          id="proposalLink"
          name="proposalLink"
          value={proposalLink}
          onChange={(e) => setProposalLink(e.target.value)}
        />
      </Field>
      <p className="text-xs text-ink-subtle">Sends to {destination || '— add a number or email first'}</p>
      {preview ? (
        <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-subtle">Preview</p>
          {channel === 'EMAIL' && subjectPreview ? (
            <p className="mt-1 text-sm font-medium text-ink">{subjectPreview}</p>
          ) : null}
          <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-ink-muted">{preview}</pre>
        </div>
      ) : null}
      <Button type="submit" loading={pending} size="sm">
        Send {CRM_CHANNEL_LABELS[channel]}
      </Button>
    </form>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ActivityForm, FollowUpForm, MeetingForm, TaskForm, VisitForm } from '../schools/[id]/panels'
import { ComposeForm } from '../compose-form'
import { Field, Select } from '@/components/ui/input'
import { formatCrmMeetingSlots } from '@/lib/growth-crm'

const KINDS = {
  call: 'Log call',
  visit: 'Log visit',
  note: 'Add note',
  'follow-up': 'Add follow-up',
  meeting: 'Schedule meeting',
  task: 'Add task',
  message: 'Send message',
} as const

type Kind = keyof typeof KINDS

export function GrowthLogWorkbench({
  schools,
  operators,
  contactsBySchool,
  templates,
  nextMeetingBySchool,
  ownerName,
  canSend,
}: {
  schools: { id: string; name: string; city: string | null; phone: string | null; email: string | null }[]
  operators: { id: string; firstName: string; lastName: string }[]
  contactsBySchool: Record<
    string,
    { id: string; fullName: string; mobile: string | null; whatsapp: string | null; email: string | null }[]
  >
  templates: {
    id: string
    name: string
    category: string
    channel: string
    subject: string | null
    body: string
  }[]
  nextMeetingBySchool: Record<string, string>
  ownerName: string
  canSend: boolean
}) {
  const params = useSearchParams()
  const kind = (params.get('kind') ?? 'call') as Kind
  const title = KINDS[kind] ?? KINDS.call
  const [schoolId, setSchoolId] = useState(params.get('schoolId') ?? schools[0]?.id ?? '')
  const contacts = useMemo(() => contactsBySchool[schoolId] ?? [], [contactsBySchool, schoolId])
  const school = schools.find((s) => s.id === schoolId)
  const meeting = formatCrmMeetingSlots(nextMeetingBySchool[schoolId] ? new Date(nextMeetingBySchool[schoolId]) : null)

  return (
    <div className="space-y-4">
      <Field label="School" htmlFor="school">
        <Select id="school" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.city ? ` · ${s.city}` : ''}
            </option>
          ))}
        </Select>
      </Field>

      {!schoolId ? (
        <p className="text-sm text-ink-muted">Add a school first.</p>
      ) : kind === 'visit' ? (
        <VisitForm key={schoolId} schoolId={schoolId} />
      ) : kind === 'follow-up' ? (
        <FollowUpForm key={schoolId} schoolId={schoolId} contacts={contacts} />
      ) : kind === 'meeting' ? (
        <MeetingForm key={schoolId} schoolId={schoolId} contacts={contacts} />
      ) : kind === 'task' ? (
        <TaskForm key={schoolId} schoolId={schoolId} contacts={contacts} operators={operators} />
      ) : kind === 'message' ? (
        canSend ? (
          <ComposeForm
            key={schoolId}
            schoolId={schoolId}
            schoolName={school?.name ?? ''}
            schoolPhone={school?.phone}
            schoolEmail={school?.email}
            contacts={contacts}
            templates={templates}
            ownerName={ownerName}
            meetingDate={meeting.meetingDate}
            meetingTime={meeting.meetingTime}
          />
        ) : (
          <p className="text-sm text-ink-muted">You need permission to send Growth CRM messages.</p>
        )
      ) : (
        <ActivityForm
          key={`${schoolId}-${kind}`}
          schoolId={schoolId}
          contacts={contacts}
          defaultType={kind === 'note' ? 'NOTE' : 'OUTGOING_CALL'}
        />
      )}
      <p className="text-xs text-ink-subtle">{title}</p>
    </div>
  )
}

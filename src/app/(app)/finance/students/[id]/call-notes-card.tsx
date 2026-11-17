'use client'

import * as React from 'react'
import { Phone } from 'lucide-react'
import { CallNoteButton } from '../../dues/call-note-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDay } from '@/lib/dates'

type Note = {
  id: string
  phone: string
  contactLabel: string | null
  calledAt: string
  notes: string
  createdByLabel: string | null
}

export function CallNotesCard({
  studentId,
  studentName,
  phone,
  telHref,
  contactLabel,
  notes,
}: {
  studentId: string
  studentName: string
  phone: string | null
  telHref: string | null
  contactLabel: string | null
  notes: Note[]
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Fee call notes</CardTitle>
          <p className="mt-0.5 text-sm text-ink-muted">What was discussed when chasing dues</p>
        </div>
        <CallNoteButton
          studentId={studentId}
          studentName={studentName}
          phone={phone}
          telHref={telHref}
          contactLabel={contactLabel}
          lastCallAt={notes[0]?.calledAt ?? null}
          lastCallNotes={notes[0]?.notes ?? null}
        />
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <p className="text-sm text-ink-muted">No calls logged yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-[var(--radius)] border border-line bg-surface-2/40 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-subtle">
                  <Phone className="size-3" aria-hidden />
                  <span>{formatDay(new Date(note.calledAt), 'd MMM yyyy, HH:mm')}</span>
                  <span>·</span>
                  <span>{note.contactLabel ?? note.phone}</span>
                  {note.createdByLabel ? (
                    <>
                      <span>·</span>
                      <span>{note.createdByLabel}</span>
                    </>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-ink">{note.notes}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

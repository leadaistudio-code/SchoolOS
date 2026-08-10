'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle, Send } from 'lucide-react'
import { createNoticeAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { ROLE } from '@/lib/rbac/roles'

type ClassNode = { id: string; name: string; sections: { id: string; name: string }[] }

const AUDIENCE_HELP: Record<string, string> = {
  ALL: 'Everyone at the school: staff, students and parents.',
  ROLE: 'Only people holding the chosen role.',
  CLASS: 'Students of the chosen class and their parents.',
  SECTION: 'Students of one section and their parents.',
}

export function NoticeForm({ classes }: { classes: ClassNode[] }) {
  const [state, formAction, pending] = useActionState(createNoticeAction, emptyFormState)
  const [audience, setAudience] = React.useState<'ALL' | 'ROLE' | 'CLASS' | 'SECTION'>('ALL')
  const [classId, setClassId] = React.useState('')

  const sections = classes.find((c) => c.id === classId)?.sections ?? []
  const err = (f: string) => state.fieldErrors[f]

  return (
    <form action={formAction} noValidate>
      <Card>
        <CardContent className="pt-5 space-y-4">
          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[var(--radius)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2.5"
            >
              <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
              <p className="text-sm text-[var(--danger)]">{state.error}</p>
            </div>
          ) : null}

          <Field label="Title" htmlFor="title" required error={err('title')}>
            <Input id="title" name="title" required maxLength={200} />
          </Field>

          <Field label="Notice" htmlFor="body" required error={err('body')}>
            <Textarea id="body" name="body" required rows={7} />
          </Field>

          <Field
            label="Who should see this"
            htmlFor="audienceKind"
            required
            hint={AUDIENCE_HELP[audience]}
          >
            <Select
              id="audienceKind"
              name="audienceKind"
              value={audience}
              onChange={(e) => setAudience(e.target.value as typeof audience)}
            >
              <option value="ALL">Everyone</option>
              <option value="ROLE">A role</option>
              <option value="CLASS">One class</option>
              <option value="SECTION">One section</option>
            </Select>
          </Field>

          {audience === 'ROLE' ? (
            <Field label="Role" htmlFor="roleKey" required error={err('roleKey')}>
              <Select id="roleKey" name="roleKey" defaultValue={ROLE.TEACHER}>
                {Object.values(ROLE)
                  .filter((r) => r !== ROLE.SUPER_ADMIN)
                  .map((r) => (
                    <option key={r} value={r}>
                      {r.replace('_', ' ').toLowerCase()}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}

          {audience === 'CLASS' || audience === 'SECTION' ? (
            <Field label="Class" htmlFor="classLevelId" required error={err('classLevelId')}>
              <Select
                id="classLevelId"
                name={audience === 'CLASS' ? 'classLevelId' : 'classPicker'}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                required
              >
                <option value="">Select a class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {audience === 'SECTION' ? (
            <Field label="Section" htmlFor="sectionId" required error={err('sectionId')}>
              <Select id="sectionId" name="sectionId" required disabled={!classId}>
                <option value="">Select a section</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    Section {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority" htmlFor="priority">
              <Select id="priority" name="priority" defaultValue="NORMAL">
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </Field>
            <Field
              label="Hide after"
              htmlFor="expiresOn"
              hint="Optional — leave blank to keep it up"
            >
              <Input id="expiresOn" name="expiresOn" type="date" />
            </Field>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="isPublished"
                defaultChecked
                className="size-4 rounded-[3px] border border-line-strong accent-[var(--brand-500)]"
              />
              Publish immediately
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="pinned" className="size-4 rounded-[3px] border border-line-strong accent-[var(--brand-500)]" />
              Pin to the top of the board
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="notifyNow" className="size-4 rounded-[3px] border border-line-strong accent-[var(--brand-500)]" />
              Send a notification to the audience
            </label>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" loading={pending}>
              <Send aria-hidden />
              Post notice
            </Button>
            <Link href="/communication/notices" className={buttonVariants({ variant: 'ghost' })}>
              Cancel
            </Link>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}

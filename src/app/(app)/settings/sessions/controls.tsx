'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  createSessionAction,
  setCurrentSessionAction,
  setSessionLockAction,
} from '../admin-actions'

/**
 * Creating a school year.
 *
 * The very first session is made current whether or not the box is ticked —
 * a product with sessions but none of them current cannot render a single
 * class list — so the checkbox only appears once one already exists.
 */
export function NewSessionButton({
  hasAny,
  label = 'New session',
}: {
  hasAny: boolean
  label?: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState('')
  const [startsOn, setStartsOn] = React.useState('')
  const [endsOn, setEndsOn] = React.useState('')
  const [makeCurrent, setMakeCurrent] = React.useState(!hasAny)

  const submit = () =>
    startTransition(async () => {
      const result = await createSessionAction({
        name: name.trim(),
        startsOn,
        endsOn,
        makeCurrent,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not create session', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Session created', description: result.message })
      setOpen(false)
      setName('')
      setStartsOn('')
      setEndsOn('')
    })

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New academic session"
        description="The school year that classes, exams, fees and enrolments belong to. Sessions may not overlap."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!name.trim() || !startsOn || !endsOn || endsOn <= startsOn}
            >
              Create session
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Name"
            htmlFor="session-name"
            required
            className="sm:col-span-2"
            hint="What the school calls the year — 2026-27"
          >
            <Input
              id="session-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="2026-27"
              autoFocus
            />
          </Field>

          <Field label="Starts" htmlFor="session-start" required>
            <Input
              id="session-start"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </Field>

          <Field
            label="Ends"
            htmlFor="session-end"
            required
            error={endsOn && endsOn <= startsOn ? 'Must be after the start date' : undefined}
          >
            <Input
              id="session-end"
              type="date"
              min={startsOn || undefined}
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </Field>

          {hasAny ? (
            <label className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                checked={makeCurrent}
                onChange={(e) => setMakeCurrent(e.target.checked)}
              />
              <span className="text-sm text-ink">
                Make this the current session — the whole product switches to it
              </span>
            </label>
          ) : (
            <p className="text-xs text-ink-subtle sm:col-span-2">
              This is the first session, so it becomes the current one.
            </p>
          )}
        </div>
      </Dialog>
    </>
  )
}

/** Switch to a session, or lock it against further edits. */
export function SessionControls({
  id,
  name,
  isCurrent,
  isLocked,
}: {
  id: string
  name: string
  isCurrent: boolean
  isLocked: boolean
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [confirming, setConfirming] = React.useState(false)

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, title: string) =>
    startTransition(async () => {
      const result = await fn()
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? title : 'Could not save',
        description: result.message,
      })
      if (result.ok) setConfirming(false)
    })

  return (
    <div className="flex items-center justify-end gap-1.5">
      {isCurrent ? null : confirming ? (
        <>
          <span className="text-xs text-ink-muted">Switch the product to {name}?</span>
          <Button
            size="sm"
            loading={pending}
            onClick={() => run(() => setCurrentSessionAction(id), 'Session switched')}
          >
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          Make current
        </Button>
      )}

      {isCurrent ? null : (
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() =>
            run(
              () => setSessionLockAction(id, !isLocked),
              isLocked ? 'Session unlocked' : 'Session locked',
            )
          }
        >
          {isLocked ? 'Unlock' : 'Lock'}
        </Button>
      )}
    </div>
  )
}

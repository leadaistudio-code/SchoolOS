'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, PenSquare, Search, X } from 'lucide-react'
import { composeAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/identity'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import type { RecipientOption } from '@/server/modules/messages/service'

/**
 * Writing a new message.
 *
 * The recipient picker searches the server rather than filtering a list held
 * in the browser, so it stays correct as staff join and leave, and so it can
 * never offer someone this user is not allowed to write to — the directory is
 * narrowed on the server, not here.
 */
export function ComposeDialog({
  initialRecipients,
  triggerLabel = 'Compose',
}: {
  initialRecipients: RecipientOption[]
  triggerLabel?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [chosen, setChosen] = React.useState<RecipientOption[]>([])
  const [search, setSearch] = React.useState('')
  const [options, setOptions] = React.useState(initialRecipients)
  const [state, formAction, pending] = useActionState(composeAction, emptyFormState)

  React.useEffect(() => {
    if (!open) return
    const term = search.trim()
    if (term.length < 2) {
      setOptions(initialRecipients)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/messages/recipients?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        const body = (await response.json()) as { data: RecipientOption[] }
        setOptions(body.data ?? [])
      } catch {
        /* aborted or offline; the current list stays usable */
      }
    }, 200)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, open, initialRecipients])

  React.useEffect(() => {
    if (!state.ok) return
    setOpen(false)
    setChosen([])
    setSearch('')
    toast.push({ tone: 'success', title: 'Message sent' })
    router.refresh()
  }, [state.ok, toast, router])

  const chosenIds = new Set(chosen.map((person) => person.id))
  const available = options.filter((person) => !chosenIds.has(person.id))

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PenSquare className="size-4" aria-hidden />
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New message"
        size="lg"
        description="Internal mail. It stays inside the school and is not sent to an outside address."
      >
        <form action={formAction} className="space-y-3" noValidate>
          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-danger-bg px-3 py-2"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" aria-hidden />
              <p className="text-sm text-[var(--danger)]">{state.error}</p>
            </div>
          ) : null}

          <Field label="To" htmlFor="recipient-search" required error={state.fieldErrors.recipientIds}>
            <div className="rounded-[var(--radius-sm)] border border-line-strong bg-surface">
              {chosen.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5 border-b border-line p-2">
                  {chosen.map((person) => (
                    <li key={person.id}>
                      <input type="hidden" name="recipientIds" value={person.id} />
                      <button
                        type="button"
                        onClick={() => setChosen((c) => c.filter((p) => p.id !== person.id))}
                        className="flex items-center gap-1.5 rounded-full bg-[var(--product-50)] py-1 pl-1 pr-2 text-xs font-medium text-[var(--product-600)] transition-colors hover:bg-[var(--product-100)]"
                      >
                        <Avatar
                          firstName={person.name.split(' ')[0] ?? person.name}
                          lastName={person.name.split(' ')[1] ?? ''}
                          avatarUrl={person.avatarUrl}
                          className="size-5"
                        />
                        {person.name}
                        <X className="size-3" aria-hidden />
                        <span className="sr-only">Remove {person.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
                  aria-hidden
                />
                <input
                  id="recipient-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search staff and parents"
                  autoComplete="off"
                  className="h-9 w-full bg-transparent pl-8 pr-2.5 text-base text-ink placeholder:text-ink-subtle focus:outline-none"
                />
              </div>

              {available.length > 0 ? (
                <ul className="scroll-thin max-h-44 overflow-y-auto border-t border-line">
                  {available.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setChosen((c) => [...c, person])
                          setSearch('')
                        }}
                        className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <Avatar
                          firstName={person.name.split(' ')[0] ?? person.name}
                          lastName={person.name.split(' ')[1] ?? ''}
                          avatarUrl={person.avatarUrl}
                          className="size-7"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{person.name}</span>
                          <span className="block truncate text-xs text-ink-subtle">{person.role}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-line px-2.5 py-3 text-xs text-ink-subtle">
                  {search.trim().length >= 2 ? 'Nobody matches that search.' : 'No one left to add.'}
                </p>
              )}
            </div>
          </Field>

          <Field label="Subject" htmlFor="subject" required error={state.fieldErrors.subject}>
            <Input id="subject" name="subject" required maxLength={160} placeholder="Cover for period 3" />
          </Field>

          <Field label="Message" htmlFor="body" required error={state.fieldErrors.body}>
            <Textarea id="body" name="body" required rows={8} />
          </Field>

          <div className={cn('flex items-center gap-2 pt-1')}>
            <Button type="submit" loading={pending} disabled={chosen.length === 0}>
              Send
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <p className="ml-auto text-xs text-ink-subtle">
              {chosen.length} recipient{chosen.length === 1 ? '' : 's'}
            </p>
          </div>
        </form>
      </Dialog>
    </>
  )
}

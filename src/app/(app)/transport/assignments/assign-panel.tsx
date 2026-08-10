'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { AlertCircle, Plus, X } from 'lucide-react'
import { assignStudentAction, endAssignmentAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

export type RouteOption = {
  id: string
  name: string
  code: string
  stops: { id: string; name: string; pickupTime: string | null; dropTime: string | null }[]
}

export type StudentOption = {
  id: string
  firstName: string
  lastName: string
  admissionNo: string
  className: string | null
}

/**
 * Putting a child on a route.
 *
 * Route first, then stop: the stop list is meaningless until the route is
 * chosen, and offering every stop in the school at once is how a child ends up
 * assigned to the right-named stop on the wrong route.
 */
export function AssignPanel({
  routes,
  students,
}: {
  routes: RouteOption[]
  students: StudentOption[]
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [routeId, setRouteId] = React.useState(routes[0]?.id ?? '')
  const [state, formAction, pending] = useActionState(assignStudentAction, emptyFormState)

  const stops = routes.find((route) => route.id === routeId)?.stops ?? []

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false)
      toast.push({ tone: 'success', title: 'Assigned', description: 'The family has been notified.' })
    }
  }, [state.ok, toast])

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={routes.length === 0}>
        <Plus className="size-4" aria-hidden />
        Assign student
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Assign a student to transport"
        description="Guardians are told the route, the stop and the pickup time as soon as this is saved."
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

          <Field
            label="Student"
            htmlFor="studentId"
            required
            error={state.fieldErrors.studentId}
            hint={students.length === 0 ? 'Every active student already has a route.' : undefined}
          >
            <Select id="studentId" name="studentId" required disabled={students.length === 0}>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName} · {student.admissionNo}
                  {student.className ? ` · ${student.className}` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Route" htmlFor="routeId" required error={state.fieldErrors.routeId}>
            <Select
              id="routeId"
              name="routeId"
              required
              value={routeId}
              onChange={(event) => setRouteId(event.target.value)}
            >
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name} · {route.code}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Stop"
            htmlFor="stopId"
            required
            error={state.fieldErrors.stopId}
            hint={stops.length === 0 ? 'This route has no stops yet.' : undefined}
          >
            <Select id="stopId" name="stopId" required disabled={stops.length === 0}>
              {stops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                  {stop.pickupTime ? ` · picks up ${stop.pickupTime}` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Travels" htmlFor="direction" required>
            <Select id="direction" name="direction" defaultValue="BOTH">
              <option value="BOTH">Both ways</option>
              <option value="PICKUP">Morning pickup only</option>
              <option value="DROP">Afternoon drop only</option>
            </Select>
          </Field>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" loading={pending} disabled={students.length === 0 || stops.length === 0}>
              Assign
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}

export function EndAssignmentButton({ assignmentId, name }: { assignmentId: string; name: string }) {
  const toast = useToast()
  const [pending, setPending] = React.useState(false)

  return (
    <IconButton
      label={`Remove ${name} from transport`}
      loading={pending}
      onClick={async () => {
        setPending(true)
        const result = await endAssignmentAction(assignmentId)
        setPending(false)
        toast.push({
          tone: result.ok ? 'success' : 'error',
          title: result.ok ? 'Removed' : 'Could not remove',
          description: result.message,
        })
      }}
    >
      <X className="size-4" aria-hidden />
    </IconButton>
  )
}

'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { saveRouteAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Field, FormActions, Input, Select } from '@/components/ui/input'

export type BusOption = { id: string; code: string; registrationNo: string; capacity: number }

export type RouteValues = {
  id: string
  name: string
  code: string
  busId: string | null
  distanceKm: number | null
  isActive: boolean
}

export function RouteForm({ buses, route }: { buses: BusOption[]; route?: RouteValues }) {
  const [state, formAction, pending] = useActionState(
    saveRouteAction.bind(null, route?.id ?? null),
    emptyFormState,
  )
  const err = (field: string) => state.fieldErrors[field]

  return (
    <form action={formAction} noValidate>
      <Card>
        <CardContent className="space-y-4 pt-5">
          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-danger-bg px-3.5 py-2.5"
            >
              <AlertCircle className="mt-0.5 size-4.5 shrink-0 text-[var(--danger)]" aria-hidden />
              <p className="text-sm text-[var(--danger)]">{state.error}</p>
            </div>
          ) : null}

          <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
            <Field label="Route name" htmlFor="name" required error={err('name')}>
              <Input
                id="name"
                name="name"
                required
                defaultValue={route?.name}
                placeholder="Route 1 — Sector 45"
              />
            </Field>
            <Field label="Route code" htmlFor="code" required error={err('code')}>
              <Input id="code" name="code" required defaultValue={route?.code} placeholder="RT-01" />
            </Field>
            <Field
              label="Bus"
              htmlFor="busId"
              error={err('busId')}
              hint="Everyone riding this route travels in this bus"
            >
              <Select id="busId" name="busId" defaultValue={route?.busId ?? ''}>
                <option value="">No bus yet</option>
                {buses.map((bus) => (
                  <option key={bus.id} value={bus.id}>
                    {bus.code} · {bus.registrationNo} · {bus.capacity} seats
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Distance (km)" htmlFor="distanceKm" error={err('distanceKm')}>
              <Input
                id="distanceKm"
                name="distanceKm"
                type="number"
                min={0}
                step="0.1"
                defaultValue={route?.distanceKm ?? ''}
              />
            </Field>
            <Field label="Running" htmlFor="isActive">
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <Checkbox id="isActive" name="isActive" defaultChecked={route?.isActive ?? true} />
                Accepting riders and trips
              </label>
            </Field>
          </div>

          <FormActions>
            <Button type="submit" loading={pending}>
              {route ? 'Save route' : 'Create route'}
            </Button>
            <Link href="/transport/routes" className={buttonVariants({ variant: 'ghost' })}>
              Cancel
            </Link>
          </FormActions>
        </CardContent>
      </Card>
    </form>
  )
}

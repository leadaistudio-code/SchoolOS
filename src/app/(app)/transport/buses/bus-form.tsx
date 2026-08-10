'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { saveBusAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Field, FormActions, FormSection, Input, Select } from '@/components/ui/input'

export type DriverOption = {
  id: string
  firstName: string
  lastName: string
  employeeCode: string
  designation: string | null
  phone: string | null
}

export type BusValues = {
  id: string
  code: string
  registrationNo: string
  model: string | null
  capacity: number
  driverId: string | null
  attendantName: string | null
  insuranceExpiresOn: string | null
  fitnessExpiresOn: string | null
  pollutionExpiresOn: string | null
  isActive: boolean
}

export function BusForm({
  drivers,
  bus,
}: {
  drivers: DriverOption[]
  bus?: BusValues
}) {
  const [state, formAction, pending] = useActionState(
    saveBusAction.bind(null, bus?.id ?? null),
    emptyFormState,
  )
  const err = (field: string) => state.fieldErrors[field]

  return (
    <form action={formAction} noValidate>
      <Card>
        <CardContent className="space-y-6 pt-5">
          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-danger-bg px-3.5 py-2.5"
            >
              <AlertCircle className="mt-0.5 size-4.5 shrink-0 text-[var(--danger)]" aria-hidden />
              <p className="text-sm text-[var(--danger)]">{state.error}</p>
            </div>
          ) : null}

          <FormSection
            title="Vehicle"
            description="How this bus is identified on the road and in the office."
          >
            <Field label="Bus code" htmlFor="code" required error={err('code')} hint="Shown on the map marker">
              <Input id="code" name="code" required defaultValue={bus?.code} placeholder="BUS-01" />
            </Field>
            <Field
              label="Registration number"
              htmlFor="registrationNo"
              required
              error={err('registrationNo')}
            >
              <Input
                id="registrationNo"
                name="registrationNo"
                required
                defaultValue={bus?.registrationNo}
                placeholder="HR26AB1234"
                className="uppercase"
              />
            </Field>
            <Field label="Model" htmlFor="model" error={err('model')}>
              <Input id="model" name="model" defaultValue={bus?.model ?? ''} placeholder="Tata Starbus" />
            </Field>
            <Field
              label="Seating capacity"
              htmlFor="capacity"
              required
              error={err('capacity')}
              hint="Assignments are refused once this is reached"
            >
              <Input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                max={120}
                required
                defaultValue={bus?.capacity ?? 40}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Crew"
            description="The driver's phone number is what a parent sees when the bus is late."
          >
            <Field label="Driver" htmlFor="driverId" error={err('driverId')}>
              <Select id="driverId" name="driverId" defaultValue={bus?.driverId ?? ''}>
                <option value="">No driver yet</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.firstName} {driver.lastName} · {driver.employeeCode}
                    {driver.phone ? ` · ${driver.phone}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Attendant" htmlFor="attendantName" error={err('attendantName')}>
              <Input
                id="attendantName"
                name="attendantName"
                defaultValue={bus?.attendantName ?? ''}
                placeholder="Travels with the children"
              />
            </Field>
          </FormSection>

          <FormSection
            title="Papers"
            description="Expiry dates are surfaced on the fleet list a month before they lapse."
          >
            <Field label="Insurance expires" htmlFor="insuranceExpiresOn" error={err('insuranceExpiresOn')}>
              <Input
                id="insuranceExpiresOn"
                name="insuranceExpiresOn"
                type="date"
                defaultValue={bus?.insuranceExpiresOn ?? ''}
              />
            </Field>
            <Field label="Fitness expires" htmlFor="fitnessExpiresOn" error={err('fitnessExpiresOn')}>
              <Input
                id="fitnessExpiresOn"
                name="fitnessExpiresOn"
                type="date"
                defaultValue={bus?.fitnessExpiresOn ?? ''}
              />
            </Field>
            <Field
              label="Pollution certificate expires"
              htmlFor="pollutionExpiresOn"
              error={err('pollutionExpiresOn')}
            >
              <Input
                id="pollutionExpiresOn"
                name="pollutionExpiresOn"
                type="date"
                defaultValue={bus?.pollutionExpiresOn ?? ''}
              />
            </Field>
            <Field label="In service" htmlFor="isActive">
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <Checkbox id="isActive" name="isActive" defaultChecked={bus?.isActive ?? true} />
                Available for routes and trips
              </label>
            </Field>
          </FormSection>

          <FormActions>
            <Button type="submit" loading={pending}>
              {bus ? 'Save changes' : 'Add bus'}
            </Button>
            <Link
              href={bus ? `/transport/buses/${bus.id}` : '/transport/buses'}
              className={buttonVariants({ variant: 'ghost' })}
            >
              Cancel
            </Link>
          </FormActions>
        </CardContent>
      </Card>
    </form>
  )
}

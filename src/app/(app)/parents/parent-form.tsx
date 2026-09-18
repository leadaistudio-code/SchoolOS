'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FormActions, FormSection, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { emptyFormState, type FormState } from '@/lib/form-state'

export type ParentFormValues = {
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  occupation?: string
  annualIncome?: string
  addressLine1?: string
  city?: string
  state?: string
  postalCode?: string
}

export function ParentForm({
  action,
  values,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  values?: ParentFormValues
  submitLabel: string
  cancelHref: string
}) {
  const [state, formAction, pending] = React.useActionState(action, emptyFormState)
  const err = (name: string) => state.fieldErrors?.[name]

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Notice tone="danger" title={state.error} /> : null}

      <Card>
        <CardContent className="space-y-5">
          <FormSection
            title="Identity"
            description="Name and contact details used on the portal, fee notices and messages."
          >
            <Field label="First name" htmlFor="firstName" required error={err('firstName')}>
              <Input
                id="firstName"
                name="firstName"
                defaultValue={values?.firstName}
                required
                autoComplete="given-name"
              />
            </Field>
            <Field label="Last name" htmlFor="lastName" error={err('lastName')}>
              <Input
                id="lastName"
                name="lastName"
                defaultValue={values?.lastName}
                autoComplete="family-name"
              />
            </Field>
            <Field label="Occupation" htmlFor="occupation" error={err('occupation')}>
              <Input id="occupation" name="occupation" defaultValue={values?.occupation} />
            </Field>
            <Field
              label="Annual income"
              htmlFor="annualIncome"
              hint="Optional — used for fee concessions where relevant"
              error={err('annualIncome')}
            >
              <Input id="annualIncome" name="annualIncome" defaultValue={values?.annualIncome} />
            </Field>
          </FormSection>

          <FormSection title="Contact" description="Phone is also the portal username when login is issued.">
            <Field label="Phone" htmlFor="phone" error={err('phone')}>
              <Input
                id="phone"
                name="phone"
                defaultValue={values?.phone}
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>
            <Field label="Email" htmlFor="email" error={err('email')}>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={values?.email}
                autoComplete="email"
              />
            </Field>
            <Field
              label="Address"
              htmlFor="addressLine1"
              className="sm:col-span-2"
              error={err('addressLine1')}
            >
              <Input id="addressLine1" name="addressLine1" defaultValue={values?.addressLine1} />
            </Field>
            <Field label="City" htmlFor="city" error={err('city')}>
              <Input id="city" name="city" defaultValue={values?.city} />
            </Field>
            <Field label="State" htmlFor="state" error={err('state')}>
              <Input id="state" name="state" defaultValue={values?.state} />
            </Field>
            <Field label="Postal code" htmlFor="postalCode" error={err('postalCode')}>
              <Input id="postalCode" name="postalCode" defaultValue={values?.postalCode} />
            </Field>
          </FormSection>
        </CardContent>
      </Card>

      <FormActions>
        <Link href={cancelHref} className={buttonVariants({ variant: 'secondary' })}>
          Cancel
        </Link>
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </FormActions>
    </form>
  )
}

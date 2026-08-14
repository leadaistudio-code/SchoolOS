'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Field, FormActions, FormSection, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { emptyFormState, type FormState } from '@/lib/form-state'

export type StaffFormValues = {
  employeeCode?: string
  firstName?: string
  lastName?: string
  staffType?: string
  designation?: string
  department?: string
  qualification?: string
  experienceYears?: string
  gender?: string
  dateOfBirth?: string
  phone?: string
  email?: string
  joinedOn?: string
  /** In rupees — the action converts to paise on the way in. */
  salary?: string
  addressLine1?: string
  city?: string
  state?: string
  postalCode?: string
}

const STAFF_TYPES = [
  { value: 'TEACHING', label: 'Teaching' },
  { value: 'ADMIN', label: 'Administration' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'LIBRARIAN', label: 'Librarian' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'DRIVER', label: 'Driver' },
  { value: 'OTHER', label: 'Other' },
]

const ROLES = [
  { value: '', label: 'Match the staff type' },
  { value: 'TEACHER', label: 'Teacher' },
  { value: 'PRINCIPAL', label: 'Principal' },
  { value: 'HR', label: 'HR / Staff manager' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'LIBRARIAN', label: 'Librarian' },
  { value: 'TRANSPORT_MANAGER', label: 'Transport manager' },
  { value: 'DRIVER', label: 'Driver' },
  { value: 'FRONT_DESK', label: 'Front desk' },
]

/**
 * The personnel record.
 *
 * One form rather than a wizard: a school office fills this from a paper file
 * that is already in front of them, and a five-step flow turns one sitting
 * into five. Only the four fields the product genuinely cannot work without
 * are required — everything else can be filled in later from the profile.
 *
 * Salary is on the form for convenience when hiring, but the structured
 * breakdown lives on the Salary tab; this field is the headline figure.
 */
export function StaffForm({
  action,
  values,
  canSetSalary,
  canCreateLogin,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  values?: StaffFormValues
  canSetSalary: boolean
  /** Only offered when creating — an existing record's login is managed in Settings. */
  canCreateLogin: boolean
  submitLabel: string
  cancelHref: string
}) {
  const [state, formAction, pending] = React.useActionState(action, emptyFormState)
  const [createLogin, setCreateLogin] = React.useState(false)
  const err = (name: string) => state.fieldErrors?.[name]

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Notice tone="danger" title={state.error} /> : null}

      <Card>
        <CardContent className="space-y-5">
          <FormSection
            title="Identity"
            description="The employee code appears on registers, payslips and the staff directory."
          >
              <Field label="Employee code" htmlFor="employeeCode" required error={err('employeeCode')}>
                <Input
                  id="employeeCode"
                  name="employeeCode"
                  defaultValue={values?.employeeCode}
                  placeholder="EMP-014"
                  required
                />
              </Field>
              <Field label="Staff type" htmlFor="staffType" required error={err('staffType')}>
                <Select id="staffType" name="staffType" defaultValue={values?.staffType ?? 'TEACHING'}>
                  {STAFF_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="First name" htmlFor="firstName" required error={err('firstName')}>
                <Input id="firstName" name="firstName" defaultValue={values?.firstName} required />
              </Field>
              <Field label="Last name" htmlFor="lastName" required error={err('lastName')}>
                <Input id="lastName" name="lastName" defaultValue={values?.lastName} required />
              </Field>
              <Field label="Gender" htmlFor="gender" error={err('gender')}>
                <Select id="gender" name="gender" defaultValue={values?.gender ?? ''}>
                  <option value="">Not specified</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
              <Field label="Date of birth" htmlFor="dateOfBirth" error={err('dateOfBirth')}>
                <Input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  defaultValue={values?.dateOfBirth}
                />
              </Field>
          </FormSection>

          <FormSection
            title="Role at the school"
            description="Designation and department drive the directory, the timetable and payroll grouping."
          >
              <Field label="Designation" htmlFor="designation" error={err('designation')}>
                <Input
                  id="designation"
                  name="designation"
                  defaultValue={values?.designation}
                  placeholder="Senior Mathematics Teacher"
                />
              </Field>
              <Field label="Department" htmlFor="department" error={err('department')}>
                <Input
                  id="department"
                  name="department"
                  defaultValue={values?.department}
                  placeholder="Mathematics"
                />
              </Field>
              <Field label="Qualification" htmlFor="qualification" error={err('qualification')}>
                <Input
                  id="qualification"
                  name="qualification"
                  defaultValue={values?.qualification}
                  placeholder="M.Sc, B.Ed"
                />
              </Field>
              <Field
                label="Experience"
                htmlFor="experienceYears"
                hint="Total years, including before this school"
                error={err('experienceYears')}
              >
                <Input
                  id="experienceYears"
                  name="experienceYears"
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  defaultValue={values?.experienceYears}
                />
              </Field>
              <Field label="Joined on" htmlFor="joinedOn" error={err('joinedOn')}>
                <Input id="joinedOn" name="joinedOn" type="date" defaultValue={values?.joinedOn} />
              </Field>
              {canSetSalary ? (
                <Field
                  label="Salary"
                  htmlFor="salaryMinor"
                  hint="Monthly gross. Break it into components on the Salary tab."
                  error={err('salaryMinor')}
                >
                  <Input
                    id="salaryMinor"
                    name="salaryMinor"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={values?.salary}
                  />
                </Field>
              ) : null}
          </FormSection>

          <FormSection title="Contact" description="Used for notifications and emergencies.">
              <Field label="Phone" htmlFor="phone" error={err('phone')}>
                <Input id="phone" name="phone" defaultValue={values?.phone} />
              </Field>
              <Field label="Email" htmlFor="email" error={err('email')}>
                <Input id="email" name="email" type="email" defaultValue={values?.email} />
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

          {canCreateLogin ? (
            <FormSection
              title="Portal access"
              description="Creates an account with a one-time password shown after saving."
            >
              <label className="flex items-center gap-2">
                <Checkbox
                  name="createLogin"
                  checked={createLogin}
                  onChange={(e) => setCreateLogin(e.target.checked)}
                />
                <span className="text-sm text-ink">
                  Give this person a login — an email address is required
                </span>
              </label>

              {createLogin ? (
                <Field
                  label="Role"
                  htmlFor="roleKey"
                  className="mt-3 max-w-sm"
                  hint="What they can see and do. Teaching staff default to Teacher."
                >
                  <Select id="roleKey" name="roleKey" defaultValue="">
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </FormSection>
          ) : null}
        </CardContent>
      </Card>

      <FormActions>
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: 'ghost' })}>
          Cancel
        </Link>
      </FormActions>
    </form>
  )
}

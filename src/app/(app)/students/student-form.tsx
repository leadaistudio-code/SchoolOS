'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle, Save } from 'lucide-react'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import type { ClassOption } from './student-filters'

export type StudentFormValues = {
  admissionNo?: string
  firstName?: string
  lastName?: string
  dateOfBirth?: string
  gender?: string
  bloodGroup?: string
  category?: string
  religion?: string
  nationality?: string
  motherTongue?: string
  admissionDate?: string
  previousSchool?: string
  classLevelId?: string
  sectionId?: string
  rollNumber?: number | null
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  medicalNotes?: string
  allergies?: string
  status?: string
}

/**
 * One form for both admission and editing. Validation errors come back from
 * the same Zod schema the API uses, so the two paths cannot disagree about
 * what a valid student looks like.
 */
export function StudentForm({
  action,
  classes,
  values,
  mode,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  classes: ClassOption[]
  values?: StudentFormValues
  mode: 'create' | 'edit'
  cancelHref: string
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  const [classId, setClassId] = React.useState(values?.classLevelId ?? '')
  const toast = useToast()
  const notified = React.useRef(false)

  React.useEffect(() => {
    if (state.ok && !notified.current) {
      notified.current = true
      toast.push({ tone: 'success', title: 'Changes saved' })
      const t = setTimeout(() => (notified.current = false), 500)
      return () => clearTimeout(t)
    }
  }, [state.ok, toast])

  const sections = classes.find((c) => c.id === classId)?.sections ?? []
  const err = (field: string) => state.fieldErrors[field]

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[var(--radius)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2.5"
        >
          <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
          <p className="text-[13px] text-[var(--danger)]">{state.error}</p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Student details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Admission number" htmlFor="admissionNo" required error={err('admissionNo')}>
            <Input
              id="admissionNo"
              name="admissionNo"
              defaultValue={values?.admissionNo}
              placeholder="ADM-2025-0001"
              required
              aria-invalid={!!err('admissionNo')}
            />
          </Field>
          <Field label="First name" htmlFor="firstName" required error={err('firstName')}>
            <Input id="firstName" name="firstName" defaultValue={values?.firstName} required />
          </Field>
          <Field label="Last name" htmlFor="lastName" required error={err('lastName')}>
            <Input id="lastName" name="lastName" defaultValue={values?.lastName} required />
          </Field>

          <Field label="Date of birth" htmlFor="dateOfBirth" error={err('dateOfBirth')}>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={values?.dateOfBirth} />
          </Field>
          <Field label="Gender" htmlFor="gender" error={err('gender')}>
            <Select id="gender" name="gender" defaultValue={values?.gender ?? ''}>
              <option value="">Not specified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Blood group" htmlFor="bloodGroup" error={err('bloodGroup')}>
            <Select id="bloodGroup" name="bloodGroup" defaultValue={values?.bloodGroup ?? ''}>
              <option value="">Not known</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Admission date" htmlFor="admissionDate" error={err('admissionDate')}>
            <Input
              id="admissionDate"
              name="admissionDate"
              type="date"
              defaultValue={values?.admissionDate}
            />
          </Field>
          <Field label="Category" htmlFor="category" hint="e.g. General, OBC, SC, ST">
            <Input id="category" name="category" defaultValue={values?.category} />
          </Field>
          <Field label="Previous school" htmlFor="previousSchool">
            <Input id="previousSchool" name="previousSchool" defaultValue={values?.previousSchool} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Class placement</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Class" htmlFor="classLevelId" required error={err('classLevelId')}>
            <Select
              id="classLevelId"
              name="classLevelId"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              required
              aria-invalid={!!err('classLevelId')}
            >
              <option value="">Select a class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Section"
            htmlFor="sectionId"
            required
            error={err('sectionId')}
            hint={!classId ? 'Choose a class first' : undefined}
          >
            <Select
              id="sectionId"
              name="sectionId"
              defaultValue={values?.sectionId ?? ''}
              disabled={!classId}
              required
              aria-invalid={!!err('sectionId')}
            >
              <option value="">Select a section</option>
              {sections.map((s) => {
                const full = s._count.enrollments >= s.capacity
                return (
                  <option key={s.id} value={s.id} disabled={full}>
                    Section {s.name} - {s._count.enrollments}/{s.capacity}
                    {full ? ' (full)' : ''}
                  </option>
                )
              })}
            </Select>
          </Field>
          <Field label="Roll number" htmlFor="rollNumber" error={err('rollNumber')}>
            <Input
              id="rollNumber"
              name="rollNumber"
              type="number"
              min={1}
              defaultValue={values?.rollNumber ?? undefined}
            />
          </Field>
        </CardContent>
      </Card>

      {mode === 'create' ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Primary guardian</CardTitle>
              <p className="text-[13px] text-ink-muted mt-0.5">
                Optional now, but a guardian is needed before fee notices and the parent app can
                be used.
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Guardian first name" htmlFor="guardian.firstName">
              <Input id="guardian.firstName" name="guardian.firstName" />
            </Field>
            <Field label="Guardian last name" htmlFor="guardian.lastName">
              <Input id="guardian.lastName" name="guardian.lastName" />
            </Field>
            <Field label="Relation" htmlFor="guardian.relation">
              <Select id="guardian.relation" name="guardian.relation" defaultValue="GUARDIAN">
                <option value="FATHER">Father</option>
                <option value="MOTHER">Mother</option>
                <option value="GUARDIAN">Guardian</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Phone" htmlFor="guardian.phone" error={err('guardian.phone')}>
              <Input id="guardian.phone" name="guardian.phone" type="tel" />
            </Field>
            <Field label="Email" htmlFor="guardian.email" error={err('guardian.email')}>
              <Input id="guardian.email" name="guardian.email" type="email" />
            </Field>
            <Field label="Occupation" htmlFor="guardian.occupation">
              <Input id="guardian.occupation" name="guardian.occupation" />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Contact and medical</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Address line 1" htmlFor="addressLine1" className="sm:col-span-2">
            <Input id="addressLine1" name="addressLine1" defaultValue={values?.addressLine1} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" defaultValue={values?.city} />
          </Field>
          <Field label="State" htmlFor="state">
            <Input id="state" name="state" defaultValue={values?.state} />
          </Field>
          <Field label="Postal code" htmlFor="postalCode">
            <Input id="postalCode" name="postalCode" defaultValue={values?.postalCode} />
          </Field>
          <Field label="Emergency contact name" htmlFor="emergencyContactName">
            <Input
              id="emergencyContactName"
              name="emergencyContactName"
              defaultValue={values?.emergencyContactName}
            />
          </Field>
          <Field
            label="Emergency contact phone"
            htmlFor="emergencyContactPhone"
            error={err('emergencyContactPhone')}
          >
            <Input
              id="emergencyContactPhone"
              name="emergencyContactPhone"
              type="tel"
              defaultValue={values?.emergencyContactPhone}
            />
          </Field>
          <Field
            label="Allergies"
            htmlFor="allergies"
            hint="Shown to staff on the student profile"
          >
            <Input id="allergies" name="allergies" defaultValue={values?.allergies} />
          </Field>
          <Field label="Medical notes" htmlFor="medicalNotes" className="sm:col-span-2 lg:col-span-3">
            <Textarea id="medicalNotes" name="medicalNotes" defaultValue={values?.medicalNotes} />
          </Field>
        </CardContent>
      </Card>

      {mode === 'edit' ? (
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Enrolment status" htmlFor="status" className="max-w-xs">
              <Select id="status" name="status" defaultValue={values?.status ?? 'ACTIVE'}>
                <option value="ACTIVE">Active</option>
                <option value="ALUMNI">Alumni</option>
                <option value="TRANSFERRED">Transferred</option>
                <option value="WITHDRAWN">Withdrawn</option>
                <option value="SUSPENDED">Suspended</option>
              </Select>
            </Field>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center gap-2 sticky bottom-16 lg:bottom-4 bg-surface/90 backdrop-blur border border-line rounded-[var(--radius)] px-4 py-3">
        <Button type="submit" loading={pending}>
          <Save className="size-4" aria-hidden />
          {mode === 'create' ? 'Admit student' : 'Save changes'}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: 'ghost' })}>
          Cancel
        </Link>
      </div>
    </form>
  )
}

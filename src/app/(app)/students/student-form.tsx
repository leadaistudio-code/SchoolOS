'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { BookOpen, FileText, HeartPulse, MapPin, Save, Users } from 'lucide-react'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { dateToWords, formatAge } from '@/lib/words'
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
  caste?: string
  aadhaarNo?: string
  birthPlace?: string
  identificationMark?: string
  disability?: string
  house?: string
  whatsappPhone?: string
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
  fatherName?: string
  motherName?: string
}

type TabKey = 'student' | 'parents' | 'contact' | 'academic'

const TAB_FIELDS: Record<TabKey, string[]> = {
  student: ['bloodGroup', 'religion', 'nationality', 'motherTongue', 'category', 'caste', 'aadhaarNo', 'house', 'identificationMark', 'birthPlace', 'disability', 'allergies', 'medicalNotes'],
  parents: ['guardian', 'secondGuardian'],
  contact: ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'emergencyContactName', 'emergencyContactPhone'],
  academic: ['previousSchool', 'status'],
}

const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Parsi', 'Other']
const CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'EWS']
const HOUSES = ['Red', 'Blue', 'Green', 'Yellow']
const LANGUAGES = ['Hindi', 'English', 'Punjabi', 'Bengali', 'Marathi', 'Tamil', 'Telugu', 'Gujarati', 'Urdu', 'Kannada', 'Malayalam', 'Odia']

/**
 * One form for both admission and editing. Validation errors come back from
 * the same Zod schema the API uses, so the two paths cannot disagree about
 * what a valid student looks like.
 *
 * Tab panels stay mounted (only hidden), so every field is submitted
 * whichever tab is open.
 */
export function StudentForm({
  action,
  classes,
  values,
  mode,
  cancelHref,
  suggestedAdmissionNo,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  classes: ClassOption[]
  values?: StudentFormValues
  mode: 'create' | 'edit'
  cancelHref: string
  suggestedAdmissionNo?: string
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState)
  const [classId, setClassId] = React.useState(values?.classLevelId ?? '')
  const [dob, setDob] = React.useState(values?.dateOfBirth ?? '')
  const [tab, setTab] = React.useState<TabKey>('student')
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
  const tabHasError = (key: TabKey) =>
    Object.keys(state.fieldErrors).some((f) => TAB_FIELDS[key].some((p) => f === p || f.startsWith(`${p}.`)))

  const dobDate = dob ? new Date(`${dob}T00:00:00Z`) : null
  const tabs: Array<{ key: TabKey; label: string; icon: React.ElementType; show: boolean }> = [
    { key: 'student', label: 'Student info', icon: HeartPulse, show: true },
    { key: 'parents', label: 'Parent details', icon: Users, show: true },
    { key: 'contact', label: 'Contact', icon: MapPin, show: true },
    { key: 'academic', label: mode === 'create' ? 'Academic & documents' : 'Academic', icon: BookOpen, show: true },
  ]

  return (
    <form action={formAction} className="max-w-5xl space-y-5" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <section className="rounded-[var(--radius)] border border-line bg-surface p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">
            {mode === 'create' ? 'New admission' : 'Student record'}
          </h2>
          {mode === 'create' ? (
            <span className="rounded-full bg-[var(--product-50)] px-2.5 py-1 text-xs font-medium text-[var(--product-700)]">
              Session placement and first parent are created together
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Admission no."
            htmlFor="admissionNo"
            required={mode === 'edit'}
            error={err('admissionNo')}
            hint={mode === 'create' ? 'Auto-generated. Change it if you use a different series.' : undefined}
          >
            <Input
              id="admissionNo"
              name="admissionNo"
              defaultValue={values?.admissionNo ?? suggestedAdmissionNo}
              placeholder={suggestedAdmissionNo ?? 'ADM-2026-0001'}
              aria-invalid={!!err('admissionNo')}
            />
          </Field>
          <Field label="First name" htmlFor="firstName" required error={err('firstName')}>
            <Input id="firstName" name="firstName" defaultValue={values?.firstName} required aria-invalid={!!err('firstName')} />
          </Field>
          {mode === 'create' ? (
            <Field label="Middle name" htmlFor="middleName">
              <Input id="middleName" name="middleName" />
            </Field>
          ) : null}
          <Field label="Last name" htmlFor="lastName" hint="Blank for a one-name student" error={err('lastName')}>
            <Input id="lastName" name="lastName" defaultValue={values?.lastName} />
          </Field>

          <Field label="Gender" htmlFor="gender" error={err('gender')}>
            <Select id="gender" name="gender" defaultValue={values?.gender ?? ''}>
              <option value="">Not specified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
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
              key={classId}
              id="sectionId"
              name="sectionId"
              defaultValue={classId === values?.classLevelId ? (values?.sectionId ?? '') : (sections.length === 1 ? sections[0]!.id : '')}
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
          <Field label="Roll no." htmlFor="rollNumber" error={err('rollNumber')}>
            <Input id="rollNumber" name="rollNumber" type="number" min={1} defaultValue={values?.rollNumber ?? undefined} />
          </Field>

          <Field label="Date of birth" htmlFor="dateOfBirth" error={err('dateOfBirth')}>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </Field>
          <Field label="Admission date" htmlFor="admissionDate" error={err('admissionDate')}>
            <Input
              id="admissionDate"
              name="admissionDate"
              type="date"
              defaultValue={values?.admissionDate ?? (mode === 'create' ? new Date().toISOString().slice(0, 10) : undefined)}
            />
          </Field>
          <Field label="Date of birth in words" htmlFor="dobWords" className="sm:col-span-2">
            <Input id="dobWords" value={dateToWords(dobDate)} readOnly tabIndex={-1} className="bg-surface-2 text-ink-muted" placeholder="Fills in from the date of birth" />
          </Field>

          <Field label="WhatsApp no." htmlFor="whatsappPhone" error={err('whatsappPhone')}>
            <Input id="whatsappPhone" name="whatsappPhone" type="tel" defaultValue={values?.whatsappPhone} />
          </Field>
          <Field label="Age today" htmlFor="age">
            <Input id="age" value={formatAge(dobDate)} readOnly tabIndex={-1} className="bg-surface-2 text-ink-muted" placeholder="—" />
          </Field>
        </div>
      </section>

      <div className="rounded-[var(--radius)] border border-line bg-surface">
        <div role="tablist" aria-label="Admission details" className="flex gap-1 overflow-x-auto border-b border-line px-2 pt-2">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-[8px] border border-transparent px-3 py-2 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'border-line border-b-surface bg-surface text-[var(--product-700)]'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              <t.icon className="size-4" aria-hidden />
              {t.label}
              {tabHasError(t.key) ? <span className="size-1.5 rounded-full bg-[var(--danger)]" aria-label="has errors" /> : null}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5">
          <div hidden={tab !== 'student'} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Blood group" htmlFor="bloodGroup" error={err('bloodGroup')}>
              <Select id="bloodGroup" name="bloodGroup" defaultValue={values?.bloodGroup ?? ''}>
                <option value="">Not known</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </Select>
            </Field>
            <Field label="Religion" htmlFor="religion">
              <Input id="religion" name="religion" list="religion-list" defaultValue={values?.religion} />
            </Field>
            <Field label="Mother tongue" htmlFor="motherTongue">
              <Input id="motherTongue" name="motherTongue" list="language-list" defaultValue={values?.motherTongue} />
            </Field>
            <Field label="Nationality" htmlFor="nationality">
              <Input id="nationality" name="nationality" defaultValue={values?.nationality ?? (mode === 'create' ? 'Indian' : undefined)} />
            </Field>
            <Field label="Category" htmlFor="category">
              <Input id="category" name="category" list="category-list" defaultValue={values?.category} />
            </Field>
            <Field label="Caste / sub-caste" htmlFor="caste">
              <Input id="caste" name="caste" defaultValue={values?.caste} />
            </Field>
            <Field label="Aadhaar no." htmlFor="aadhaarNo" error={err('aadhaarNo')}>
              <Input id="aadhaarNo" name="aadhaarNo" inputMode="numeric" maxLength={14} placeholder="12 digits" defaultValue={values?.aadhaarNo} aria-invalid={!!err('aadhaarNo')} />
            </Field>
            <Field label="House" htmlFor="house">
              <Input id="house" name="house" list="house-list" defaultValue={values?.house} />
            </Field>
            <Field label="Birth place" htmlFor="birthPlace">
              <Input id="birthPlace" name="birthPlace" defaultValue={values?.birthPlace} />
            </Field>
            <Field label="Identification mark" htmlFor="identificationMark" className="sm:col-span-2">
              <Input id="identificationMark" name="identificationMark" defaultValue={values?.identificationMark} placeholder="e.g. Mole on the left cheek" />
            </Field>
            <Field label="Disability (if any)" htmlFor="disability">
              <Input id="disability" name="disability" defaultValue={values?.disability} />
            </Field>
            <Field label="Allergies" htmlFor="allergies" hint="Shown to staff on the student profile">
              <Input id="allergies" name="allergies" defaultValue={values?.allergies} />
            </Field>
            <Field label="Medical notes" htmlFor="medicalNotes" className="sm:col-span-2">
              <Textarea id="medicalNotes" name="medicalNotes" rows={2} defaultValue={values?.medicalNotes} />
            </Field>
          </div>

          {mode === 'create' ? (
            <div hidden={tab !== 'parents'} className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <ParentBlock prefix="parent1" title="Father / guardian" relations={['FATHER', 'GUARDIAN', 'OTHER']} err={err} errKey="guardian" />
                <ParentBlock prefix="parent2" title="Mother" relations={['MOTHER', 'GUARDIAN', 'OTHER']} err={err} errKey="secondGuardian" />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5 text-sm text-ink">
                <span className="font-medium">Primary contact (fee notices, SMS):</span>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="primaryParent" value="parent1" defaultChecked className="accent-[var(--brand-500)]" /> First parent
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="primaryParent" value="parent2" className="accent-[var(--brand-500)]" /> Second parent
                </label>
              </div>
              <label className="flex items-center gap-2">
                <Checkbox name="guardian.createLogin" />
                <span className="text-sm text-ink">
                  Create a parent portal login for the primary contact (phone + child first name and date of birth as first password)
                </span>
              </label>
            </div>
          ) : (
            <div hidden={tab !== 'parents'} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Father's name" htmlFor="fatherName" hint="Filled in from the guardian on record. Edit if needed.">
                  <Input id="fatherName" name="fatherName" maxLength={160} defaultValue={values?.fatherName} />
                </Field>
                <Field label="Mother's name" htmlFor="motherName">
                  <Input id="motherName" name="motherName" maxLength={160} defaultValue={values?.motherName} />
                </Field>
              </div>
              <p className="text-xs text-ink-subtle">
                These names print on report cards and certificates. Phone numbers and portal logins are managed from the
                parent&apos;s own record.
              </p>
            </div>
          )}

          <div hidden={tab !== 'contact'} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Address line 1" htmlFor="addressLine1" className="sm:col-span-2 lg:col-span-3">
              <Input id="addressLine1" name="addressLine1" defaultValue={values?.addressLine1} />
            </Field>
            <Field label="Address line 2" htmlFor="addressLine2" className="sm:col-span-2 lg:col-span-3">
              <Input id="addressLine2" name="addressLine2" defaultValue={values?.addressLine2} />
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" name="city" defaultValue={values?.city} />
            </Field>
            <Field label="State" htmlFor="state">
              <Input id="state" name="state" defaultValue={values?.state} />
            </Field>
            <Field label="PIN code" htmlFor="postalCode">
              <Input id="postalCode" name="postalCode" inputMode="numeric" defaultValue={values?.postalCode} />
            </Field>
            <Field label="Emergency contact name" htmlFor="emergencyContactName">
              <Input id="emergencyContactName" name="emergencyContactName" defaultValue={values?.emergencyContactName} />
            </Field>
            <Field label="Emergency contact phone" htmlFor="emergencyContactPhone" error={err('emergencyContactPhone')}>
              <Input id="emergencyContactPhone" name="emergencyContactPhone" type="tel" defaultValue={values?.emergencyContactPhone} />
            </Field>
          </div>

          <div hidden={tab !== 'academic'} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Previous school" htmlFor="previousSchool" className="sm:col-span-2">
                <Input id="previousSchool" name="previousSchool" defaultValue={values?.previousSchool} />
              </Field>
              {mode === 'edit' ? (
                <Field label="Enrolment status" htmlFor="status" hint="Use Transfer certificates to mark a student as left.">
                  <Select id="status" name="status" defaultValue={values?.status ?? 'ACTIVE'}>
                    <option value="ACTIVE">Active</option>
                    <option value="ALUMNI">Alumni</option>
                    <option value="TRANSFERRED">Transferred</option>
                    <option value="WITHDRAWN">Withdrawn</option>
                    <option value="SUSPENDED">Suspended</option>
                  </Select>
                </Field>
              ) : null}
            </div>
            {mode === 'create' ? (
              <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5 text-sm text-ink-muted">
                <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
                Photo, birth certificate, transfer certificate from the previous school and other papers are uploaded from the
                student’s profile once the admission is saved. Transport and optional fees are assigned from Finance.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <datalist id="religion-list">{RELIGIONS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="category-list">{CATEGORIES.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="house-list">{HOUSES.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="language-list">{LANGUAGES.map((v) => <option key={v} value={v} />)}</datalist>

      <div className="flex items-center gap-2 border-t border-line pt-4">
        <Button type="submit" loading={pending}>
          <Save aria-hidden />
          {mode === 'create' ? 'Save admission' : 'Save changes'}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: 'ghost' })}>
          Cancel
        </Link>
      </div>
    </form>
  )
}

function ParentBlock({
  prefix,
  title,
  relations,
  err,
  errKey,
}: {
  prefix: string
  title: string
  relations: string[]
  err: (field: string) => string | undefined
  errKey: string
}) {
  const label = (r: string) => r.charAt(0) + r.slice(1).toLowerCase()
  return (
    <fieldset className="grid gap-3 rounded-[var(--radius-sm)] border border-line p-3 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold text-ink">{title}</legend>
      <Field label="Relation" htmlFor={`${prefix}.relation`}>
        <Select id={`${prefix}.relation`} name={`${prefix}.relation`} defaultValue={relations[0]}>
          {relations.map((r) => (
            <option key={r} value={r}>{label(r)}</option>
          ))}
        </Select>
      </Field>
      <Field label="Full name" htmlFor={`${prefix}.name`}>
        <Input id={`${prefix}.name`} name={`${prefix}.name`} />
      </Field>
      <Field label="Mobile" htmlFor={`${prefix}.phone`} error={err(`${errKey}.phone`)}>
        <Input id={`${prefix}.phone`} name={`${prefix}.phone`} type="tel" />
      </Field>
      <Field label="Email" htmlFor={`${prefix}.email`} error={err(`${errKey}.email`)}>
        <Input id={`${prefix}.email`} name={`${prefix}.email`} type="email" />
      </Field>
      <Field label="Occupation" htmlFor={`${prefix}.occupation`} className="sm:col-span-2">
        <Input id={`${prefix}.occupation`} name={`${prefix}.occupation`} />
      </Field>
    </fieldset>
  )
}

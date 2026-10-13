'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  archiveStudent,
  createStudent,
  suggestAdmissionNumber,
  updateStudent,
} from '@/server/modules/students/service'
import { studentCreateSchema, studentUpdateSchema } from '@/server/modules/students/schema'
import { saveStudentParentNames } from '@/server/modules/students/parent-names'
import { splitPersonName } from '@/lib/person-name'
import type { FormState } from '@/lib/form-state'



function readForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>
  for (const key of Object.keys(raw)) {
    if (raw[key] === '') delete raw[key]
  }

  if (raw.middleName && raw.firstName) raw.firstName = `${raw.firstName} ${raw.middleName}`
  delete raw.middleName

  const parent = (prefix: string, fallbackRelation: string) => {
    const name = raw[`${prefix}.name`] ?? raw[`${prefix}.firstName`]
    if (!name) return undefined
    const { firstName, lastName } = splitPersonName(String(name))
    return {
      firstName,
      lastName,
      relation: raw[`${prefix}.relation`] ?? fallbackRelation,
      phone: raw[`${prefix}.phone`],
      email: raw[`${prefix}.email`],
      occupation: raw[`${prefix}.occupation`],
    }
  }

  const createLogin = raw['guardian.createLogin'] === 'on'
  const legacy = parent('guardian', 'GUARDIAN')
  if (legacy) {
    raw.guardian = { ...legacy, createLogin }
  } else {
    // Admission form: two parent blocks, one marked as the primary contact.
    const first = parent('parent1', 'FATHER')
    const second = parent('parent2', 'MOTHER')
    const primaryIsSecond = raw.primaryParent === 'parent2' && second
    const primary = primaryIsSecond ? second : (first ?? second)
    const other = primary === first ? second : first
    if (primary) raw.guardian = { ...primary, createLogin }
    if (other) raw.secondGuardian = other
  }
  delete raw.primaryParent
  for (const key of Object.keys(raw)) {
    if (/^(guardian|parent1|parent2)\./.test(key)) delete raw[key]
  }
  return raw
}

function toFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) out[issue.path.join('.')] = issue.message
  return out
}

export async function createStudentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('students.create')

  let studentId: string
  let temporaryPassword: string | undefined
  try {
    const raw = readForm(formData)
    if (!raw.admissionNo) raw.admissionNo = await suggestAdmissionNumber(ctx)
    const input = studentCreateSchema.parse(raw)
    const student = await createStudent(ctx, input)
    studentId = student.id
    temporaryPassword = student.temporaryPassword
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: 'Please correct the highlighted fields', fieldErrors: toFieldErrors(err) }
    }
    return {
      error: err instanceof Error ? err.message : 'Could not create the student',
      fieldErrors: {},
    }
  }

  revalidatePath('/students')
  redirect(
    temporaryPassword
      ? `/students/${studentId}?welcome=${encodeURIComponent(temporaryPassword)}`
      : `/students/${studentId}`,
  )
}

export async function updateStudentAction(
  studentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('students.edit')

  try {
    const raw = readForm(formData)
    const parents = { fatherName: String(raw.fatherName ?? ''), motherName: String(raw.motherName ?? '') }
    delete raw.fatherName
    delete raw.motherName
    const input = studentUpdateSchema.parse(raw)
    await updateStudent(ctx, studentId, input)
    await saveStudentParentNames(ctx, studentId, parents)
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: 'Please correct the highlighted fields', fieldErrors: toFieldErrors(err) }
    }
    return {
      error: err instanceof Error ? err.message : 'Could not save the changes',
      fieldErrors: {},
    }
  }

  revalidatePath(`/students/${studentId}`)
  revalidatePath('/students')
  return { error: null, fieldErrors: {}, ok: true }
}

export async function archiveStudentAction(studentId: string, reason?: string) {
  const ctx = await requireContext('students.delete')
  await archiveStudent(ctx, studentId, reason)
  revalidatePath('/students')
  redirect('/students')
}

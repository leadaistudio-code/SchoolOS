'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  archiveStudent,
  createStudent,
  updateStudent,
} from '@/server/modules/students/service'
import { studentCreateSchema, studentUpdateSchema } from '@/server/modules/students/schema'
import { splitPersonName } from '@/lib/person-name'
import type { FormState } from '@/lib/form-state'



function readForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>
  for (const key of Object.keys(raw)) {
    if (raw[key] === '') delete raw[key]
  }

  const parentName = raw['guardian.name'] ?? raw['guardian.firstName']
  if (parentName) {
    const { firstName, lastName } = splitPersonName(String(parentName))
    raw.guardian = {
      firstName,
      lastName,
      relation: 'GUARDIAN',
      phone: raw['guardian.phone'],
      email: raw['guardian.email'],
      occupation: raw['guardian.occupation'],
      createLogin: raw['guardian.createLogin'] === 'on',
    }
  }
  for (const key of Object.keys(raw)) {
    if (key.startsWith('guardian.')) delete raw[key]
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
  try {
    const input = studentCreateSchema.parse(readForm(formData))
    const student = await createStudent(ctx, input)
    studentId = student.id
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
  redirect(`/students/${studentId}`)
}

export async function updateStudentAction(
  studentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('students.edit')

  try {
    const input = studentUpdateSchema.parse(readForm(formData))
    await updateStudent(ctx, studentId, input)
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

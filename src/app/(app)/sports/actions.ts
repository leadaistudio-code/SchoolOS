'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { addTeamMember, createSport, createTeam } from '@/server/modules/sports/service'
import { sportSchema, teamMemberSchema, teamSchema } from '@/server/modules/sports/schema'

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Please correct the highlighted fields', fieldErrors }
  }
  if (error instanceof ApiException) return { error: error.message, fieldErrors: {} }
  return { error: error instanceof Error ? error.message : fallback, fieldErrors: {} }
}

export async function createSportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('sports.manage')
  try {
    await createSport(ctx, sportSchema.parse(Object.fromEntries(formData.entries())))
    revalidatePath('/sports')
    return { ...emptyFormState, ok: true, message: 'Sport added' }
  } catch (error) {
    return fail(error, 'Could not add sport')
  }
}

export async function createTeamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('sports.manage')
  try {
    await createTeam(ctx, teamSchema.parse(Object.fromEntries(formData.entries())))
    revalidatePath('/sports')
    return { ...emptyFormState, ok: true, message: 'Team added' }
  } catch (error) {
    return fail(error, 'Could not add team')
  }
}

export async function addMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('sports.manage')
  try {
    await addTeamMember(
      ctx,
      teamMemberSchema.parse({
        ...Object.fromEntries(formData.entries()),
        isCaptain: formData.get('isCaptain') === 'on',
      }),
    )
    revalidatePath('/sports')
    return { ...emptyFormState, ok: true, message: 'Member added' }
  } catch (error) {
    return fail(error, 'Could not add member')
  }
}

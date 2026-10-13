'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  applyTimetable,
  previewTimetable,
  saveRequirements,
  saveTeacherRule,
  type GenerateInput,
} from '@/server/modules/timetable/generator'

type Result = { ok: boolean; message: string }

function message(error: unknown, fallback: string) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? fallback
  return error instanceof Error ? error.message : fallback
}

export async function saveRequirementsAction(rows: Parameters<typeof saveRequirements>[1]): Promise<Result> {
  const ctx = await requireContext('timetable.manage')
  try {
    const n = await saveRequirements(ctx, rows)
    revalidatePath('/academics/timetable/generator')
    return { ok: true, message: `Saved ${n} subjects` }
  } catch (error) {
    return { ok: false, message: message(error, 'Could not save') }
  }
}

export async function saveTeacherRuleAction(input: Parameters<typeof saveTeacherRule>[1]): Promise<Result> {
  const ctx = await requireContext('timetable.manage')
  try {
    await saveTeacherRule(ctx, input)
    revalidatePath('/academics/timetable/generator')
    return { ok: true, message: 'Teacher rules saved' }
  } catch (error) {
    return { ok: false, message: message(error, 'Could not save') }
  }
}

export async function previewAction(input: GenerateInput) {
  const ctx = await requireContext('timetable.manage')
  try {
    return { ok: true as const, preview: await previewTimetable(ctx, input) }
  } catch (error) {
    return { ok: false as const, message: message(error, 'Could not generate') }
  }
}

export async function applyAction(input: GenerateInput & { seed: number }): Promise<Result> {
  const ctx = await requireContext('timetable.manage')
  try {
    const r = await applyTimetable(ctx, input)
    revalidatePath('/academics/timetable')
    revalidatePath('/academics/timetable/generator')
    return {
      ok: true,
      message: r.placed === r.wanted ? `All ${r.placed} lessons placed.` : `${r.placed} of ${r.wanted} lessons placed. Fill the rest by hand on the timetable.`,
    }
  } catch (error) {
    return { ok: false, message: message(error, 'Could not apply') }
  }
}

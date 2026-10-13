'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import {
  assignSubstitute,
  autoAssignCover,
  clearManualAway,
  markTeacherAway,
} from '@/server/modules/substitutions/service'

export type ActionResult = { ok: boolean; message: string }

const PATH = '/academics/timetable/substitutions'
const ISO = /^\d{4}-\d{2}-\d{2}$/

function failed(error: unknown, fallback: string): ActionResult {
  return { ok: false, message: error instanceof Error ? error.message : fallback }
}

export async function markAwayAction(staffId: string, iso: string, note: string): Promise<ActionResult> {
  const ctx = await requireContext('timetable.substitute')
  if (!ISO.test(iso)) return { ok: false, message: 'Pick a valid date.' }
  try {
    const r = await markTeacherAway(ctx, staffId, iso, note)
    revalidatePath(PATH)
    return { ok: true, message: `${r.lessons} lesson${r.lessons === 1 ? '' : 's'} added to the cover board.` }
  } catch (error) {
    return failed(error, 'Could not mark the teacher away')
  }
}

export async function clearAwayAction(staffId: string, iso: string): Promise<ActionResult> {
  const ctx = await requireContext('timetable.substitute')
  try {
    const n = await clearManualAway(ctx, staffId, iso)
    revalidatePath(PATH)
    return { ok: true, message: n > 0 ? 'Removed from the board.' : 'Nothing to remove — cover already arranged stays.' }
  } catch (error) {
    return failed(error, 'Could not remove')
  }
}

export async function assignAction(input: {
  iso: string
  sectionId: string
  periodId: string
  substituteId: string | null
  noCover?: boolean
}): Promise<ActionResult> {
  const ctx = await requireContext('timetable.substitute')
  if (!ISO.test(input.iso)) return { ok: false, message: 'Pick a valid date.' }
  try {
    await assignSubstitute(ctx, input)
    revalidatePath(PATH)
    return {
      ok: true,
      message: input.substituteId
        ? 'Cover assigned and the teacher has been told.'
        : input.noCover
          ? 'Marked as not needing cover.'
          : 'Cover cleared.',
    }
  } catch (error) {
    return failed(error, 'Could not save the cover')
  }
}

export async function autoAssignAction(iso: string): Promise<ActionResult> {
  const ctx = await requireContext('timetable.substitute')
  if (!ISO.test(iso)) return { ok: false, message: 'Pick a valid date.' }
  try {
    const r = await autoAssignCover(ctx, iso)
    revalidatePath(PATH)
    if (r.assigned === 0 && r.unassigned === 0) return { ok: true, message: 'Every lesson already has cover.' }
    return {
      ok: true,
      message:
        r.unassigned > 0
          ? `Assigned ${r.assigned}. ${r.unassigned} lesson${r.unassigned === 1 ? ' has' : 's have'} no free teacher.`
          : `Assigned all ${r.assigned} lessons. Teachers have been told.`,
    }
  } catch (error) {
    return failed(error, 'Could not auto-assign')
  }
}

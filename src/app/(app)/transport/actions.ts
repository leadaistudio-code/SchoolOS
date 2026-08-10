'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  assignStudent,
  assignmentSchema,
  busSchema,
  endAssignment,
  retireBus,
  routeSchema,
  saveBus,
  saveRoute,
  saveStops,
  stopsSchema,
  tripSchema,
} from '@/server/modules/transport/service'
import { endTrip, recordBoarding, startTrip } from '@/server/modules/transport/tracking'
import type { FormState } from '@/lib/form-state'

function fields(error: ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

// ---------------------------------------------------------------------------
// Fleet
// ---------------------------------------------------------------------------

export async function saveBusAction(
  busId: string | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let savedId = busId
  try {
    const ctx = await requireContext('transport.manage')
    const bus = await saveBus(
      ctx,
      busSchema.parse({
        code: formData.get('code'),
        registrationNo: formData.get('registrationNo'),
        model: formData.get('model') || undefined,
        capacity: formData.get('capacity'),
        driverId: formData.get('driverId') || undefined,
        attendantName: formData.get('attendantName') || undefined,
        insuranceExpiresOn: formData.get('insuranceExpiresOn') || undefined,
        fitnessExpiresOn: formData.get('fitnessExpiresOn') || undefined,
        pollutionExpiresOn: formData.get('pollutionExpiresOn') || undefined,
        isActive: formData.get('isActive') === 'on',
      }),
      busId ?? undefined,
    )
    savedId = bus.id
  } catch (error) {
    if (error instanceof ZodError) {
      return { error: 'Please correct the highlighted fields', fieldErrors: fields(error) }
    }
    return { error: message(error, 'The bus could not be saved'), fieldErrors: {} }
  }

  // redirect() throws to unwind, so it must sit outside the try block or the
  // catch would report a successful save as a failure.
  revalidatePath('/transport/buses')
  redirect(`/transport/buses/${savedId}`)
}

export async function retireBusAction(busId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const bus = await retireBus(await requireContext('transport.manage'), busId)
    revalidatePath('/transport/buses')
    return { ok: true, message: `Bus ${bus.code} retired.` }
  } catch (error) {
    return { ok: false, message: message(error, 'The bus could not be retired') }
  }
}

// ---------------------------------------------------------------------------
// Routes and stops
// ---------------------------------------------------------------------------

export async function saveRouteAction(
  routeId: string | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let savedId = routeId
  try {
    const ctx = await requireContext('transport.manage')
    const saved = await saveRoute(
      ctx,
      routeSchema.parse({
        name: formData.get('name'),
        code: formData.get('code'),
        busId: formData.get('busId') || undefined,
        distanceKm: formData.get('distanceKm') || undefined,
        isActive: formData.get('isActive') === 'on',
      }),
      routeId ?? undefined,
    )
    savedId = saved.id
  } catch (error) {
    if (error instanceof ZodError) {
      return { error: 'Please correct the highlighted fields', fieldErrors: fields(error) }
    }
    return { error: message(error, 'The route could not be saved'), fieldErrors: {} }
  }

  revalidatePath('/transport/routes')
  redirect(`/transport/routes/${savedId}`)
}

export async function saveStopsAction(
  routeId: string,
  stops: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('transport.manage')
    const result = await saveStops(ctx, routeId, stopsSchema.parse({ stops }))
    revalidatePath(`/transport/routes/${routeId}`)
    revalidatePath('/transport/tracking')
    return {
      ok: true,
      message: `${result.saved} stop${result.saved === 1 ? '' : 's'} saved${
        result.removed ? `, ${result.removed} removed` : ''
      }.`,
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? 'Please check the stop details' }
    }
    return { ok: false, message: message(error, 'The stops could not be saved') }
  }
}

// ---------------------------------------------------------------------------
// Riders
// ---------------------------------------------------------------------------

export async function assignStudentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const ctx = await requireContext('transport.manage')
    await assignStudent(
      ctx,
      assignmentSchema.parse({
        studentId: formData.get('studentId'),
        routeId: formData.get('routeId'),
        stopId: formData.get('stopId'),
        direction: formData.get('direction') || 'BOTH',
      }),
    )
    revalidatePath('/transport/assignments')
    return { ok: true, error: null, fieldErrors: {} }
  } catch (error) {
    if (error instanceof ZodError) {
      return { error: 'Please complete every field', fieldErrors: fields(error) }
    }
    return { error: message(error, 'The student could not be assigned'), fieldErrors: {} }
  }
}

export async function endAssignmentAction(
  assignmentId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const assignment = await endAssignment(await requireContext('transport.manage'), assignmentId)
    revalidatePath('/transport/assignments')
    return {
      ok: true,
      message: `${assignment.student.firstName} removed from ${assignment.route.code}.`,
    }
  } catch (error) {
    return { ok: false, message: message(error, 'The assignment could not be ended') }
  }
}

// ---------------------------------------------------------------------------
// Driver operations
// ---------------------------------------------------------------------------

export async function startTripAction(
  busId: string,
  routeId: string,
  direction: 'PICKUP' | 'DROP',
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('transport.drive')
    await startTrip(ctx, tripSchema.parse({ busId, routeId, direction }))
    revalidatePath('/transport/tracking')
    return { ok: true, message: 'Trip started. Your location is now being shared with the school.' }
  } catch (error) {
    return { ok: false, message: message(error, 'The trip could not be started') }
  }
}

export async function endTripAction(tripId: string): Promise<{ ok: boolean; message: string }> {
  try {
    await endTrip(await requireContext('transport.drive'), tripId)
    revalidatePath('/transport/tracking')
    return { ok: true, message: 'Trip ended.' }
  } catch (error) {
    return { ok: false, message: message(error, 'The trip could not be ended') }
  }
}

export async function recordBoardingAction(
  tripId: string,
  studentId: string,
  stopId: string | null,
  event: 'BOARDED' | 'DROPPED' | 'ABSENT',
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('transport.drive')
    await recordBoarding(ctx, { tripId, studentId, stopId: stopId ?? undefined, event })
    revalidatePath('/transport/tracking')
    return { ok: true, message: 'Recorded and the family has been told.' }
  } catch (error) {
    return { ok: false, message: message(error, 'That could not be recorded') }
  }
}

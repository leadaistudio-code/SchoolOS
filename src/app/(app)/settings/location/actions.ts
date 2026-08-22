'use server'

import { revalidatePath } from 'next/cache'
import { ZodError, z } from 'zod'
import { requireContext } from '@/server/context'
import {
  resolveShortLink,
  saveSchoolLocation,
  schoolLocationSchema,
} from '@/server/modules/settings/school-location'

type Result<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; message: string }

function message(err: unknown, fallback: string): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? fallback
  return err instanceof Error ? err.message : fallback
}

export async function saveSchoolLocationAction(payload: unknown): Promise<Result> {
  const ctx = await requireContext('settings.manage')

  try {
    const input = schoolLocationSchema.parse(payload)
    await saveSchoolLocation(ctx, input)

    // The geofence and the transport map both read this, and both sit under
    // the app layout, so the whole tree is stale.
    revalidatePath('/', 'layout')

    return { ok: true, message: 'Saved. Staff check-in and the transport map now use this point.' }
  } catch (err) {
    return { ok: false, message: message(err, 'The location could not be saved') }
  }
}

export async function resolveShortLinkAction(
  url: string,
): Promise<Result<{ latitude: number; longitude: number }>> {
  const ctx = await requireContext('settings.manage')

  try {
    const value = await resolveShortLink(ctx, z.string().url().max(500).parse(url))
    return { ok: true, message: 'Link expanded.', data: value }
  } catch (err) {
    return { ok: false, message: message(err, 'That link could not be expanded') }
  }
}

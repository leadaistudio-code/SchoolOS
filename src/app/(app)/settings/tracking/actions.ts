'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/server/context'
import {
  createIngestToken,
  revokeIngestToken,
  setBusDeviceId,
} from '@/server/modules/transport/ingest'

type Result<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; message: string }

function fail(err: unknown, fallback: string): Result<never> {
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

export async function createIngestTokenAction(
  name: string,
): Promise<Result<{ token: string; prefix: string }>> {
  const ctx = await requireContext('transport.manage')

  try {
    const created = await createIngestToken(ctx, z.string().trim().max(80).parse(name))
    revalidatePath('/settings/tracking')
    return {
      ok: true,
      message: 'Copy it now — it cannot be shown again.',
      data: { token: created.token, prefix: created.prefix },
    }
  } catch (err) {
    return fail(err, 'The token could not be created')
  }
}

export async function revokeIngestTokenAction(id: string): Promise<Result> {
  const ctx = await requireContext('transport.manage')

  try {
    await revokeIngestToken(ctx, z.string().min(1).parse(id))
    revalidatePath('/settings/tracking')
    return { ok: true, message: 'Revoked. Anything using it will stop reporting immediately.' }
  } catch (err) {
    return fail(err, 'The token could not be revoked')
  }
}

export async function setBusDeviceAction(busId: string, deviceId: string): Promise<Result> {
  const ctx = await requireContext('transport.manage')

  try {
    await setBusDeviceId(ctx, z.string().min(1).parse(busId), z.string().max(64).parse(deviceId))
    revalidatePath('/settings/tracking')
    revalidatePath('/transport/tracking')
    return { ok: true, message: 'Saved.' }
  } catch (err) {
    return fail(err, 'The device could not be linked')
  }
}

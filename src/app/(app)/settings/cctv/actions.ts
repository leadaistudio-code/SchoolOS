'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  cameraSchema,
  createRelayKey,
  deleteCamera,
  revokeRelayKey,
  saveCamera,
  saveSite,
  siteSchema,
} from '@/server/modules/cctv/service'

type Result = { ok: boolean; message: string }

function fail(error: unknown, fallback: string): Result {
  if (error instanceof ZodError) return { ok: false, message: error.issues[0]?.message ?? 'Check the form' }
  return { ok: false, message: error instanceof Error ? error.message : fallback }
}

function refresh() {
  revalidatePath('/settings/cctv')
  revalidatePath('/cctv')
}

export async function saveSiteAction(input: unknown): Promise<Result> {
  const ctx = await requireContext('cctv.manage')
  try {
    await saveSite(ctx, siteSchema.parse(input))
    refresh()
    return { ok: true, message: 'CCTV settings saved' }
  } catch (error) {
    return fail(error, 'Could not save')
  }
}

export async function saveCameraAction(input: unknown): Promise<Result> {
  const ctx = await requireContext('cctv.manage')
  try {
    await saveCamera(ctx, cameraSchema.parse(input))
    refresh()
    return { ok: true, message: 'Camera saved' }
  } catch (error) {
    return fail(error, 'Could not save the camera')
  }
}

export async function deleteCameraAction(id: string): Promise<Result> {
  const ctx = await requireContext('cctv.manage')
  try {
    await deleteCamera(ctx, id)
    refresh()
    return { ok: true, message: 'Camera removed' }
  } catch (error) {
    return fail(error, 'Could not remove the camera')
  }
}

export async function createRelayKeyAction(): Promise<Result & { key?: string }> {
  const ctx = await requireContext('cctv.manage')
  try {
    const key = await createRelayKey(ctx)
    revalidatePath('/settings/cctv')
    return { ok: true, message: 'Connection key created', key }
  } catch (error) {
    return fail(error, 'Could not create a key')
  }
}

export async function revokeRelayKeyAction(): Promise<Result> {
  const ctx = await requireContext('cctv.manage')
  try {
    await revokeRelayKey(ctx)
    revalidatePath('/settings/cctv')
    return { ok: true, message: 'The relay app has been disconnected' }
  } catch (error) {
    return fail(error, 'Could not disconnect')
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import { lmsFail } from '@/server/modules/lms/authoring'
import {
  archiveBatch,
  createBatch,
  deleteLiveClass,
  scheduleClasses,
  setCancelled,
  setRecording,
  updateBatch,
  updateLiveClass,
} from '@/server/modules/lms/live'
import type { LmsResult } from '@/components/lms/types'

function refresh() {
  revalidatePath('/lms/live', 'layout')
  revalidatePath('/my/learning/live', 'layout')
}

async function run(fallback: string, fn: () => Promise<LmsResult>): Promise<LmsResult> {
  try {
    const result = await fn()
    refresh()
    return result
  } catch (err) {
    return lmsFail(err, fallback)
  }
}

export async function createBatchAction(input: unknown) {
  const ctx = await requireContext('lms.teach')
  return run('The batch could not be created', async () => {
    const b = await createBatch(ctx, input as never)
    return { ok: true, id: b.id, message: `${b.title} created. Schedule its first class.` }
  })
}

export async function updateBatchAction(id: string, input: unknown) {
  const ctx = await requireContext('lms.teach')
  return run('The batch could not be saved', async () => {
    await updateBatch(ctx, id, input as never)
    return { ok: true, message: 'Batch saved.' }
  })
}

export async function archiveBatchAction(id: string) {
  const ctx = await requireContext('lms.teach')
  return run('The batch could not be archived', async () => {
    const b = await archiveBatch(ctx, id)
    return { ok: true, message: `${b.title} archived.` }
  })
}

export async function scheduleClassesAction(batchId: string, input: unknown) {
  const ctx = await requireContext('lms.teach')
  return run('The class could not be scheduled', async () => {
    const count = await scheduleClasses(ctx, batchId, input as never)
    return { ok: true, message: count === 1 ? 'Class scheduled.' : `${count} weekly classes scheduled.` }
  })
}

export async function updateLiveClassAction(id: string, input: unknown) {
  const ctx = await requireContext('lms.teach')
  return run('The class could not be saved', async () => {
    await updateLiveClass(ctx, id, input as never)
    return { ok: true, message: 'Class updated.' }
  })
}

export async function setRecordingAction(id: string, url: string) {
  const ctx = await requireContext('lms.teach')
  return run('The recording could not be saved', async () => {
    const row = await setRecording(ctx, id, url)
    return { ok: true, message: row.recordingUrl ? 'Recording added. Students can watch it now.' : 'Recording removed.' }
  })
}

export async function setCancelledAction(id: string, cancelled: boolean) {
  const ctx = await requireContext('lms.teach')
  return run('The class could not be changed', async () => {
    await setCancelled(ctx, id, cancelled)
    return { ok: true, message: cancelled ? 'Class cancelled.' : 'Class back on.' }
  })
}

export async function deleteLiveClassAction(id: string) {
  const ctx = await requireContext('lms.teach')
  return run('The class could not be deleted', async () => {
    const row = await deleteLiveClass(ctx, id)
    return { ok: true, message: `${row.title} deleted.` }
  })
}

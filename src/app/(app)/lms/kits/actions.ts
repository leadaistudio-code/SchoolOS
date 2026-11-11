'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import { lmsFail } from '@/server/modules/lms/authoring'
import { archiveKit, createKit, issueKit, returnKit, studentsInClass, updateKit } from '@/server/modules/lms/kits'
import type { LmsResult } from '@/components/lms/types'

async function run(fallback: string, fn: () => Promise<LmsResult>): Promise<LmsResult> {
  try {
    const result = await fn()
    revalidatePath('/lms/kits', 'layout')
    revalidatePath('/my/learning', 'layout')
    return result
  } catch (err) {
    return lmsFail(err, fallback)
  }
}

export async function createKitAction(input: unknown) {
  const ctx = await requireContext('lms.manage')
  return run('The kit could not be added', async () => {
    const kit = await createKit(ctx, input as never)
    return { ok: true, id: kit.id, message: `${kit.quantity} × ${kit.name} added` }
  })
}

export async function updateKitAction(id: string, input: unknown) {
  const ctx = await requireContext('lms.manage')
  return run('The kit could not be saved', async () => {
    const kit = await updateKit(ctx, id, input as never)
    return { ok: true, message: `${kit.name} saved` }
  })
}

export async function archiveKitAction(id: string) {
  const ctx = await requireContext('lms.manage')
  return run('The kit could not be removed', async () => {
    const kit = await archiveKit(ctx, id)
    return { ok: true, message: `${kit.name} removed` }
  })
}

export async function issueKitAction(kitId: string, input: unknown) {
  const ctx = await requireContext('lms.teach')
  return run('The kit could not be issued', async () => {
    const loan = await issueKit(ctx, kitId, input as never)
    return { ok: true, message: `${loan.quantity} × ${loan.kit.name} issued` }
  })
}

export async function returnKitAction(loanId: string, input: unknown) {
  const ctx = await requireContext('lms.teach')
  return run('The return could not be recorded', async () => {
    const loan = await returnKit(ctx, loanId, input as never)
    return { ok: true, message: `${loan.kit.name} checked back in` }
  })
}

export async function studentsInClassAction(classLevelId: string) {
  const ctx = await requireContext('lms.teach')
  try {
    return await studentsInClass(ctx, classLevelId)
  } catch {
    return []
  }
}

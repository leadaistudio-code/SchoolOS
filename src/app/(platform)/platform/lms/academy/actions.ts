'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformContext } from '@/server/context'
import { lmsFail } from '@/server/modules/lms/authoring'
import { formatRupees, setAcademyPrice, setupAcademy } from '@/server/modules/lms/academy'
import type { LmsResult } from '@/components/lms/types'

export async function setupAcademyAction(input: unknown): Promise<LmsResult> {
  const ctx = await requirePlatformContext('platform.lms')
  if (!ctx.user.permissions.has('platform.tenants')) return { ok: false, message: 'Setting up the Academy needs permission to create schools' }
  try {
    const tenant = await setupAcademy(ctx, input)
    revalidatePath('/platform/lms', 'layout')
    return { ok: true, id: tenant.id, message: 'The Academy is ready.' }
  } catch (err) {
    return lmsFail(err, 'The Academy could not be set up')
  }
}

export async function setAcademyPriceAction(courseId: string, price: string): Promise<LmsResult> {
  const ctx = await requirePlatformContext('platform.lms')
  try {
    const r = await setAcademyPrice(ctx, courseId, price)
    revalidatePath('/platform/lms/academy')
    return {
      ok: true,
      message:
        r.priceMinor === null
          ? `${r.title} is no longer on the Academy.`
          : `${r.title}: ${r.priceMinor === 0 ? 'free' : formatRupees(r.priceMinor)} on the Academy.`,
    }
  } catch (err) {
    return lmsFail(err, 'The price could not be saved')
  }
}

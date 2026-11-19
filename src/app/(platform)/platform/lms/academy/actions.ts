'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformContext } from '@/server/context'
import { lmsFail } from '@/server/modules/lms/authoring'
import {
  ensureAcademyFreemiumPricing,
  formatRupees,
  setAcademyPrice,
  setupAcademy,
} from '@/server/modules/lms/academy'
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

/** First 3 lessons free, unlock the rest for ₹499 on every published Academy course. */
export async function applyAcademyFreemiumAction(): Promise<LmsResult> {
  const ctx = await requirePlatformContext('platform.lms')
  try {
    const r = await ensureAcademyFreemiumPricing({
      userId: ctx.user.userId,
      firstName: ctx.user.firstName,
      lastName: ctx.user.lastName,
    })
    revalidatePath('/platform/lms/academy')
    revalidatePath('/academy', 'layout')
    return {
      ok: true,
      message:
        r.updated === 0
          ? `All courses already at ${formatRupees(r.priceMinor)} freemium.`
          : `Updated ${r.updated} course${r.updated === 1 ? '' : 's'}: first ${r.freeLessons} lessons free, unlock ${formatRupees(r.priceMinor)}.`,
    }
  } catch (err) {
    return lmsFail(err, 'Freemium pricing could not be applied')
  }
}

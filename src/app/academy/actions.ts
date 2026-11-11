'use server'

import { revalidatePath } from 'next/cache'
import { getContext } from '@/server/context'
import { lmsFail } from '@/server/modules/lms/authoring'
import {
  confirmPurchase,
  confirmSimulatedPurchase,
  requireAcademyHost,
  signUpLearner,
  startPurchase,
  type CheckoutStart,
  type SettleOutcome,
  type SignupResult,
} from '@/server/modules/lms/academy'

type Fail = { ok: false; message: string }

async function learnerContext() {
  const ctx = await getContext()
  if (!ctx) throw new Error('Sign in to continue')
  return ctx
}

function settled(outcome: SettleOutcome) {
  revalidatePath('/academy', 'layout')
  revalidatePath('/my/learning', 'layout')
  return outcome.status === 'failed'
    ? ({ ok: false, message: `${outcome.reason}. If money left your account, it will be refunded automatically, or contact us.` } as const)
    : ({ ok: true, courseId: outcome.courseId, message: 'Payment received. Your course is ready.' } as const)
}

export async function signUpAction(input: unknown): Promise<SignupResult> {
  const tenant = await requireAcademyHost()
  try {
    return await signUpLearner(tenant.id, input)
  } catch (err) {
    console.error('[academy] sign-up failed', err)
    return { ok: false, message: 'Your account could not be created. Please try again.' }
  }
}

export async function startPurchaseAction(courseId: string): Promise<({ ok: true } & CheckoutStart) | Fail> {
  try {
    const result = await startPurchase(await learnerContext(), courseId)
    if (result.kind === 'enrolled') revalidatePath('/academy', 'layout')
    return { ok: true, ...result }
  } catch (err) {
    return lmsFail(err, 'The payment could not be started') as Fail
  }
}

export async function confirmPurchaseAction(input: {
  orderId: string
  paymentId: string
  providerOrderId: string
  signature: string
}) {
  try {
    return settled(await confirmPurchase(await learnerContext(), input))
  } catch (err) {
    console.error('[academy] confirming a payment failed', err)
    return lmsFail(err, 'The payment could not be confirmed') as Fail
  }
}

export async function confirmSimulatedPurchaseAction(orderId: string) {
  try {
    return settled(await confirmSimulatedPurchase(await learnerContext(), orderId))
  } catch (err) {
    return lmsFail(err, 'The payment could not be completed') as Fail
  }
}

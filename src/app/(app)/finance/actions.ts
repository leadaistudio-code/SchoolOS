'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  collectPayment,
  collectSchema,
  refundPayment,
  refundSchema,
  startOnlinePayment,
  startPaymentSchema,
} from '@/server/modules/finance/payments'
import {
  generateInvoices,
  generateInvoicesSchema,
  type GenerationResult,
} from '@/server/modules/finance/service'

export type ActionResult<T = unknown> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string }

function fail(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof ZodError) {
    return { ok: false, message: err.issues[0]?.message ?? fallback }
  }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

/** Records a counter payment and returns the receipt number to show at once. */
export async function collectPaymentAction(payload: unknown): Promise<ActionResult<{
  receiptNumber: string
  allocatedMinor: number
  unallocatedMinor: number
}>> {
  const ctx = await requireContext('fees.collect')
  try {
    const input = collectSchema.parse(payload)
    const result = await collectPayment(ctx, input)

    revalidatePath('/finance')
    revalidatePath('/finance/payments')
    revalidatePath('/finance/invoices')

    const parts = [`Receipt ${result.receiptNumber}`]
    if (result.unallocatedMinor > 0) {
      parts.push(`₹${result.unallocatedMinor / 100} held as advance`)
    }
    return {
      ok: true,
      message: parts.join(' · '),
      data: {
        receiptNumber: result.receiptNumber,
        allocatedMinor: result.allocatedMinor,
        unallocatedMinor: result.unallocatedMinor,
      },
    }
  } catch (err) {
    return fail(err, 'The payment could not be recorded')
  }
}

export async function generateInvoicesAction(
  payload: unknown,
): Promise<ActionResult<GenerationResult>> {
  const ctx = await requireContext('fees.invoice')
  try {
    const input = generateInvoicesSchema.parse(payload)
    const result = await generateInvoices(ctx, input)

    if (!input.dryRun) {
      revalidatePath('/finance/invoices')
      revalidatePath('/finance')
    }

    return {
      ok: true,
      message: input.dryRun
        ? `${result.preview.filter((p) => !p.skipReason).length} invoices ready, ${result.skipped} already billed`
        : `Generated ${result.created} invoices totalling ₹${result.totalMinor / 100}`,
      data: result,
    }
  } catch (err) {
    return fail(err, 'Invoices could not be generated')
  }
}

export async function refundPaymentAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.refund')
  try {
    await refundPayment(ctx, refundSchema.parse(payload))
    revalidatePath('/finance/payments')
    revalidatePath('/finance')
    return { ok: true, message: 'Refunded. The invoice balance has been restored.' }
  } catch (err) {
    return fail(err, 'The refund could not be processed')
  }
}

export async function startPaymentAction(
  payload: unknown,
): Promise<ActionResult<{ checkoutUrl?: string; paymentId: string }>> {
  const ctx = await requireContext('fees.view')
  try {
    const result = await startOnlinePayment(ctx, startPaymentSchema.parse(payload))
    return {
      ok: true,
      message: 'Redirecting you to the payment page',
      data: { checkoutUrl: result.checkoutUrl, paymentId: result.paymentId },
    }
  } catch (err) {
    return fail(err, 'The payment could not be started')
  }
}

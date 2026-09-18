'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  collectPayment,
  collectSchema,
  editPayment,
  editPaymentSchema,
  refundPayment,
  refundSchema,
  reversePayment,
  reversePaymentSchema,
  startOnlinePayment,
  startPaymentSchema,
} from '@/server/modules/finance/payments'
import {
  concessionSchema,
  concessionUpdateSchema,
  createFeeHead,
  createStructure,
  deleteFeeHead,
  deleteStructure,
  feeHeadSchema,
  feeHeadUpdateSchema,
  generateInvoices,
  generateInvoicesSchema,
  grantConcession,
  setStudentFeeOptions,
  setStudentFeeOptionsSchema,
  structureSchema,
  structureUpdateSchema,
  updateFeeHead,
  updateConcession,
  updateStructure,
  type GenerationResult,
} from '@/server/modules/finance/service'
import {
  previewFeePlan,
  copyFeePlan,
  customInvoiceGenerationSchema,
  generateCustomInvoices,
  type CustomInvoiceGenerationResult,
  previewFeePlanAssignment,
  publishAndAssignFeePlan,
  saveFeePlanDraft,
  sendFeeReminders,
  saveFeeReminderRule,
  saveLateFeeRule,
  saveTransportFeeRate,
  setInvoiceChargeAmount,
  setInvoiceChargeAmountSchema,
  simulateFeeIncrease,
} from '@/server/modules/finance/simplicity'

export type ActionResult<T = unknown> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string }

function fail(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof ZodError) {
    return { ok: false, message: err.issues[0]?.message ?? fallback }
  }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

export async function grantConcessionAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.concession')
  try {
    const result = await grantConcession(ctx, concessionSchema.parse(payload))
    revalidatePath('/finance/concessions')
    revalidatePath('/finance/students')
    revalidatePath('/finance/dues')
    return {
      ok: true,
      message: result.recalculation.affectedInvoices
        ? 'Discount granted and the student’s current outstanding was recalculated.'
        : 'Discount granted. It will apply when an eligible invoice is generated.',
    }
  } catch (err) {
    return fail(err, 'The concession could not be granted')
  }
}

export async function updateConcessionAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.concession')
  try {
    const result = await updateConcession(ctx, concessionUpdateSchema.parse(payload))
    revalidatePath('/finance/concessions')
    revalidatePath('/finance/students')
    revalidatePath('/finance/dues')
    return {
      ok: true,
      message: result.recalculation.affectedInvoices
        ? 'Discount updated and the student’s current outstanding was recalculated.'
        : 'Discount updated.',
    }
  } catch (err) {
    return fail(err, 'The discount could not be updated')
  }
}

export async function createFeeHeadAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure')
  try {
    const created = await createFeeHead(ctx, feeHeadSchema.parse(payload))
    revalidatePath('/finance/structures')
    revalidatePath('/finance/concessions')
    return { ok: true, message: `${created.name} (${created.code}) added to fee heads.` }
  } catch (err) {
    return fail(err, 'The fee head could not be created')
  }
}

export async function createStructureAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure')
  try {
    const created = await createStructure(ctx, structureSchema.parse(payload))
    revalidatePath('/finance/structures')
    revalidatePath('/finance/invoices')
    return {
      ok: true,
      message: `${created.name} created. Generate invoices when you are ready to bill students.`,
    }
  } catch (err) {
    return fail(err, 'The fee structure could not be created')
  }
}

export async function updateFeeHeadAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure')
  try {
    const updated = await updateFeeHead(ctx, feeHeadUpdateSchema.parse(payload))
    revalidatePath('/finance/structures')
    revalidatePath('/finance/concessions')
    return { ok: true, message: `${updated.name} (${updated.code}) updated.` }
  } catch (err) {
    return fail(err, 'The fee head could not be updated')
  }
}

export async function deleteFeeHeadAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure')
  try {
    const removed = await deleteFeeHead(ctx, id)
    revalidatePath('/finance/structures')
    revalidatePath('/finance/concessions')
    return { ok: true, message: `${removed.name} removed from fee heads.` }
  } catch (err) {
    return fail(err, 'The fee head could not be removed')
  }
}

export async function updateStructureAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure')
  try {
    const updated = await updateStructure(ctx, structureUpdateSchema.parse(payload))
    revalidatePath('/finance/structures')
    revalidatePath('/finance/invoices')
    return { ok: true, message: `${updated.name} updated.` }
  } catch (err) {
    return fail(err, 'The fee structure could not be updated')
  }
}

export async function deleteStructureAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure')
  try {
    const removed = await deleteStructure(ctx, id)
    revalidatePath('/finance/structures')
    revalidatePath('/finance/invoices')
    return { ok: true, message: `${removed.name} removed.` }
  } catch (err) {
    return fail(err, 'The fee structure could not be removed')
  }
}

export async function setStudentFeeOptionsAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure')
  try {
    const result = await setStudentFeeOptions(ctx, setStudentFeeOptionsSchema.parse(payload))
    revalidatePath('/finance/optional-fees')
    revalidatePath('/finance/structures')
    revalidatePath('/finance/invoices')
    return {
      ok: true,
      message:
        result.count === 0
          ? 'No students are opted into this optional fee.'
          : `${result.count} student${result.count === 1 ? '' : 's'} will be charged this optional fee.`,
    }
  } catch (err) {
    return fail(err, 'Could not save optional fee opt-ins')
  }
}

/** Records a counter payment and returns the receipt number to show at once. */
export async function collectPaymentAction(payload: unknown): Promise<ActionResult<{
  paymentId: string
  receiptNumber: string
  allocatedMinor: number
  unallocatedMinor: number
  discountedMinor: number
}>> {
  const ctx = await requireContext('fees.collect')
  try {
    const input = collectSchema.parse(payload)
    const result = await collectPayment(ctx, input)

    revalidatePath('/finance')
    revalidatePath('/finance/payments')
    revalidatePath('/finance/invoices')
    revalidatePath('/finance/dues')
    revalidatePath('/finance/students')

    const parts = [`Receipt ${result.receiptNumber}`]
    if (result.discountedMinor > 0) {
      parts.push(`₹${result.discountedMinor / 100} discounted`)
    }
    if (result.unallocatedMinor > 0) {
      parts.push(`₹${result.unallocatedMinor / 100} held as advance`)
    }
    return {
      ok: true,
      message: parts.join(' · '),
      data: {
        paymentId: result.paymentId,
        receiptNumber: result.receiptNumber,
        allocatedMinor: result.allocatedMinor,
        unallocatedMinor: result.unallocatedMinor,
        discountedMinor: result.discountedMinor,
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

export async function generateCustomInvoicesAction(
  payload: unknown,
): Promise<ActionResult<CustomInvoiceGenerationResult>> {
  const ctx = await requireContext('fees.invoice')
  try {
    const input = customInvoiceGenerationSchema.parse(payload)
    const result = await generateCustomInvoices(ctx, input)
    if (!input.dryRun) {
      revalidatePath('/finance')
      revalidatePath('/finance/invoices')
      revalidatePath('/finance/dues')
      revalidatePath('/finance/students')
    }
    return {
      ok: true,
      message: input.dryRun
        ? `${result.preview.filter((item) => !item.skipReason).length} fee invoices ready`
        : `${result.created} invoices generated${result.scheduled ? ` · ${result.scheduled} students scheduled` : ''}`,
      data: result,
    }
  } catch (err) {
    return fail(err, 'Custom invoices could not be generated')
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

export async function reversePaymentAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.reverse')
  try {
    const result = await reversePayment(ctx, reversePaymentSchema.parse(payload))
    revalidatePath('/finance')
    revalidatePath('/finance/payments')
    revalidatePath(`/finance/payments/${result.paymentId}`)
    revalidatePath('/finance/students')
    revalidatePath(`/finance/students/${result.studentId}`)
    revalidatePath('/finance/dues')
    revalidatePath('/finance/collect')
    return { ok: true, message: 'Receipt cancelled. Original receipt retained and balances restored.' }
  } catch (err) {
    return fail(err, 'The receipt could not be cancelled')
  }
}

export async function editPaymentAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.collect')
  try {
    const result = await editPayment(ctx, editPaymentSchema.parse(payload))
    revalidatePath('/finance/payments')
    revalidatePath(`/finance/payments/${result.paymentId}`)
    revalidatePath('/finance/students')
    revalidatePath(`/finance/students/${result.studentId}`)
    revalidatePath('/finance/collect')
    return { ok: true, message: 'Receipt details updated.' }
  } catch (err) {
    return fail(err, 'The receipt could not be updated')
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

export async function previewFeePlanAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure')
  try {
    return { ok: true, message: 'Installments calculated', data: await previewFeePlan(ctx, payload) }
  } catch (err) {
    return fail(err, 'Could not calculate the fee plan')
  }
}

export async function saveFeePlanDraftAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure')
  try {
    const result = await saveFeePlanDraft(ctx, payload)
    revalidatePath('/finance/structures')
    return { ok: true, message: `${result.structure.name} saved as draft.`, data: result }
  } catch (err) {
    return fail(err, 'Could not save the fee plan')
  }
}

export async function copyFeePlanAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure')
  try {
    const structure = await copyFeePlan(ctx, payload)
    revalidatePath('/finance/structures')
    return { ok: true, message: `${structure.name} copied as a draft.`, data: structure }
  } catch (err) {
    return fail(err, 'Could not copy the fee structure')
  }
}

export async function previewFeeAssignmentAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure_publish')
  try {
    return { ok: true, message: 'Assignment preview ready', data: await previewFeePlanAssignment(ctx, payload) }
  } catch (err) {
    return fail(err, 'Could not preview this assignment')
  }
}

export async function publishFeePlanAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.structure_publish')
  try {
    const result = await publishAndAssignFeePlan(ctx, payload)
    revalidatePath('/finance')
    revalidatePath('/finance/structures')
    revalidatePath('/finance/students')
    revalidatePath('/finance/dues')
    return {
      ok: true,
      message: `Published and assigned ${result.assigned} students. ${result.invoices} installments created.`,
      data: result,
    }
  } catch (err) {
    return fail(err, 'Could not publish the fee plan')
  }
}

export async function sendFeeRemindersAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.reminder')
  try {
    const result = await sendFeeReminders(ctx, payload)
    revalidatePath('/finance/dues')
    return { ok: true, message: `${result.sent} reminder${result.sent === 1 ? '' : 's'} sent.`, data: result }
  } catch (err) {
    return fail(err, 'Could not send reminders')
  }
}

export async function simulateFeeIncreaseAction(payload: {
  structureId: string
  kind: 'PERCENT' | 'FIXED'
  value: number
}): Promise<ActionResult> {
  const ctx = await requireContext('fees.owner_analytics')
  try {
    return {
      ok: true,
      message: 'Estimated billing impact calculated',
      data: await simulateFeeIncrease(ctx, payload.structureId, payload.kind, payload.value),
    }
  } catch (err) {
    return fail(err, 'Could not calculate the estimate')
  }
}

export async function saveFeeReminderRuleAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.settings')
  try {
    const rule = await saveFeeReminderRule(ctx, payload)
    revalidatePath('/finance/settings')
    return { ok: true, message: `${rule.name} saved.` }
  } catch (err) {
    return fail(err, 'Could not save the reminder rule')
  }
}

export async function saveLateFeeRuleAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.settings')
  try {
    const rule = await saveLateFeeRule(ctx, payload)
    revalidatePath('/finance/settings')
    return { ok: true, message: `${rule.name} saved.` }
  } catch (err) {
    return fail(err, 'Could not save the late fee rule')
  }
}

export async function saveTransportFeeRateAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('fees.settings')
  try {
    await saveTransportFeeRate(ctx, payload)
    revalidatePath('/finance/settings')
    return { ok: true, message: 'Transport fee rate saved.' }
  } catch (err) {
    return fail(err, 'Could not save the transport fee rate')
  }
}

export async function setInvoiceChargeAmountAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext()
  if (!ctx.can('fees.concession') && !ctx.can('fees.invoice')) {
    ctx.require('fees.concession')
  }
  try {
    const updated = await setInvoiceChargeAmount(ctx, setInvoiceChargeAmountSchema.parse(payload))
    revalidatePath('/finance/students')
    revalidatePath(`/finance/students/${updated.studentId}`)
    revalidatePath('/finance/collect')
    revalidatePath('/finance/dues')
    revalidatePath('/finance/invoices')
    return {
      ok: true,
      message: `Invoice charge updated to ₹${(updated.totalMinor / 100).toLocaleString('en-IN')}.`,
    }
  } catch (err) {
    return fail(err, 'The invoice amount could not be updated')
  }
}

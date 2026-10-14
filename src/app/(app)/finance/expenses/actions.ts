'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  createExpense,
  deleteExpense,
  expenseSchema,
  expenseUpdateSchema,
  updateExpense,
} from '@/server/modules/finance/expenses'
import {
  createExpenseHead,
  expenseHeadSchema,
  expenseHeadUpdateSchema,
  updateExpenseHead,
} from '@/server/modules/finance/expense-heads'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { createExpenseRequest } from '@/server/modules/accounting/expense-approval-service'

export type ActionResult =
  | { ok: true; message: string; id?: string; receiptUrl?: string }
  | { ok: false; message: string }

function fail(err: unknown, fallback: string): ActionResult {
  if (err instanceof ZodError) {
    return { ok: false, message: err.issues[0]?.message ?? fallback }
  }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

function revalidateExpenses() {
  revalidatePath('/finance/expenses')
  revalidatePath('/finance/expenses/heads')
  revalidatePath('/finance')
}

export async function createExpenseAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('expenses.manage')
  try {
    if ((await getAccountingFlags(ctx.db)).approvals) {
      const request = await createExpenseRequest(ctx, { ...(payload as object), submit: true })
      revalidatePath('/accounts/expense-approvals')
      return {
        ok: true,
        id: request.id,
        receiptUrl: `/api/v1/accounting/expense-approvals/${request.id}/receipt`,
        message: `${request.number} submitted for approval. It reaches the books only after final approval.`,
      }
    }
    const created = await createExpense(ctx, expenseSchema.parse(payload))
    revalidateExpenses()
    return { ok: true, id: created.id, message: `${created.title} recorded for ₹${created.amountMinor / 100}.` }
  } catch (err) {
    return fail(err, 'The expense could not be recorded')
  }
}

export async function updateExpenseAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('expenses.manage')
  try {
    const updated = await updateExpense(ctx, expenseUpdateSchema.parse(payload))
    revalidateExpenses()
    return { ok: true, id: updated.id, message: `${updated.title} updated.` }
  } catch (err) {
    return fail(err, 'The expense could not be updated')
  }
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('expenses.manage')
  try {
    const removed = await deleteExpense(ctx, id)
    revalidateExpenses()
    return { ok: true, message: `${removed.title} removed.` }
  } catch (err) {
    return fail(err, 'The expense could not be removed')
  }
}

export async function saveExpenseHeadAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('expenses.manage')
  try {
    const raw = payload as { id?: string }
    const head = raw?.id
      ? await updateExpenseHead(ctx, expenseHeadUpdateSchema.parse(payload))
      : await createExpenseHead(ctx, expenseHeadSchema.parse(payload))
    revalidateExpenses()
    revalidatePath('/accounts/profit-loss')
    return { ok: true, id: head.id, message: `${head.name} saved as a ${head.nature.toLowerCase()} expense.` }
  } catch (err) {
    return fail(err, 'The expense head could not be saved')
  }
}

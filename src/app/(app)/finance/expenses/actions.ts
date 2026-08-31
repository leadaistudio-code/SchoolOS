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

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

function fail(err: unknown, fallback: string): ActionResult {
  if (err instanceof ZodError) {
    return { ok: false, message: err.issues[0]?.message ?? fallback }
  }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

export async function createExpenseAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('expenses.manage')
  try {
    const created = await createExpense(ctx, expenseSchema.parse(payload))
    revalidatePath('/finance/expenses')
    return { ok: true, message: `${created.title} recorded for ₹${created.amountMinor / 100}.` }
  } catch (err) {
    return fail(err, 'The expense could not be recorded')
  }
}

export async function updateExpenseAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('expenses.manage')
  try {
    const updated = await updateExpense(ctx, expenseUpdateSchema.parse(payload))
    revalidatePath('/finance/expenses')
    return { ok: true, message: `${updated.title} updated.` }
  } catch (err) {
    return fail(err, 'The expense could not be updated')
  }
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('expenses.manage')
  try {
    const removed = await deleteExpense(ctx, id)
    revalidatePath('/finance/expenses')
    return { ok: true, message: `${removed.title} removed.` }
  } catch (err) {
    return fail(err, 'The expense could not be removed')
  }
}

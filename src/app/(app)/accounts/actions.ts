'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import {
  accountSchema,
  accountUpdateSchema,
  createAccount,
  createManualJournal,
  journalSchema,
  ledgerSettingsSchema,
  mappingSchema,
  reverseJournalSchema,
  reverseManualJournal,
  runLedgerSync,
  setMapping,
  updateAccount,
  updateLedgerSettings,
} from '@/server/modules/accounts/service'

export type ActionResult<T = unknown> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string }

function fail(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof ZodError) return { ok: false, message: err.issues[0]?.message ?? fallback }
  if (err instanceof ApiException) return { ok: false, message: err.message }
  console.error('[accounts] action failed', err)
  return { ok: false, message: fallback }
}

function revalidateBooks() {
  revalidatePath('/accounts', 'layout')
}

export async function saveAccountAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('accounts.manage')
  try {
    const hasId = !!(payload && typeof payload === 'object' && 'id' in payload && (payload as { id?: unknown }).id)
    const account = hasId
      ? await updateAccount(ctx, accountUpdateSchema.parse(payload))
      : await createAccount(ctx, accountSchema.parse(payload))
    revalidateBooks()
    return { ok: true, message: `${account.code} ${account.name} saved` }
  } catch (err) {
    return fail(err, 'The account could not be saved')
  }
}

export async function createJournalAction(payload: unknown): Promise<ActionResult<{ id: string; number: string }>> {
  const ctx = await requireContext('accounts.manage')
  try {
    const entry = await createManualJournal(ctx, journalSchema.parse(payload))
    revalidateBooks()
    return { ok: true, message: `Voucher ${entry.number} posted`, data: { id: entry.id, number: entry.number } }
  } catch (err) {
    return fail(err, 'The voucher could not be posted')
  }
}

export async function reverseJournalAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('accounts.manage')
  try {
    const reversal = await reverseManualJournal(ctx, reverseJournalSchema.parse(payload))
    revalidateBooks()
    return { ok: true, message: `Reversed with ${reversal.number}` }
  } catch (err) {
    return fail(err, 'The voucher could not be reversed')
  }
}

export async function setMappingAction(formData: FormData) {
  const ctx = await requireContext('accounts.manage')
  await setMapping(ctx, mappingSchema.parse({
    kind: formData.get('kind'),
    localKey: formData.get('localKey'),
    accountId: formData.get('accountId') ?? '',
  }))
  revalidatePath('/accounts/settings')
}

export async function saveLedgerSettingsAction(formData: FormData) {
  const ctx = await requireContext('accounts.manage')
  await updateLedgerSettings(ctx, ledgerSettingsSchema.parse({
    autoPostFees: formData.get('autoPostFees') === 'on',
    autoPostExpenses: formData.get('autoPostExpenses') === 'on',
    autoPostStore: formData.get('autoPostStore') === 'on',
  }))
  revalidatePath('/accounts/settings')
}

export async function syncBooksAction(formData: FormData) {
  const ctx = await requireContext('accounts.manage')
  const full = formData.get('full') === '1'
  const s = await runLedgerSync(ctx, full)
  revalidateBooks()
  const q = new URLSearchParams({
    synced: '1',
    posted: String(s.posted),
    reposted: String(s.reposted),
    reversed: String(s.reversed),
    failed: String(s.failed),
  })
  redirect(`/accounts/settings?${q.toString()}`)
}

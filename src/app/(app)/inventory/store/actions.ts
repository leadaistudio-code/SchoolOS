'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  adjustStock,
  bulkGenerateStoreBarcodes,
  createStoreItem,
  createStorePurchase,
  createStoreSale,
  deleteStoreItem,
  setStoreItemActive,
  updateStoreItem,
  voidStoreSale,
} from '@/server/modules/store/service'
import { createStoreExchange, createStoreReturn } from '@/server/modules/store/returns'

export type StoreActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string }

function fail(err: unknown, fallback: string): StoreActionResult {
  if (err instanceof ZodError) return { ok: false, message: err.issues[0]?.message ?? fallback }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

function revalidateStore() {
  revalidatePath('/inventory/store', 'layout')
}

export async function createStoreItemAction(payload: unknown): Promise<StoreActionResult> {
  const ctx = await requireContext('store.manage')
  try {
    const item = await createStoreItem(ctx, payload as never)
    revalidateStore()
    return {
      ok: true,
      id: item.id,
      message: `${item.name} added (${item.sku}${item.barcode ? ` · barcode ${item.barcode}` : ''}).`,
    }
  } catch (err) {
    return fail(err, 'The item could not be added')
  }
}

export async function bulkGenerateStoreBarcodesAction(itemIds?: string[]): Promise<StoreActionResult> {
  const ctx = await requireContext('store.manage')
  try {
    const result = await bulkGenerateStoreBarcodes(ctx, itemIds)
    revalidateStore()
    if (result.generated === 0) {
      return { ok: true, message: 'Every item already has a barcode.' }
    }
    return {
      ok: true,
      message: `Generated ${result.generated} unique piece barcode${result.generated === 1 ? '' : 's'}. Ready to print.`,
    }
  } catch (err) {
    return fail(err, 'Barcodes could not be generated')
  }
}

export async function updateStoreItemAction(payload: unknown): Promise<StoreActionResult> {
  const ctx = await requireContext('store.manage')
  try {
    const item = await updateStoreItem(ctx, payload as never)
    revalidateStore()
    return { ok: true, id: item.id, message: `${item.name} updated.` }
  } catch (err) {
    return fail(err, 'The item could not be updated')
  }
}

export async function setStoreItemActiveAction(id: string, active: boolean): Promise<StoreActionResult> {
  const ctx = await requireContext('store.manage')
  try {
    const item = await setStoreItemActive(ctx, id, active)
    revalidateStore()
    return { ok: true, message: active ? `${item.name} is back on sale.` : `${item.name} hidden from the counter.` }
  } catch (err) {
    return fail(err, 'The item could not be changed')
  }
}

export async function deleteStoreItemAction(id: string, reason: string): Promise<StoreActionResult> {
  const ctx = await requireContext('store.delete')
  try {
    const r = await deleteStoreItem(ctx, { id, reason })
    revalidateStore()
    return {
      ok: true,
      message: r.units ? `Item deleted and ${r.units} in stock written off.` : 'Item deleted.',
    }
  } catch (err) {
    return fail(err, 'The item could not be deleted')
  }
}

export async function adjustStockAction(payload: unknown): Promise<StoreActionResult> {
  const ctx = await requireContext('store.manage')
  try {
    const m = await adjustStock(ctx, payload as never)
    revalidateStore()
    return { ok: true, message: `Stock updated. ${m.balanceAfter} now in hand.` }
  } catch (err) {
    return fail(err, 'The stock could not be adjusted')
  }
}

export async function createStorePurchaseAction(payload: unknown): Promise<StoreActionResult> {
  const ctx = await requireContext('store.manage')
  try {
    const p = await createStorePurchase(ctx, payload as never)
    revalidateStore()
    return {
      ok: true,
      id: p.id,
      message: `${p.number} saved. Stock increased.${p.vendorCreated ? ` Vendor ${p.vendorCreated} added.` : ''}`,
    }
  } catch (err) {
    return fail(err, 'The stock receipt could not be saved')
  }
}

export async function createStoreSaleAction(payload: unknown): Promise<StoreActionResult> {
  const ctx = await requireContext('store.sell')
  try {
    const sale = await createStoreSale(ctx, payload as never)
    revalidateStore()
    if (sale.feeInvoice) {
      revalidatePath('/finance', 'layout')
      return {
        ok: true,
        id: sale.id,
        message:
          sale.paymentMode === 'SPLIT'
            ? `Bill ${sale.number} saved. ₹${sale.feeInvoice.totalMinor / 100} added to fees (${sale.feeInvoice.number}).`
            : `Bill ${sale.number} for ₹${sale.totalMinor / 100} added to fees (${sale.feeInvoice.number}).`,
      }
    }
    return { ok: true, id: sale.id, message: `Bill ${sale.number} saved for ₹${sale.totalMinor / 100}.` }
  } catch (err) {
    return fail(err, 'The bill could not be saved')
  }
}

export async function voidStoreSaleAction(id: string, reason: string): Promise<StoreActionResult> {
  const ctx = await requireContext('store.void')
  try {
    const sale = await voidStoreSale(ctx, id, reason)
    revalidateStore()
    if (sale.paymentMode === 'FEE_ACCOUNT' || sale.paymentMode === 'SPLIT') revalidatePath('/finance', 'layout')
    return { ok: true, message: `Bill ${sale.number} voided and stock returned.` }
  } catch (err) {
    return fail(err, 'The bill could not be voided')
  }
}

function requireReturnContext(ctx: Awaited<ReturnType<typeof requireContext>>) {
  if (!ctx.canAny('store.return', 'store.void')) {
    return { ok: false as const, message: 'You do not have permission to process returns or exchanges.' }
  }
  return null
}

export async function createStoreReturnAction(payload: unknown): Promise<StoreActionResult> {
  const ctx = await requireContext()
  const denied = requireReturnContext(ctx)
  if (denied) return denied
  try {
    const row = await createStoreReturn(ctx, payload as never)
    revalidateStore()
    return {
      ok: true,
      id: row.id,
      message: `${row.number} saved. Stock restored${row.refundMinor ? ` · refund ₹${row.refundMinor / 100}` : ''}.`,
    }
  } catch (err) {
    return fail(err, 'The return could not be saved')
  }
}

export async function createStoreExchangeAction(payload: unknown): Promise<StoreActionResult> {
  const ctx = await requireContext()
  const denied = requireReturnContext(ctx)
  if (denied) return denied
  try {
    const { record, exchangeSale } = await createStoreExchange(ctx, payload as never)
    revalidateStore()
    return {
      ok: true,
      id: record.id,
      message: `${record.number} saved. Replacement bill ${exchangeSale.number}.`,
    }
  } catch (err) {
    return fail(err, 'The exchange could not be saved')
  }
}

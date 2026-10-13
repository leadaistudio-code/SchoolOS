'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  adjustStock,
  createStoreItem,
  createStorePurchase,
  createStoreSale,
  setStoreItemActive,
  updateStoreItem,
  voidStoreSale,
} from '@/server/modules/store/service'

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
    return { ok: true, id: item.id, message: `${item.name} added (${item.sku}).` }
  } catch (err) {
    return fail(err, 'The item could not be added')
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
    return { ok: true, id: p.id, message: `${p.number} saved. Stock increased.` }
  } catch (err) {
    return fail(err, 'The stock receipt could not be saved')
  }
}

export async function createStoreSaleAction(payload: unknown): Promise<StoreActionResult> {
  const ctx = await requireContext('store.sell')
  try {
    const sale = await createStoreSale(ctx, payload as never)
    revalidateStore()
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
    return { ok: true, message: `Bill ${sale.number} voided and stock returned.` }
  } catch (err) {
    return fail(err, 'The bill could not be voided')
  }
}

import { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { AppContext } from '@/server/context'
import type { TenantClient } from '@/server/db/tenant-client'
import { ApiException, badRequest, conflict, forbidden, notFound } from '@/server/api/response'
import { nextDocumentNumber, financialYearLabel } from '@/server/numbering'
import { writeJournalEntry } from '@/server/modules/accounts/posting'
import { loadResolver } from '@/server/modules/accounts/chart'
import { reverseLines } from '@/server/modules/accounts/math'
import { uploadFile } from '@/server/files'
import { storageProvider } from '@/server/providers'
import { attendanceDate } from '@/lib/dates'
import { schoolToday } from '@/lib/periods'
import { assertPostingAllowed, getAccountingFlags, recordAccountingEvent } from './service'
import { isIsoDate, toIsoDay } from './fiscal-year'
import {
  allocateVendorPayment,
  billReducible,
  cancelledInvoiceKey,
  checkVendorTaxIds,
  computePurchaseLine,
  normaliseTaxId,
  priceDebitNote,
  sumPurchaseLines,
  summariseVendor,
  supplierInvoiceKey,
  type VendorFacts,
} from './payables'

// ------------------------------------------------------------------ setup

/** Ledger accounts this module needs. Created on first use, never for every school. */
export const PAYABLES_CHART = [
  { systemKey: 'SUNDRY_CREDITORS', code: '2101', name: 'Sundry Creditors', type: 'LIABILITY', description: 'Amounts owed to vendors for posted purchase vouchers' },
  { systemKey: 'DISCOUNT_RECEIVED', code: '4010', name: 'Discount Received', type: 'INCOME', description: 'Discounts allowed by vendors after billing' },
  { systemKey: 'CREDITORS_WRITTEN_BACK', code: '4011', name: 'Creditor Balances Written Back', type: 'INCOME', description: 'Vendor balances no longer payable' },
] as const

export const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI'] as const

const NOT_PURCHASE_ACCOUNTS = new Set(['CASH', 'BANK', 'STORE_STOCK', 'SUNDRY_CREDITORS'])

type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0]

function who(ctx: AppContext) {
  return { id: ctx.user.userId, label: `${ctx.user.firstName} ${ctx.user.lastName}`.trim() }
}

async function requirePayables(ctx: AppContext, permission: 'accounts.view' | 'accounts.manage') {
  ctx.require(permission)
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    throw new ApiException(403, 'FEATURE_DISABLED', 'Vendor accounting is not enabled for this school')
  }
  return flags
}

async function ensurePayablesChart(db: Pick<TenantClient, 'ledgerAccount'>, tenantId: string) {
  const existing = await db.ledgerAccount.findMany({ select: { systemKey: true, code: true } })
  const keys = new Set(existing.map((a) => a.systemKey).filter(Boolean))
  const codes = new Set(existing.map((a) => a.code))
  const missing = PAYABLES_CHART.filter((seed) => !keys.has(seed.systemKey))
  if (!missing.length) return
  await db.ledgerAccount.createMany({
    data: missing.map((seed) => {
      let code: string = seed.code
      for (let n = 1; codes.has(code); n++) code = `${seed.code}-${n}`
      codes.add(code)
      return { tenantId, ...seed, code }
    }),
    skipDuplicates: true,
  })
}

async function systemAccount(db: Pick<TenantClient, 'ledgerAccount'>, key: string) {
  const row = await db.ledgerAccount.findFirst({ where: { systemKey: key }, select: { id: true } })
  if (!row) throw new Error(`Ledger system account ${key} is missing`)
  return row.id
}

async function lockVendor(tx: Tx, tenantId: string, vendorId: string) {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    'SELECT "id" FROM "Vendor" WHERE "id" = $1 AND "tenantId" = $2 FOR UPDATE',
    vendorId,
    tenantId,
  )
  if (!rows.length) throw notFound('Vendor')
}

function isUniqueViolation(error: unknown, field?: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false
  if (!field) return true
  const target = (error.meta?.target ?? []) as string[] | string
  return Array.isArray(target) ? target.includes(field) : String(target).includes(field)
}

const isoDate = z.string().refine(isIsoDate, 'Enter a valid date')
const idempotencyKey = z.string().trim().min(8).max(100).optional()
const minor = z.number().int().positive().max(2_147_483_647)

// ------------------------------------------------------------------ vendors

export const vendorInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter the vendor name').max(160),
  code: z.string().trim().max(30).optional().or(z.literal('')),
  contactPerson: z.string().trim().max(120).optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').max(160).optional().or(z.literal('')),
  phone: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, 'Enter a valid phone number').optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  gstin: z.string().optional().or(z.literal('')),
  pan: z.string().optional().or(z.literal('')),
  creditDays: z.number().int().min(0).max(365).default(0),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
})
export type VendorInput = z.infer<typeof vendorInputSchema>

function vendorData(input: VendorInput) {
  const gstin = normaliseTaxId(input.gstin)
  const pan = normaliseTaxId(input.pan)
  const issues = checkVendorTaxIds(gstin, pan)
  if (issues.length) throw badRequest(issues[0]!.message, { issues })
  const blank = (v?: string) => (v && v.trim() ? v.trim() : null)
  return {
    name: input.name.trim(),
    contactPerson: blank(input.contactPerson),
    email: blank(input.email)?.toLowerCase() ?? null,
    phone: blank(input.phone),
    address: blank(input.address),
    gstin,
    pan: pan ?? (gstin ? gstin.slice(2, 12) : null),
    creditDays: input.creditDays,
    isActive: input.isActive,
    notes: blank(input.notes),
  }
}

async function nextVendorCode(tx: Tx, tenantId: string) {
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS locked', `${tenantId}:VENDOR_CODE`)
  const rows = await tx.$queryRawUnsafe<{ code: string }[]>(
    `SELECT "code" FROM "Vendor" WHERE "tenantId" = $1 AND "code" ~ '^VEN-[0-9]+$' ORDER BY length("code") DESC, "code" DESC LIMIT 1`,
    tenantId,
  )
  const last = rows[0] ? Number(rows[0].code.slice(4)) : 0
  return `VEN-${String(last + 1).padStart(5, '0')}`
}

export async function createVendor(ctx: AppContext, raw: unknown) {
  await requirePayables(ctx, 'accounts.manage')
  const input = vendorInputSchema.parse(raw)
  const data = vendorData(input)
  const actor = who(ctx)
  try {
    return await ctx.db.$transaction(async (tx) => {
      const code = input.code?.trim().toUpperCase() || (await nextVendorCode(tx, ctx.tenant.id))
      const vendor = await tx.vendor.create({ data: { tenantId: ctx.tenant.id, code, createdById: actor.id, ...data } })
      await recordAccountingEvent(tx, ctx.tenant.id, {
        entityType: 'Vendor', entityId: vendor.id, action: 'vendor.create', actorId: actor.id, actorLabel: actor.label,
        data: { code, name: data.name },
      })
      return vendor
    })
  } catch (error) {
    if (isUniqueViolation(error, 'code')) throw conflict('Another vendor already uses that code')
    throw error
  }
}

export async function updateVendor(ctx: AppContext, id: string, raw: unknown) {
  await requirePayables(ctx, 'accounts.manage')
  const input = vendorInputSchema.parse(raw)
  const before = await ctx.db.vendor.findFirst({ where: { id } })
  if (!before) throw notFound('Vendor')
  const data = vendorData(input)
  const actor = who(ctx)
  try {
    return await ctx.db.$transaction(async (tx) => {
      const code = input.code?.trim().toUpperCase() || before.code
      const vendor = await tx.vendor.update({ where: { id }, data: { code, ...data } })
      await recordAccountingEvent(tx, ctx.tenant.id, {
        entityType: 'Vendor', entityId: id, action: 'vendor.update', actorId: actor.id, actorLabel: actor.label,
        fromStatus: before.isActive ? 'ACTIVE' : 'INACTIVE', toStatus: vendor.isActive ? 'ACTIVE' : 'INACTIVE',
        data: { before: { ...before, createdAt: undefined, updatedAt: undefined }, after: { code, ...data } } as Prisma.InputJsonValue,
      })
      return vendor
    })
  } catch (error) {
    if (isUniqueViolation(error, 'code')) throw conflict('Another vendor already uses that code')
    throw error
  }
}

async function loadVendorFacts(db: Pick<TenantClient, 'purchaseVoucher' | 'vendorPayment' | 'debitNote' | 'vendorAdjustment'>, vendorIds: string[]) {
  const where = { vendorId: { in: vendorIds } }
  const [vouchers, payments, debitNotes, adjustments] = await Promise.all([
    db.purchaseVoucher.findMany({
      where,
      select: { id: true, vendorId: true, number: true, supplierInvoiceNo: true, invoiceDate: true, dueDate: true, status: true, totalMinor: true },
    }),
    db.vendorPayment.findMany({
      where,
      select: { id: true, vendorId: true, status: true, amountMinor: true, allocations: { select: { voucherId: true, amountMinor: true } } },
    }),
    db.debitNote.findMany({ where, select: { id: true, vendorId: true, voucherId: true, status: true, totalMinor: true } }),
    db.vendorAdjustment.findMany({ where, select: { id: true, vendorId: true, voucherId: true, status: true, type: true, amountMinor: true } }),
  ])
  const byVendor = new Map<string, VendorFacts>(vendorIds.map((id) => [id, { vouchers: [], payments: [], debitNotes: [], adjustments: [] }]))
  for (const v of vouchers) {
    byVendor.get(v.vendorId)?.vouchers.push({ ...v, invoiceDate: toIsoDay(v.invoiceDate), dueDate: toIsoDay(v.dueDate) })
  }
  for (const p of payments) byVendor.get(p.vendorId)?.payments.push(p)
  for (const n of debitNotes) byVendor.get(n.vendorId)?.debitNotes.push(n)
  for (const a of adjustments) byVendor.get(a.vendorId)?.adjustments.push(a)
  return byVendor
}

export const vendorListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export async function listVendors(ctx: AppContext, raw: unknown) {
  await requirePayables(ctx, 'accounts.view')
  const query = vendorListSchema.parse(raw ?? {})
  const where: Prisma.VendorWhereInput = {
    ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
    ...(query.q
      ? { OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { code: { contains: query.q, mode: 'insensitive' } },
          { gstin: { contains: query.q.toUpperCase() } },
        ] }
      : {}),
  }
  const [total, vendors] = await Promise.all([
    ctx.db.vendor.count({ where }),
    ctx.db.vendor.findMany({
      where,
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ])
  const facts = await loadVendorFacts(ctx.db, vendors.map((v) => v.id))
  const today = schoolToday()
  return {
    total,
    page: query.page,
    pageSize: query.pageSize,
    rows: vendors.map((vendor) => {
      const s = summariseVendor(facts.get(vendor.id)!, today)
      return {
        vendor,
        netLiabilityMinor: s.netLiabilityMinor,
        overdueMinor: s.bills.filter((b) => b.overdue).reduce((t, b) => t + b.outstandingMinor, 0),
        openBills: s.bills.filter((b) => b.outstandingMinor > 0).length,
      }
    }),
  }
}

/** Vendor 360: profile, metrics, bill-wise outstanding and the full transaction ledger. */
export async function getVendor360(ctx: AppContext, id: string) {
  await requirePayables(ctx, 'accounts.view')
  const vendor = await ctx.db.vendor.findFirst({ where: { id } })
  if (!vendor) throw notFound('Vendor')
  const facts = (await loadVendorFacts(ctx.db, [id])).get(id)!
  const summary = summariseVendor(facts, schoolToday())
  const [vouchers, payments, debitNotes, adjustments] = await Promise.all([
    ctx.db.purchaseVoucher.findMany({
      where: { vendorId: id },
      orderBy: [{ invoiceDate: 'desc' }, { number: 'desc' }],
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    }),
    ctx.db.vendorPayment.findMany({
      where: { vendorId: id },
      orderBy: [{ paidOn: 'desc' }, { number: 'desc' }],
      include: { allocations: { select: { voucherId: true, amountMinor: true } } },
    }),
    ctx.db.debitNote.findMany({
      where: { vendorId: id },
      orderBy: [{ noteDate: 'desc' }, { number: 'desc' }],
      include: { lines: true },
    }),
    ctx.db.vendorAdjustment.findMany({ where: { vendorId: id }, orderBy: [{ adjustedOn: 'desc' }, { number: 'desc' }] }),
  ])
  return { vendor, summary, vouchers, payments, debitNotes, adjustments }
}

// ------------------------------------------------------------------ posting

type PostLine = { accountId: string; debitMinor: number; creditMinor: number; memo?: string | null }

async function post(
  tx: Tx,
  ctx: AppContext,
  params: {
    sourceType: 'PURCHASE_VOUCHER' | 'VENDOR_PAYMENT' | 'DEBIT_NOTE' | 'VENDOR_ADJUSTMENT'
    sourceId: string
    date: string
    voucherType: 'JOURNAL' | 'PAYMENT'
    narration: string
    reference: string
    lines: PostLine[]
  },
) {
  const actor = who(ctx)
  return writeJournalEntry(tx, ctx.tenant.id, {
    date: attendanceDate(params.date),
    voucherType: params.voucherType,
    narration: params.narration,
    reference: params.reference,
    lines: params.lines,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    postingKey: `${params.sourceType}:${params.sourceId}:post`,
    createdById: actor.id,
    createdByLabel: actor.label,
  })
}

/** Reverses the active posting of a source document, dated `on`. */
async function reversePosting(
  tx: Tx,
  ctx: AppContext,
  sourceType: 'PURCHASE_VOUCHER' | 'VENDOR_PAYMENT' | 'DEBIT_NOTE' | 'VENDOR_ADJUSTMENT',
  sourceId: string,
  on: string,
  reason: string,
) {
  const active = await tx.journalEntry.findFirst({
    where: { postingKey: `${sourceType}:${sourceId}:post`, reversedAt: null },
    include: { lines: true },
  })
  if (!active) return null
  const claimed = await tx.journalEntry.updateMany({ where: { id: active.id, reversedAt: null }, data: { reversedAt: new Date() } })
  if (claimed.count !== 1) throw conflict('This document was changed by someone else; reload and try again')
  const actor = who(ctx)
  const date = on < toIsoDay(active.date) ? toIsoDay(active.date) : on
  return writeJournalEntry(tx, ctx.tenant.id, {
    date: attendanceDate(date),
    voucherType: active.voucherType,
    narration: `Reversal of ${active.number}: ${reason}`,
    reference: active.reference,
    lines: reverseLines(active.lines),
    sourceType,
    sourceId,
    postingKey: `${sourceType}:${sourceId}:cancel`,
    isReversal: true,
    reversalOfId: active.id,
    createdById: actor.id,
    createdByLabel: actor.label,
  })
}

// ------------------------------------------------------------------ purchase vouchers

export const purchaseVoucherSchema = z.object({
  vendorId: z.string().min(1),
  supplierInvoiceNo: z.string().trim().min(1, 'Enter the supplier invoice number').max(60),
  invoiceDate: isoDate,
  dueDate: isoDate.optional(),
  narration: z.string().trim().max(500).optional(),
  post: z.boolean().default(true),
  idempotencyKey,
  lines: z.array(z.object({
    description: z.string().trim().min(1, 'Describe each line').max(200),
    accountId: z.string().min(1, 'Choose an account head'),
    storeItemId: z.string().min(1).optional(),
    quantity: z.number().int().positive().max(1_000_000),
    unitCostMinor: z.number().int().min(0).max(2_147_483_647),
    taxPercent: z.number().min(0).max(100).default(0),
  })).min(1, 'Add at least one line').max(100),
})

async function validatePurchaseAccounts(db: Pick<TenantClient, 'ledgerAccount' | 'storeItem'>, lines: z.infer<typeof purchaseVoucherSchema>['lines']) {
  const accountIds = [...new Set(lines.map((l) => l.accountId))]
  const accounts = await db.ledgerAccount.findMany({
    where: { id: { in: accountIds }, isActive: true },
    select: { id: true, type: true, systemKey: true },
  })
  const ok = new Set(
    accounts
      .filter((a) => (a.type === 'EXPENSE' || a.type === 'ASSET') && !NOT_PURCHASE_ACCOUNTS.has(a.systemKey ?? ''))
      .map((a) => a.id),
  )
  const bad = accountIds.find((id) => !ok.has(id))
  if (bad) throw badRequest('Each line must use an active expense or asset account head (not cash, bank, store stock or creditors)')
  const itemIds = [...new Set(lines.map((l) => l.storeItemId).filter((x): x is string => !!x))]
  if (itemIds.length) {
    const found = await db.storeItem.count({ where: { id: { in: itemIds } } })
    if (found !== itemIds.length) throw badRequest('A referenced store item was not found')
  }
}

function addDays(iso: string, days: number) {
  const d = attendanceDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIsoDay(d)
}

async function postPurchaseVoucherTx(tx: Tx, ctx: AppContext, voucherId: string, startMonth: number) {
  const voucher = await tx.purchaseVoucher.findFirst({ where: { id: voucherId }, include: { lines: true, vendor: { select: { name: true } } } })
  if (!voucher) throw notFound('Purchase voucher')
  const date = toIsoDay(voucher.invoiceDate)
  await assertPostingAllowed(tx, date, { startMonth })
  await ensurePayablesChart(tx, ctx.tenant.id)
  const creditors = await systemAccount(tx, 'SUNDRY_CREDITORS')
  const byAccount = new Map<string, number>()
  for (const l of voucher.lines) byAccount.set(l.accountId, (byAccount.get(l.accountId) ?? 0) + l.totalMinor)
  await post(tx, ctx, {
    sourceType: 'PURCHASE_VOUCHER',
    sourceId: voucher.id,
    date,
    voucherType: 'JOURNAL',
    narration: `Purchase from ${voucher.vendor.name}, bill ${voucher.supplierInvoiceNo}${voucher.narration ? ` — ${voucher.narration}` : ''}`,
    reference: voucher.number,
    lines: [
      ...[...byAccount].map(([accountId, amount]) => ({ accountId, debitMinor: amount, creditMinor: 0 })),
      { accountId: creditors, debitMinor: 0, creditMinor: voucher.totalMinor, memo: voucher.vendor.name },
    ],
  })
  const actor = who(ctx)
  return tx.purchaseVoucher.update({
    where: { id: voucher.id },
    data: { status: 'POSTED', postedAt: new Date(), postedById: actor.id },
  })
}

export async function createPurchaseVoucher(ctx: AppContext, raw: unknown) {
  const flags = await requirePayables(ctx, 'accounts.manage')
  const input = purchaseVoucherSchema.parse(raw)
  if (input.idempotencyKey) {
    const existing = await ctx.db.purchaseVoucher.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return existing
  }
  const vendor = await ctx.db.vendor.findFirst({ where: { id: input.vendorId } })
  if (!vendor) throw notFound('Vendor')
  if (!vendor.isActive) throw conflict('This vendor is inactive; reactivate it before entering bills')
  await validatePurchaseAccounts(ctx.db, input.lines)
  const priced = input.lines.map((l) => ({ ...l, ...computePurchaseLine(l) }))
  const totals = sumPurchaseLines(priced)
  if (totals.totalMinor <= 0) throw badRequest('A purchase voucher must be for more than zero')
  const dueDate = input.dueDate ?? addDays(input.invoiceDate, vendor.creditDays)
  if (dueDate < input.invoiceDate) throw badRequest('The due date cannot be before the invoice date')
  const key = supplierInvoiceKey(input.supplierInvoiceNo)
  if (!key) throw badRequest('The supplier invoice number must contain letters or digits')
  const actor = who(ctx)

  try {
    return await ctx.db.$transaction(async (tx) => {
      await lockVendor(tx, ctx.tenant.id, vendor.id)
      const duplicate = await tx.purchaseVoucher.findFirst({
        where: { vendorId: vendor.id, supplierInvoiceKey: key },
        select: { number: true },
      })
      if (duplicate) throw conflict(`Bill ${input.supplierInvoiceNo} from this vendor is already entered as ${duplicate.number}`)
      const number = await nextDocumentNumber(tx, {
        tenantId: ctx.tenant.id,
        kind: 'PURCHASE_VOUCHER',
        sessionLabel: financialYearLabel(attendanceDate(input.invoiceDate)),
      })
      const voucher = await tx.purchaseVoucher.create({
        data: {
          tenantId: ctx.tenant.id,
          number,
          vendorId: vendor.id,
          supplierInvoiceNo: input.supplierInvoiceNo,
          supplierInvoiceKey: key,
          invoiceDate: attendanceDate(input.invoiceDate),
          dueDate: attendanceDate(dueDate),
          status: 'DRAFT',
          ...totals,
          narration: input.narration || null,
          idempotencyKey: input.idempotencyKey ?? null,
          createdById: actor.id,
          createdByLabel: actor.label,
          lines: {
            create: priced.map((l, i) => ({
              tenantId: ctx.tenant.id,
              sortOrder: i,
              description: l.description,
              accountId: l.accountId,
              storeItemId: l.storeItemId ?? null,
              quantity: l.quantity,
              unitCostMinor: l.unitCostMinor,
              amountMinor: l.amountMinor,
              taxPercent: l.taxPercent,
              taxMinor: l.taxMinor,
              totalMinor: l.totalMinor,
            })),
          },
        },
      })
      const result = input.post ? await postPurchaseVoucherTx(tx, ctx, voucher.id, flags.fiscalYearStartMonth) : voucher
      await recordAccountingEvent(tx, ctx.tenant.id, {
        entityType: 'PurchaseVoucher', entityId: voucher.id, action: 'purchase_voucher.create',
        toStatus: result.status, actorId: actor.id, actorLabel: actor.label,
        data: { number, vendorId: vendor.id, supplierInvoiceNo: input.supplierInvoiceNo, totalMinor: totals.totalMinor },
      })
      return result
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error, 'idempotencyKey')) {
      const existing = await ctx.db.purchaseVoucher.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
      if (existing) return existing
    }
    if (isUniqueViolation(error, 'supplierInvoiceKey')) throw conflict('This supplier bill is already entered')
    throw error
  }
}

export async function postPurchaseVoucher(ctx: AppContext, id: string) {
  const flags = await requirePayables(ctx, 'accounts.manage')
  const voucher = await ctx.db.purchaseVoucher.findFirst({ where: { id }, select: { vendorId: true } })
  if (!voucher) throw notFound('Purchase voucher')
  const actor = who(ctx)
  return ctx.db.$transaction(async (tx) => {
    await lockVendor(tx, ctx.tenant.id, voucher.vendorId)
    const current = await tx.purchaseVoucher.findFirst({ where: { id }, select: { status: true } })
    if (current?.status === 'POSTED') return tx.purchaseVoucher.findFirstOrThrow({ where: { id } })
    if (current?.status !== 'DRAFT') throw conflict('Only a draft voucher can be posted')
    const posted = await postPurchaseVoucherTx(tx, ctx, id, flags.fiscalYearStartMonth)
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'PurchaseVoucher', entityId: id, action: 'purchase_voucher.post',
      fromStatus: 'DRAFT', toStatus: 'POSTED', actorId: actor.id, actorLabel: actor.label,
    })
    return posted
  })
}

export async function cancelPurchaseVoucher(ctx: AppContext, id: string, reason: string) {
  const flags = await requirePayables(ctx, 'accounts.manage')
  const why = reason.trim()
  if (!why) throw badRequest('Give a reason for cancelling')
  const voucher = await ctx.db.purchaseVoucher.findFirst({ where: { id }, select: { vendorId: true } })
  if (!voucher) throw notFound('Purchase voucher')
  const actor = who(ctx)
  const today = schoolToday()
  return ctx.db.$transaction(async (tx) => {
    await lockVendor(tx, ctx.tenant.id, voucher.vendorId)
    const current = await tx.purchaseVoucher.findFirstOrThrow({ where: { id } })
    if (current.status === 'CANCELLED') return current
    const [allocated, notes, adjustments] = await Promise.all([
      tx.vendorPaymentAllocation.count({ where: { voucherId: id, payment: { status: 'POSTED' } } }),
      tx.debitNote.count({ where: { voucherId: id, status: { in: ['SUBMITTED', 'APPROVED'] } } }),
      tx.vendorAdjustment.count({ where: { voucherId: id, status: 'POSTED' } }),
    ])
    if (allocated || notes || adjustments) {
      throw conflict('Cancel the payments, debit notes and adjustments against this bill first')
    }
    if (current.status === 'POSTED') {
      await assertPostingAllowed(tx, today, { startMonth: flags.fiscalYearStartMonth })
      await reversePosting(tx, ctx, 'PURCHASE_VOUCHER', id, today, why)
    }
    const cancelled = await tx.purchaseVoucher.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        supplierInvoiceKey: cancelledInvoiceKey(current.supplierInvoiceKey, id),
        cancelledAt: new Date(),
        cancelledById: actor.id,
        cancelReason: why,
      },
    })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'PurchaseVoucher', entityId: id, action: 'purchase_voucher.cancel',
      fromStatus: current.status, toStatus: 'CANCELLED', reason: why, actorId: actor.id, actorLabel: actor.label,
    })
    return cancelled
  })
}

/** Reducible balance of every posted bill of a vendor, read inside the caller's lock. */
async function openBills(tx: Tx, vendorId: string) {
  const facts = (await loadVendorFacts(tx, [vendorId])).get(vendorId)!
  return summariseVendor(facts, schoolToday()).bills
}

// ------------------------------------------------------------------ payments

export const vendorPaymentSchema = z.object({
  vendorId: z.string().min(1),
  paidOn: isoDate,
  mode: z.enum(PAYMENT_MODES),
  reference: z.string().trim().max(60).optional(),
  amountMinor: minor,
  narration: z.string().trim().max(500).optional(),
  allocations: z.array(z.object({ voucherId: z.string().min(1), amountMinor: minor })).max(100).optional(),
  idempotencyKey,
})

export async function recordVendorPayment(ctx: AppContext, raw: unknown) {
  const flags = await requirePayables(ctx, 'accounts.manage')
  const input = vendorPaymentSchema.parse(raw)
  if (input.mode !== 'CASH' && !input.reference) throw badRequest('Enter the cheque, UTR or UPI reference')
  if (input.idempotencyKey) {
    const existing = await ctx.db.vendorPayment.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return existing
  }
  const vendor = await ctx.db.vendor.findFirst({ where: { id: input.vendorId }, select: { id: true, name: true } })
  if (!vendor) throw notFound('Vendor')
  const actor = who(ctx)
  try {
    return await ctx.db.$transaction(async (tx) => {
      await lockVendor(tx, ctx.tenant.id, vendor.id)
      await assertPostingAllowed(tx, input.paidOn, { startMonth: flags.fiscalYearStartMonth })
      const bills = await openBills(tx, vendor.id)
      const split = allocateVendorPayment(
        input.amountMinor,
        bills.filter((b) => b.reducibleMinor > 0).map((b) => ({ id: b.voucherId, number: b.number, dueDate: b.dueDate, reducibleMinor: b.reducibleMinor })),
        input.allocations,
      )
      if (!split.ok) throw badRequest(split.message)
      const number = await nextDocumentNumber(tx, {
        tenantId: ctx.tenant.id,
        kind: 'VENDOR_PAYMENT',
        sessionLabel: financialYearLabel(attendanceDate(input.paidOn)),
      })
      const payment = await tx.vendorPayment.create({
        data: {
          tenantId: ctx.tenant.id,
          number,
          vendorId: vendor.id,
          paidOn: attendanceDate(input.paidOn),
          mode: input.mode,
          reference: input.reference || null,
          amountMinor: input.amountMinor,
          narration: input.narration || null,
          idempotencyKey: input.idempotencyKey ?? null,
          createdById: actor.id,
          createdByLabel: actor.label,
          allocations: { create: split.allocations.map((a) => ({ tenantId: ctx.tenant.id, ...a })) },
        },
      })
      await ensurePayablesChart(tx, ctx.tenant.id)
      const creditors = await systemAccount(tx, 'SUNDRY_CREDITORS')
      const resolver = await loadResolver(ctx.tenant.id, tx as unknown as TenantClient)
      await post(tx, ctx, {
        sourceType: 'VENDOR_PAYMENT',
        sourceId: payment.id,
        date: input.paidOn,
        voucherType: 'PAYMENT',
        narration: `Paid ${vendor.name} by ${input.mode.toLowerCase().replace('_', ' ')}${input.reference ? ` (${input.reference})` : ''}`,
        reference: number,
        lines: [
          { accountId: creditors, debitMinor: input.amountMinor, creditMinor: 0, memo: vendor.name },
          { accountId: resolver.mode(input.mode), debitMinor: 0, creditMinor: input.amountMinor },
        ],
      })
      await recordAccountingEvent(tx, ctx.tenant.id, {
        entityType: 'VendorPayment', entityId: payment.id, action: 'vendor_payment.create', toStatus: 'POSTED',
        actorId: actor.id, actorLabel: actor.label,
        data: { number, amountMinor: input.amountMinor, allocations: split.allocations, onAccountMinor: split.onAccountMinor },
      })
      return payment
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error, 'idempotencyKey')) {
      const existing = await ctx.db.vendorPayment.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
      if (existing) return existing
    }
    throw error
  }
}

export async function cancelVendorPayment(ctx: AppContext, id: string, reason: string) {
  const flags = await requirePayables(ctx, 'accounts.manage')
  const why = reason.trim()
  if (!why) throw badRequest('Give a reason for cancelling')
  const payment = await ctx.db.vendorPayment.findFirst({ where: { id }, select: { vendorId: true } })
  if (!payment) throw notFound('Payment')
  const actor = who(ctx)
  const today = schoolToday()
  return ctx.db.$transaction(async (tx) => {
    await lockVendor(tx, ctx.tenant.id, payment.vendorId)
    const current = await tx.vendorPayment.findFirstOrThrow({ where: { id } })
    if (current.status === 'CANCELLED') return current
    await assertPostingAllowed(tx, today, { startMonth: flags.fiscalYearStartMonth })
    await reversePosting(tx, ctx, 'VENDOR_PAYMENT', id, today, why)
    const cancelled = await tx.vendorPayment.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: actor.id, cancelReason: why },
    })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'VendorPayment', entityId: id, action: 'vendor_payment.cancel',
      fromStatus: 'POSTED', toStatus: 'CANCELLED', reason: why, actorId: actor.id, actorLabel: actor.label,
    })
    return cancelled
  })
}

// ------------------------------------------------------------------ debit notes

export const debitNoteSchema = z.object({
  voucherId: z.string().min(1),
  noteDate: isoDate,
  reason: z.string().trim().min(3, 'Record the inspection or rejection reason').max(1000),
  lines: z.array(z.object({
    voucherLineId: z.string().min(1),
    quantity: z.number().int().min(0),
    amountMinor: z.number().int().positive().optional(),
  })).min(1).max(100),
  idempotencyKey,
})

async function priceAgainstVoucher(tx: Tx, voucherId: string, requests: z.infer<typeof debitNoteSchema>['lines'], excludeNoteId?: string) {
  const voucher = await tx.purchaseVoucher.findFirst({ where: { id: voucherId }, include: { lines: true } })
  if (!voucher) throw notFound('Purchase voucher')
  if (voucher.status !== 'POSTED') throw conflict('Debit notes can only be raised against a posted purchase voucher')
  const active = await tx.debitNoteLine.findMany({
    where: {
      voucherLine: { voucherId },
      debitNote: { status: { in: ['SUBMITTED', 'APPROVED'] }, ...(excludeNoteId ? { id: { not: excludeNoteId } } : {}) },
    },
    select: { voucherLineId: true, quantity: true, amountMinor: true, taxMinor: true },
  })
  const lineFacts = voucher.lines.map((l) => {
    const prior = active.filter((a) => a.voucherLineId === l.id)
    return {
      id: l.id,
      quantity: l.quantity,
      amountMinor: l.amountMinor,
      taxMinor: l.taxMinor,
      taxPercent: l.taxPercent,
      returnedQuantity: prior.reduce((s, a) => s + a.quantity, 0),
      returnedAmountMinor: prior.reduce((s, a) => s + a.amountMinor, 0),
      returnedTaxMinor: prior.reduce((s, a) => s + a.taxMinor, 0),
    }
  })
  const bill = (await openBills(tx, voucher.vendorId)).find((b) => b.voucherId === voucherId)
  const pendingOthers = await tx.debitNote.aggregate({
    where: { voucherId, status: 'SUBMITTED', ...(excludeNoteId ? { id: { not: excludeNoteId } } : {}) },
    _sum: { totalMinor: true },
  })
  const reducible = bill
    ? billReducible({
        totalMinor: bill.totalMinor,
        allocatedMinor: bill.paidMinor,
        approvedNotesMinor: bill.debitNotesMinor,
        adjustmentsMinor: bill.adjustmentsMinor,
        pendingNotesMinor: pendingOthers._sum.totalMinor ?? 0,
      })
    : 0
  const priced = priceDebitNote(lineFacts, requests, reducible)
  if (!priced.ok) throw badRequest(priced.issues[0]!.message, { issues: priced.issues })
  return { voucher, priced }
}

async function postDebitNoteTx(tx: Tx, ctx: AppContext, noteId: string, startMonth: number) {
  const note = await tx.debitNote.findFirstOrThrow({
    where: { id: noteId },
    include: { lines: { include: { voucherLine: { select: { accountId: true } } } }, vendor: { select: { name: true } }, voucher: { select: { number: true, supplierInvoiceNo: true } } },
  })
  const date = toIsoDay(note.noteDate)
  await assertPostingAllowed(tx, date, { startMonth })
  await ensurePayablesChart(tx, ctx.tenant.id)
  const creditors = await systemAccount(tx, 'SUNDRY_CREDITORS')
  const byAccount = new Map<string, number>()
  for (const l of note.lines) byAccount.set(l.voucherLine.accountId, (byAccount.get(l.voucherLine.accountId) ?? 0) + l.totalMinor)
  await post(tx, ctx, {
    sourceType: 'DEBIT_NOTE',
    sourceId: note.id,
    date,
    voucherType: 'JOURNAL',
    narration: `Debit note to ${note.vendor.name} against ${note.voucher.number} (bill ${note.voucher.supplierInvoiceNo}): ${note.reason}`,
    reference: note.number,
    lines: [
      { accountId: creditors, debitMinor: note.totalMinor, creditMinor: 0, memo: note.vendor.name },
      ...[...byAccount].map(([accountId, amount]) => ({ accountId, debitMinor: 0, creditMinor: amount })),
    ],
  })
}

export async function createDebitNote(ctx: AppContext, raw: unknown) {
  const flags = await requirePayables(ctx, 'accounts.manage')
  const input = debitNoteSchema.parse(raw)
  if (input.idempotencyKey) {
    const existing = await ctx.db.debitNote.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return existing
  }
  const target = await ctx.db.purchaseVoucher.findFirst({ where: { id: input.voucherId }, select: { vendorId: true, invoiceDate: true } })
  if (!target) throw notFound('Purchase voucher')
  if (input.noteDate < toIsoDay(target.invoiceDate)) throw badRequest('A debit note cannot be dated before the purchase')
  const actor = who(ctx)
  const needsApproval = flags.approvals
  try {
    return await ctx.db.$transaction(async (tx) => {
      await lockVendor(tx, ctx.tenant.id, target.vendorId)
      const { priced } = await priceAgainstVoucher(tx, input.voucherId, input.lines)
      const number = await nextDocumentNumber(tx, {
        tenantId: ctx.tenant.id,
        kind: 'DEBIT_NOTE',
        sessionLabel: financialYearLabel(attendanceDate(input.noteDate)),
      })
      const note = await tx.debitNote.create({
        data: {
          tenantId: ctx.tenant.id,
          number,
          vendorId: target.vendorId,
          voucherId: input.voucherId,
          noteDate: attendanceDate(input.noteDate),
          reason: input.reason,
          status: needsApproval ? 'SUBMITTED' : 'APPROVED',
          totalMinor: priced.totalMinor,
          idempotencyKey: input.idempotencyKey ?? null,
          createdById: actor.id,
          createdByLabel: actor.label,
          ...(needsApproval ? {} : { approvedById: actor.id, approvedByLabel: actor.label, approvedAt: new Date() }),
          lines: { create: priced.lines.map((l) => ({ tenantId: ctx.tenant.id, ...l })) },
        },
      })
      if (!needsApproval) await postDebitNoteTx(tx, ctx, note.id, flags.fiscalYearStartMonth)
      await recordAccountingEvent(tx, ctx.tenant.id, {
        entityType: 'DebitNote', entityId: note.id, action: 'debit_note.create', toStatus: note.status,
        reason: input.reason, actorId: actor.id, actorLabel: actor.label,
        data: { number, voucherId: input.voucherId, totalMinor: priced.totalMinor, lines: priced.lines },
      })
      return note
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error, 'idempotencyKey')) {
      const existing = await ctx.db.debitNote.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
      if (existing) return existing
    }
    throw error
  }
}

export async function decideDebitNote(ctx: AppContext, id: string, decision: 'approve' | 'reject', reason?: string) {
  const flags = await requirePayables(ctx, 'accounts.manage')
  const note = await ctx.db.debitNote.findFirst({ where: { id }, select: { vendorId: true } })
  if (!note) throw notFound('Debit note')
  const actor = who(ctx)
  return ctx.db.$transaction(async (tx) => {
    await lockVendor(tx, ctx.tenant.id, note.vendorId)
    const current = await tx.debitNote.findFirstOrThrow({ where: { id }, include: { lines: true } })
    if (current.status !== 'SUBMITTED') throw conflict(`This debit note is already ${current.status.toLowerCase()}`)
    if (current.createdById === actor.id) throw forbidden('A debit note must be approved or rejected by someone other than its author')
    if (decision === 'reject') {
      const why = reason?.trim()
      if (!why) throw badRequest('Give a reason for rejecting')
      const rejected = await tx.debitNote.update({
        where: { id },
        data: { status: 'REJECTED', rejectedById: actor.id, rejectedAt: new Date(), rejectionReason: why },
      })
      await recordAccountingEvent(tx, ctx.tenant.id, {
        entityType: 'DebitNote', entityId: id, action: 'debit_note.reject', fromStatus: 'SUBMITTED', toStatus: 'REJECTED',
        reason: why, actorId: actor.id, actorLabel: actor.label,
      })
      return rejected
    }
    // Re-price against today's balances: payments may have landed since submission.
    await priceAgainstVoucher(
      tx,
      current.voucherId,
      current.lines.map((l) => (l.quantity > 0 ? { voucherLineId: l.voucherLineId, quantity: l.quantity } : { voucherLineId: l.voucherLineId, quantity: 0, amountMinor: l.amountMinor })),
      id,
    )
    const approved = await tx.debitNote.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: actor.id, approvedByLabel: actor.label, approvedAt: new Date() },
    })
    await postDebitNoteTx(tx, ctx, id, flags.fiscalYearStartMonth)
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'DebitNote', entityId: id, action: 'debit_note.approve', fromStatus: 'SUBMITTED', toStatus: 'APPROVED',
      actorId: actor.id, actorLabel: actor.label,
    })
    return approved
  }, { isolationLevel: 'Serializable' })
}

export async function cancelDebitNote(ctx: AppContext, id: string, reason: string) {
  const flags = await requirePayables(ctx, 'accounts.manage')
  const why = reason.trim()
  if (!why) throw badRequest('Give a reason for cancelling')
  const note = await ctx.db.debitNote.findFirst({ where: { id }, select: { vendorId: true } })
  if (!note) throw notFound('Debit note')
  const actor = who(ctx)
  const today = schoolToday()
  return ctx.db.$transaction(async (tx) => {
    await lockVendor(tx, ctx.tenant.id, note.vendorId)
    const current = await tx.debitNote.findFirstOrThrow({ where: { id } })
    if (current.status === 'CANCELLED' || current.status === 'REJECTED') return current
    if (current.status === 'APPROVED') {
      await assertPostingAllowed(tx, today, { startMonth: flags.fiscalYearStartMonth })
      await reversePosting(tx, ctx, 'DEBIT_NOTE', id, today, why)
    }
    const cancelled = await tx.debitNote.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: actor.id, cancelReason: why },
    })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'DebitNote', entityId: id, action: 'debit_note.cancel', fromStatus: current.status, toStatus: 'CANCELLED',
      reason: why, actorId: actor.id, actorLabel: actor.label,
    })
    return cancelled
  })
}

// ------------------------------------------------------------------ discounts and write-offs

export const vendorAdjustmentSchema = z.object({
  voucherId: z.string().min(1),
  type: z.enum(['DISCOUNT', 'WRITE_OFF']),
  adjustedOn: isoDate,
  amountMinor: minor,
  reason: z.string().trim().min(3, 'Record why this is being adjusted').max(1000),
  idempotencyKey,
})

export async function createVendorAdjustment(ctx: AppContext, raw: unknown) {
  const flags = await requirePayables(ctx, 'accounts.manage')
  const input = vendorAdjustmentSchema.parse(raw)
  if (input.idempotencyKey) {
    const existing = await ctx.db.vendorAdjustment.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return existing
  }
  const target = await ctx.db.purchaseVoucher.findFirst({
    where: { id: input.voucherId },
    select: { vendorId: true, status: true, number: true, vendor: { select: { name: true } } },
  })
  if (!target) throw notFound('Purchase voucher')
  const actor = who(ctx)
  try {
    return await ctx.db.$transaction(async (tx) => {
      await lockVendor(tx, ctx.tenant.id, target.vendorId)
      const bill = (await openBills(tx, target.vendorId)).find((b) => b.voucherId === input.voucherId)
      if (!bill) throw conflict('Adjustments can only be made against a posted purchase voucher')
      if (input.amountMinor > bill.reducibleMinor) {
        throw badRequest(`This bill can only be reduced by ${bill.reducibleMinor} paise more`)
      }
      await assertPostingAllowed(tx, input.adjustedOn, { startMonth: flags.fiscalYearStartMonth })
      const number = await nextDocumentNumber(tx, {
        tenantId: ctx.tenant.id,
        kind: 'VENDOR_ADJUSTMENT',
        sessionLabel: financialYearLabel(attendanceDate(input.adjustedOn)),
      })
      const adjustment = await tx.vendorAdjustment.create({
        data: {
          tenantId: ctx.tenant.id,
          number,
          vendorId: target.vendorId,
          voucherId: input.voucherId,
          type: input.type,
          adjustedOn: attendanceDate(input.adjustedOn),
          amountMinor: input.amountMinor,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey ?? null,
          createdById: actor.id,
          createdByLabel: actor.label,
        },
      })
      await ensurePayablesChart(tx, ctx.tenant.id)
      const [creditors, income] = await Promise.all([
        systemAccount(tx, 'SUNDRY_CREDITORS'),
        systemAccount(tx, input.type === 'DISCOUNT' ? 'DISCOUNT_RECEIVED' : 'CREDITORS_WRITTEN_BACK'),
      ])
      await post(tx, ctx, {
        sourceType: 'VENDOR_ADJUSTMENT',
        sourceId: adjustment.id,
        date: input.adjustedOn,
        voucherType: 'JOURNAL',
        narration: `${input.type === 'DISCOUNT' ? 'Discount from' : 'Balance written back for'} ${target.vendor.name} on ${target.number}: ${input.reason}`,
        reference: number,
        lines: [
          { accountId: creditors, debitMinor: input.amountMinor, creditMinor: 0, memo: target.vendor.name },
          { accountId: income, debitMinor: 0, creditMinor: input.amountMinor },
        ],
      })
      await recordAccountingEvent(tx, ctx.tenant.id, {
        entityType: 'VendorAdjustment', entityId: adjustment.id, action: `vendor_adjustment.${input.type.toLowerCase()}`,
        toStatus: 'POSTED', reason: input.reason, actorId: actor.id, actorLabel: actor.label,
        data: { number, voucherId: input.voucherId, amountMinor: input.amountMinor },
      })
      return adjustment
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error, 'idempotencyKey')) {
      const existing = await ctx.db.vendorAdjustment.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
      if (existing) return existing
    }
    throw error
  }
}

export async function cancelVendorAdjustment(ctx: AppContext, id: string, reason: string) {
  const flags = await requirePayables(ctx, 'accounts.manage')
  const why = reason.trim()
  if (!why) throw badRequest('Give a reason for cancelling')
  const adjustment = await ctx.db.vendorAdjustment.findFirst({ where: { id }, select: { vendorId: true } })
  if (!adjustment) throw notFound('Adjustment')
  const actor = who(ctx)
  const today = schoolToday()
  return ctx.db.$transaction(async (tx) => {
    await lockVendor(tx, ctx.tenant.id, adjustment.vendorId)
    const current = await tx.vendorAdjustment.findFirstOrThrow({ where: { id } })
    if (current.status === 'CANCELLED') return current
    await assertPostingAllowed(tx, today, { startMonth: flags.fiscalYearStartMonth })
    await reversePosting(tx, ctx, 'VENDOR_ADJUSTMENT', id, today, why)
    const cancelled = await tx.vendorAdjustment.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: actor.id, cancelReason: why },
    })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'VendorAdjustment', entityId: id, action: 'vendor_adjustment.cancel',
      fromStatus: 'POSTED', toStatus: 'CANCELLED', reason: why, actorId: actor.id, actorLabel: actor.label,
    })
    return cancelled
  })
}

// ------------------------------------------------------------------ attachments

const DOCUMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
export type PayablesDocumentKind = 'purchase-voucher' | 'debit-note'

export async function attachPayablesDocument(ctx: AppContext, kind: PayablesDocumentKind, id: string, file: File) {
  await requirePayables(ctx, 'accounts.manage')
  if (!DOCUMENT_TYPES.has(file.type)) throw badRequest('Attach a PDF or an image (JPG, PNG, WebP)')
  const existing = kind === 'purchase-voucher'
    ? await ctx.db.purchaseVoucher.findFirst({ where: { id }, select: { attachmentKey: true, status: true } })
    : await ctx.db.debitNote.findFirst({ where: { id }, select: { attachmentKey: true, status: true } })
  if (!existing) throw notFound(kind === 'purchase-voucher' ? 'Purchase voucher' : 'Debit note')
  if (existing.status === 'CANCELLED') throw conflict('A cancelled document cannot take new attachments')
  const stored = await uploadFile(ctx, file, 'payables-documents')
  const data = { attachmentKey: stored.storageKey, attachmentName: stored.fileName, attachmentMime: stored.mimeType, attachmentSize: stored.sizeBytes }
  if (kind === 'purchase-voucher') await ctx.db.purchaseVoucher.update({ where: { id }, data })
  else await ctx.db.debitNote.update({ where: { id }, data })
  if (existing.attachmentKey) await storageProvider().delete(existing.attachmentKey).catch(() => undefined)
  const actor = who(ctx)
  await recordAccountingEvent(ctx.db, ctx.tenant.id, {
    entityType: kind === 'purchase-voucher' ? 'PurchaseVoucher' : 'DebitNote', entityId: id, action: 'document.attach',
    actorId: actor.id, actorLabel: actor.label, data: { fileName: stored.fileName, sizeBytes: stored.sizeBytes },
  })
  return { fileName: stored.fileName, sizeBytes: stored.sizeBytes }
}

export async function readPayablesDocument(ctx: AppContext, kind: PayablesDocumentKind, id: string) {
  await requirePayables(ctx, 'accounts.view')
  const row = kind === 'purchase-voucher'
    ? await ctx.db.purchaseVoucher.findFirst({ where: { id }, select: { attachmentKey: true, attachmentName: true, attachmentMime: true } })
    : await ctx.db.debitNote.findFirst({ where: { id }, select: { attachmentKey: true, attachmentName: true, attachmentMime: true } })
  if (!row?.attachmentKey || !row.attachmentKey.startsWith(`${ctx.tenant.id}/`)) throw notFound('File')
  return {
    body: await storageProvider().get(row.attachmentKey),
    mimeType: row.attachmentMime ?? 'application/octet-stream',
    fileName: row.attachmentName ?? 'document',
  }
}

// ------------------------------------------------------------------ reconciliation

/** Σ vendor net liability against the Sundry Creditors ledger balance. */
export async function payablesReconciliation(ctx: AppContext) {
  await requirePayables(ctx, 'accounts.view')
  const vendors = await ctx.db.vendor.findMany({ select: { id: true, code: true, name: true } })
  const facts = await loadVendorFacts(ctx.db, vendors.map((v) => v.id))
  const today = schoolToday()
  const perVendor = vendors.map((v) => {
    const s = summariseVendor(facts.get(v.id)!, today)
    return { id: v.id, code: v.code, name: v.name, netLiabilityMinor: s.netLiabilityMinor, reconciled: s.reconciled }
  })
  const account = await ctx.db.ledgerAccount.findFirst({ where: { systemKey: 'SUNDRY_CREDITORS' }, select: { id: true } })
  const ledger = account
    ? await ctx.db.journalLine.aggregate({ where: { accountId: account.id }, _sum: { debitMinor: true, creditMinor: true } })
    : null
  const ledgerBalanceMinor = ledger ? (ledger._sum.creditMinor ?? 0) - (ledger._sum.debitMinor ?? 0) : 0
  const subledgerMinor = perVendor.reduce((s, v) => s + v.netLiabilityMinor, 0)
  return {
    ok: ledgerBalanceMinor === subledgerMinor && perVendor.every((v) => v.reconciled),
    ledgerBalanceMinor,
    subledgerMinor,
    differenceMinor: ledgerBalanceMinor - subledgerMinor,
    vendors: perVendor,
  }
}

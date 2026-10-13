import { z } from 'zod'
import type { ExpenseCategory, ExpenseNature } from '@prisma/client'
import type { AppContext } from '@/server/context'
import type { TenantClient } from '@/server/db/tenant-client'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { loadResolver } from '@/server/modules/accounts/chart'

type HeadSeed = { name: string; category: ExpenseCategory; nature: ExpenseNature; primary?: boolean }

/**
 * Starter heads every school gets. A `primary` head is the one older expenses
 * of that category are filed under, and it posts to the category's existing
 * ledger account; every other head gets an account of its own.
 */
export const DEFAULT_EXPENSE_HEADS: HeadSeed[] = [
  { name: 'Teaching staff salary', category: 'SALARY', nature: 'DIRECT', primary: true },
  { name: 'Academic & teaching material', category: 'ACADEMIC', nature: 'DIRECT', primary: true },
  { name: 'Student transport & fuel', category: 'TRANSPORT', nature: 'DIRECT', primary: true },
  { name: 'Mid-day meal & canteen', category: 'FOOD', nature: 'DIRECT', primary: true },
  { name: 'Student activities & events', category: 'EVENTS', nature: 'DIRECT', primary: true },
  { name: 'Exam & assessment expenses', category: 'ACADEMIC', nature: 'DIRECT' },
  { name: 'Lab, library & sports', category: 'SUPPLIES', nature: 'DIRECT' },
  { name: 'Non-teaching staff salary', category: 'SALARY', nature: 'INDIRECT' },
  { name: 'Electricity & water', category: 'UTILITIES', nature: 'INDIRECT', primary: true },
  { name: 'Internet & telephone', category: 'UTILITIES', nature: 'INDIRECT' },
  { name: 'Rent', category: 'OTHER', nature: 'INDIRECT' },
  { name: 'Repairs & maintenance', category: 'MAINTENANCE', nature: 'INDIRECT', primary: true },
  { name: 'Housekeeping & security', category: 'MAINTENANCE', nature: 'INDIRECT' },
  { name: 'Office stationery & printing', category: 'SUPPLIES', nature: 'INDIRECT', primary: true },
  { name: 'Administrative expenses', category: 'ADMIN', nature: 'INDIRECT', primary: true },
  { name: 'Advertising & admissions marketing', category: 'ADMIN', nature: 'INDIRECT' },
  { name: 'Professional & audit fees', category: 'ADMIN', nature: 'INDIRECT' },
  { name: 'Software & IT', category: 'ADMIN', nature: 'INDIRECT' },
  { name: 'Bank charges', category: 'OTHER', nature: 'INDIRECT' },
  { name: 'Insurance', category: 'OTHER', nature: 'INDIRECT' },
  { name: 'Miscellaneous', category: 'OTHER', nature: 'INDIRECT', primary: true },
]

type HeadTx = Pick<TenantClient, 'ledgerAccount' | 'expenseHead' | 'schoolExpense' | '$executeRaw'>

/** Next free numeric code in the 51xx (direct) or 52xx (indirect) band. */
async function nextExpenseCode(tx: HeadTx, nature: ExpenseNature, taken: Set<string>) {
  let n = nature === 'DIRECT' ? 5101 : 5201
  if (taken.size === 0) {
    const codes = await tx.ledgerAccount.findMany({ select: { code: true } })
    for (const c of codes) taken.add(c.code)
  }
  while (taken.has(String(n))) n++
  taken.add(String(n))
  return String(n)
}

async function accountForNewHead(
  tx: HeadTx,
  tenantId: string,
  name: string,
  nature: ExpenseNature,
  taken: Set<string>,
) {
  const same = await tx.ledgerAccount.findFirst({
    where: { type: 'EXPENSE', name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  })
  if (same) {
    await tx.ledgerAccount.update({ where: { id: same.id }, data: { expenseNature: nature } })
    return same.id
  }
  const created = await tx.ledgerAccount.create({
    data: {
      tenantId,
      code: await nextExpenseCode(tx, nature, taken),
      name,
      type: 'EXPENSE',
      expenseNature: nature,
      description: 'Created for an expense head',
    },
    select: { id: true },
  })
  return created.id
}

/**
 * Seeds the starter heads the first time a school opens expenses, and files
 * any expense without a head under its category's primary head. Idempotent.
 */
export async function ensureExpenseHeads(ctx: AppContext) {
  const tenantId = ctx.tenant.id
  const [heads, orphans] = await Promise.all([
    ctx.db.expenseHead.count(),
    ctx.db.schoolExpense.count({ where: { headId: null } }),
  ])
  if (heads > 0 && orphans === 0) return

  const resolve = heads === 0 ? await loadResolver(tenantId, ctx.db) : null
  await ctx.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`expense-heads:${tenantId}`}))`
    if ((await tx.expenseHead.count()) === 0 && resolve) {
      const taken = new Set<string>()
      for (const seed of DEFAULT_EXPENSE_HEADS) {
        let accountId: string
        if (seed.primary) {
          accountId = resolve.expense(seed.category)
          await tx.ledgerAccount.update({ where: { id: accountId }, data: { expenseNature: seed.nature } })
        } else {
          accountId = await accountForNewHead(tx, tenantId, seed.name, seed.nature, taken)
        }
        await tx.expenseHead.create({
          data: { tenantId, name: seed.name, category: seed.category, nature: seed.nature, accountId },
        })
      }
    }

    const orphanRows = await tx.schoolExpense.findMany({
      where: { headId: null },
      select: { id: true, category: true },
    })
    if (orphanRows.length === 0) return
    const all = await tx.expenseHead.findMany({ orderBy: { createdAt: 'asc' } })
    const primaryNames = new Set(DEFAULT_EXPENSE_HEADS.filter((h) => h.primary).map((h) => h.name))
    const headFor = (category: ExpenseCategory) =>
      all.find((h) => h.category === category && primaryNames.has(h.name))
      ?? all.find((h) => h.category === category)
      ?? all.find((h) => h.name === 'Miscellaneous')
      ?? all[0]
    const byHead = new Map<string, { nature: ExpenseNature; ids: string[] }>()
    for (const row of orphanRows) {
      const head = headFor(row.category)
      if (!head) continue
      const bucket = byHead.get(head.id) ?? { nature: head.nature, ids: [] }
      bucket.ids.push(row.id)
      byHead.set(head.id, bucket)
    }
    for (const [headId, { nature, ids }] of byHead) {
      await tx.schoolExpense.updateMany({ where: { id: { in: ids } }, data: { headId, nature } })
    }
  })
}

/* ------------------------------------------------------------------ CRUD */

const natureEnum = z.enum(['DIRECT', 'INDIRECT'])
const categoryEnum = z.enum([
  'SALARY', 'UTILITIES', 'MAINTENANCE', 'SUPPLIES', 'TRANSPORT',
  'FOOD', 'EVENTS', 'ADMIN', 'ACADEMIC', 'OTHER',
])

export const expenseHeadSchema = z.object({
  name: z.string().trim().min(2, 'Name the expense head').max(80),
  nature: natureEnum,
  category: categoryEnum.default('OTHER'),
  description: z.string().trim().max(200).optional().or(z.literal('')),
})

export const expenseHeadUpdateSchema = expenseHeadSchema.extend({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
})

function actor(ctx: AppContext) {
  return `${ctx.user.firstName} ${ctx.user.lastName}`.trim()
}

export async function createExpenseHead(ctx: AppContext, input: z.infer<typeof expenseHeadSchema>) {
  ctx.require('expenses.manage')
  await ensureExpenseHeads(ctx)
  const clash = await ctx.db.expenseHead.findFirst({
    where: { name: { equals: input.name, mode: 'insensitive' } },
    select: { id: true },
  })
  if (clash) throw conflict(`An expense head called "${input.name}" already exists`)

  const created = await ctx.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`expense-heads:${ctx.tenant.id}`}))`
    const accountId = await accountForNewHead(tx, ctx.tenant.id, input.name, input.nature, new Set())
    return tx.expenseHead.create({
      data: {
        tenantId: ctx.tenant.id,
        name: input.name,
        nature: input.nature,
        category: input.category,
        description: input.description || null,
        accountId,
      },
    })
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actor(ctx),
    action: 'expense_head.create',
    module: 'expenses',
    entityType: 'ExpenseHead',
    entityId: created.id,
    summary: `Created ${input.nature.toLowerCase()} expense head ${created.name}`,
    after: created,
  })
  return created
}

/**
 * Sets the nature on a ledger account and on every head and expense that posts
 * to it, so the expense dashboard and the P&L never disagree.
 */
export async function applyAccountNature(
  db: Pick<TenantClient, 'ledgerAccount' | 'expenseHead' | 'schoolExpense'>,
  accountId: string,
  nature: ExpenseNature,
) {
  await db.ledgerAccount.update({ where: { id: accountId }, data: { expenseNature: nature } })
  const heads = await db.expenseHead.findMany({ where: { accountId }, select: { id: true } })
  if (heads.length === 0) return
  const ids = heads.map((h) => h.id)
  await db.expenseHead.updateMany({ where: { id: { in: ids } }, data: { nature } })
  await db.schoolExpense.updateMany({ where: { headId: { in: ids }, nature: { not: nature } }, data: { nature } })
}

export async function updateExpenseHead(ctx: AppContext, input: z.infer<typeof expenseHeadUpdateSchema>) {
  ctx.require('expenses.manage')
  const before = await ctx.db.expenseHead.findFirst({
    where: { id: input.id },
    include: { account: { select: { id: true, name: true, systemKey: true } } },
  })
  if (!before) throw notFound('Expense head')
  if (input.name.toLowerCase() !== before.name.toLowerCase()) {
    const clash = await ctx.db.expenseHead.findFirst({
      where: { name: { equals: input.name, mode: 'insensitive' }, id: { not: before.id } },
      select: { id: true },
    })
    if (clash) throw conflict(`An expense head called "${input.name}" already exists`)
  }

  const updated = await ctx.db.$transaction(async (tx) => {
    const head = await tx.expenseHead.update({
      where: { id: before.id },
      data: {
        name: input.name,
        nature: input.nature,
        category: input.category,
        description: input.description || null,
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    })
    if (before.account && !before.account.systemKey && before.account.name === before.name && input.name !== before.name) {
      await tx.ledgerAccount.update({ where: { id: before.account.id }, data: { name: input.name } })
    }
    if (input.category !== before.category) {
      await tx.schoolExpense.updateMany({ where: { headId: before.id }, data: { category: input.category } })
    }
    if (input.nature !== before.nature) {
      if (before.account) await applyAccountNature(tx, before.account.id, input.nature)
      else await tx.schoolExpense.updateMany({ where: { headId: before.id }, data: { nature: input.nature } })
    }
    return head
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actor(ctx),
    action: 'expense_head.update',
    module: 'expenses',
    entityType: 'ExpenseHead',
    entityId: updated.id,
    summary:
      input.nature !== before.nature
        ? `Moved expense head ${updated.name} to ${input.nature.toLowerCase()} expenses`
        : `Updated expense head ${updated.name}`,
    before,
    after: updated,
  })
  if (input.nature !== before.nature || input.category !== before.category) {
    void import('@/server/modules/accounts/posting')
      .then(({ syncLedgerForTenant }) => syncLedgerForTenant(ctx.tenant.id))
      .catch((err) => console.error('[ledger] head change sync failed', err))
  }
  return updated
}

export async function listExpenseHeads(ctx: AppContext, range?: { from: Date; to: Date }) {
  ctx.require('expenses.view')
  await ensureExpenseHeads(ctx)
  const [heads, totals] = await Promise.all([
    ctx.db.expenseHead.findMany({
      orderBy: [{ nature: 'asc' }, { name: 'asc' }],
      include: { account: { select: { id: true, code: true, name: true } } },
    }),
    ctx.db.schoolExpense.groupBy({
      by: ['headId'],
      where: { deletedAt: null, ...(range ? { expenseDate: { gte: range.from, lte: range.to } } : {}) },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
  ])
  const byHead = new Map(totals.map((t) => [t.headId, t]))
  return heads.map((h) => ({
    ...h,
    amountMinor: byHead.get(h.id)?._sum.amountMinor ?? 0,
    entries: byHead.get(h.id)?._count._all ?? 0,
  }))
}

export async function expenseHeadOptions(ctx: AppContext) {
  ctx.require('expenses.view')
  await ensureExpenseHeads(ctx)
  return ctx.db.expenseHead.findMany({
    orderBy: [{ nature: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, nature: true, category: true, isActive: true },
  })
}

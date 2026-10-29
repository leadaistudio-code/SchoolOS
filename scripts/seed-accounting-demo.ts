/**
 * Fills one school's books with realistic accounting history (April 2024, or
 * the `--from` month, to today) so the accounting pages and analytics have
 * something to show:
 *
 *   npx tsx scripts/seed-accounting-demo.ts --tenant demo            # local database
 *   npx tsx scripts/seed-accounting-demo.ts --tenant demo --confirm  # any other database
 *   npx tsx scripts/seed-accounting-demo.ts --tenant demo --from 2023-04
 *
 * Everything goes through the application's own services (manual journals,
 * expenses, vendors, purchase vouchers, vendor payments, fixed assets,
 * depreciation runs, ledger sync), so it posts exactly as the UI would and
 * passes `scripts/accounting-integrity.ts`.
 *
 * Fee income before the school's itemised fee payments is recorded as monthly
 * summary receipts (manual journals); students' fee records are not touched.
 * Fee payments already in the app are posted by the normal ledger sync.
 *
 * Re-running is safe: every item carries a fixed key and is skipped when it
 * already exists, so an interrupted run resumes where it stopped. Amounts come
 * from a seeded generator, so every run produces the same figures.
 */
import { PrismaClient } from '@prisma/client'

const SEED_REF = 'DEMO'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** First month of the books, `--from 2023-04`; defaults to April 2024. */
const START_MONTH = arg('--from') ?? '2024-04'
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(START_MONTH)) throw new Error('--from takes a month, e.g. 2023-04')

// ------------------------------------------------------------------ helpers

let seed = 20240401
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
/** base +/- spread, rounded to whole rupees. */
function vary(base: number, spread = 0.08) {
  return Math.round(base * (1 + (rand() * 2 - 1) * spread))
}

function istToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}
function monthsFrom(start: string, endIso: string) {
  const out: string[] = []
  let [y, m] = start.split('-').map(Number) as [number, number]
  const [ey, em] = endIso.slice(0, 7).split('-').map(Number) as [number, number]
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}
function day(month: string, d: number) {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(Math.min(d, last)).padStart(2, '0')}`
}
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** Academic years since April 2024: 0 for 2024-25, 1 for 2025-26, ... */
function yearIndex(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return (m >= 4 ? y : y - 1) - 2024
}
function monthNo(month: string) {
  return Number(month.slice(5, 7))
}

const FEE_SEASON: Record<number, number> = { 4: 1.35, 5: 0.9, 6: 0.7, 7: 1.2, 8: 1.0, 9: 0.95, 10: 1.05, 11: 0.95, 12: 0.9, 1: 1.05, 2: 0.95, 3: 0.9 }
const POWER_SEASON: Record<number, number> = { 4: 1.45, 5: 1.6, 6: 1.5, 7: 1.25, 8: 1.2, 9: 1.15, 10: 1.0, 11: 0.8, 12: 0.75, 1: 0.75, 2: 0.8, 3: 1.0 }

// --------------------------------------------------------------------- main

async function main() {
  const slug = arg('--tenant')
  if (!slug) throw new Error('Pass --tenant <school slug>, e.g. --tenant demo')
  const url = new URL(process.env.DATABASE_URL ?? '')
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  console.log(`database: ${url.hostname}:${url.port || '5432'}${url.pathname} (${local ? 'local' : 'REMOTE'})`)
  if (!local && !process.argv.includes('--confirm')) throw new Error('Remote database: re-run with --confirm')

  // The services check the deployment switches; this process only.
  process.env.ACCOUNTING_MODULE_ENABLED = 'true'
  process.env.ACCOUNTING_APPROVALS_ENABLED = 'false'
  // Run from a laptop against a remote database, a transaction of many small
  // queries (e.g. seeding expense heads) outlasts Prisma's 5 s default. The
  // app's client module reuses a client already on globalThis.
  ;(globalThis as { prisma?: PrismaClient }).prisma = new PrismaClient({
    log: ['warn', 'error'],
    transactionOptions: { timeout: 120_000, maxWait: 30_000 },
  })

  const { tenantDb } = await import('../src/server/db/tenant-client')
  const { PERMISSIONS } = await import('../src/lib/rbac/permissions')
  const { ensureChart } = await import('../src/server/modules/accounts/chart')
  const { createManualJournal, journalSchema } = await import('../src/server/modules/accounts/service')
  const { syncLedgerForTenant } = await import('../src/server/modules/accounts/posting')
  const { ensureExpenseHeads } = await import('../src/server/modules/finance/expense-heads')
  const { createExpense, expenseSchema } = await import('../src/server/modules/finance/expenses')
  const payables = await import('../src/server/modules/accounting/payables-service')
  const assets = await import('../src/server/modules/accounting/fixed-assets-service')
  const { refreshLedgerSummary } = await import('../src/server/modules/accounting/analytics-service')
  type AppContext = import('../src/server/context').AppContext

  const prisma = new PrismaClient()
  const today = istToday()
  try {
    const tenant = await prisma.tenant.findFirst({ where: { slug }, select: { id: true, name: true, currency: true } })
    if (!tenant) throw new Error(`No school with slug ${slug}`)
    const admin = await prisma.user.findFirst({
      where: { tenantId: tenant.id, deletedAt: null, roles: { some: { role: { key: 'SCHOOL_ADMIN' } } } },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!admin) throw new Error(`${tenant.name} has no school admin to record the entries as`)
    console.log(`school: ${tenant.name}; entries recorded as ${admin.firstName} ${admin.lastName}; up to ${today}`)

    const held = new Set(PERMISSIONS.map((p) => p.key))
    const db = tenantDb(tenant.id)
    const ctx: AppContext = {
      user: {
        sessionId: 'seed-accounting-demo', userId: admin.id, tenantId: tenant.id, isSuperAdmin: false,
        firstName: admin.firstName, lastName: admin.lastName, displayName: null, email: admin.email, phone: null,
        avatarUrl: null, mustChangePassword: false, roleKeys: ['SCHOOL_ADMIN'], permissions: held, impersonatedById: null,
      } as never,
      tenant: { id: tenant.id, name: tenant.name, currency: tenant.currency ?? 'INR' } as never,
      db,
      can: (p: string) => held.has(p),
      canAny: (...ps: string[]) => ps.some((p) => held.has(p)),
      require: (p: string) => { if (!held.has(p)) throw new Error(`Missing permission: ${p}`) },
    }

    await ensureChart(tenant.id, db)
    await ensureExpenseHeads(ctx)
    const accounts = await db.ledgerAccount.findMany({ select: { id: true, systemKey: true } })
    const sys = (key: string) => {
      const a = accounts.find((x) => x.systemKey === key)
      if (!a) throw new Error(`Missing system account ${key}`)
      return a.id
    }
    const heads = await db.expenseHead.findMany({ select: { id: true, name: true, accountId: true } })
    const head = (name: string) => {
      const h = heads.find((x) => x.name === name)
      if (!h) throw new Error(`Missing expense head ${name}`)
      return h
    }
    const BANK = sys('BANK')
    const CASH = sys('CASH')

    const counts = { journals: 0, expenses: 0, vouchers: 0, payments: 0, assets: 0, runs: 0, skipped: 0 }

    // ------------------------------------------------ manual journals (opening, fees, cash)
    async function journal(reference: string, date: string, voucherType: 'JOURNAL' | 'RECEIPT' | 'CONTRA', narration: string, lines: { accountId: string; debit?: number; credit?: number; memo?: string }[]) {
      if (date > today) return
      const exists = await db.journalEntry.findFirst({ where: { reference, sourceType: 'MANUAL', isReversal: false }, select: { id: true } })
      if (exists) { counts.skipped++; return }
      await createManualJournal(ctx, journalSchema.parse({ date, voucherType, reference, narration, lines }))
      counts.journals++
    }

    // Extending the books backwards moves the opening balances to the new start.
    const openOn = `${START_MONTH}-01`
    const laterOpening = await db.journalEntry.deleteMany({
      where: { reference: `${SEED_REF}-OPEN`, sourceType: 'MANUAL', isReversal: false, date: { gt: new Date(`${openOn}T00:00:00Z`) } },
    })
    if (laterOpening.count) console.log(`moved the opening balances back to ${openOn}`)
    const openLabel = new Date(`${openOn}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    await journal(`${SEED_REF}-OPEN`, openOn, 'JOURNAL', `Opening balances brought forward (bank and cash) as on ${openLabel}`, [
      { accountId: BANK, debit: 3500000, memo: 'Bank balance b/f' },
      { accountId: CASH, debit: 50000, memo: 'Cash in hand b/f' },
      { accountId: sys('OPENING_EQUITY'), credit: 3550000 },
    ])

    // Itemised fee payments already in the app, by month, so summaries only top them up.
    const itemised = await prisma.$queryRaw<{ month: string; minor: bigint }[]>`
      SELECT to_char("paidAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month, SUM("amountMinor")::bigint AS minor
      FROM "FeePayment" WHERE "tenantId" = ${tenant.id} AND "status" = 'SUCCESS' GROUP BY 1`
    const itemisedByMonth = new Map(itemised.map((r) => [r.month, Number(r.minor) / 100]))

    const months = monthsFrom(START_MONTH, today)
    for (const month of months) {
      const y = yearIndex(month)
      const n = monthNo(month)
      const growth = Math.pow(1.07, y)
      const partial = month === today.slice(0, 7) ? Math.min(1, Number(today.slice(8, 10)) / 30) : 1
      const tuition = vary(120 * 6500 * growth * FEE_SEASON[n]!, 0.05) * partial
      const transport = vary(45 * 1600 * growth, 0.06) * partial
      const admission = (n === 4 ? vary(320000) : n === 5 ? vary(110000) : n === 3 ? vary(150000) : 0) * partial
      const exam = n === 9 || n === 2 ? vary(120 * 600) : 0
      const late = vary(6500, 0.4) * partial
      let total = tuition + transport + admission + exam + late
      const already = itemisedByMonth.get(month) ?? 0
      if (already >= total) continue
      const scale = (total - already) / total
      const lines = [
        { accountId: sys('TUITION_INCOME'), amount: tuition * scale, memo: 'Tuition fees' },
        { accountId: sys('TRANSPORT_INCOME'), amount: transport * scale, memo: 'Transport fees' },
        { accountId: sys('ADMISSION_INCOME'), amount: admission * scale, memo: 'Admission & registration' },
        { accountId: sys('EXAM_INCOME'), amount: exam * scale, memo: 'Exam fees' },
        { accountId: sys('LATE_FEE_INCOME'), amount: late * scale, memo: 'Late fees' },
      ].map((l) => ({ ...l, amount: Math.round(l.amount) })).filter((l) => l.amount > 0)
      total = lines.reduce((s, l) => s + l.amount, 0)
      await journal(`${SEED_REF}-FEES-${month}`, day(month, 10) > today ? today : day(month, 10), 'RECEIPT',
        `Fee collections for ${month} (summary of receipts not itemised in the app)`,
        [{ accountId: BANK, debit: total, memo: 'Deposited to bank' }, ...lines.map((l) => ({ accountId: l.accountId, credit: l.amount, memo: l.memo }))])
      await journal(`${SEED_REF}-PETTY-${month}`, day(month, 2), 'CONTRA', `Cash withdrawn from bank for petty expenses (${month})`, [
        { accountId: CASH, debit: 25000 }, { accountId: BANK, credit: 25000 },
      ])
    }

    // --------------------------------------------------------------- expenses
    type Mode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD'
    async function expense(key: string, date: string, headName: string, title: string, amount: number, mode: Mode, vendor?: string) {
      if (date > today || amount <= 0) return
      const idempotencyKey = `demo-seed:${key}`
      const exists = await db.schoolExpense.findFirst({ where: { idempotencyKey }, select: { id: true } })
      if (exists) { counts.skipped++; return }
      await createExpense(ctx, expenseSchema.parse({
        title, headId: head(headName).id, amount, expenseDate: date, paymentMode: mode,
        vendor, referenceNo: mode === 'CASH' ? undefined : `${mode === 'CHEQUE' ? 'CHQ' : 'TXN'}${date.replace(/-/g, '')}${Math.floor(rand() * 900 + 100)}`,
        notes: 'Demo data', idempotencyKey,
      }))
      counts.expenses++
    }

    for (const month of months) {
      const y = yearIndex(month)
      const n = monthNo(month)
      const k = (s: string) => `${month}:${s}`
      await expense(k('salary-t'), day(month, 28), 'Teaching staff salary', `Teaching staff salaries — ${month}`, vary(410000 * Math.pow(1.08, y), 0.015), 'BANK_TRANSFER')
      await expense(k('salary-nt'), day(month, 28), 'Non-teaching staff salary', `Non-teaching staff salaries — ${month}`, vary(92000 * Math.pow(1.07, y), 0.02), 'BANK_TRANSFER')
      await expense(k('power'), day(month, 12), 'Electricity & water', `Electricity bill — ${month}`, vary(38000 * POWER_SEASON[n]!), 'BANK_TRANSFER', 'State Electricity Board')
      await expense(k('net'), day(month, 5), 'Internet & telephone', `Broadband and phone lines — ${month}`, vary(6500, 0.03), 'UPI', 'Airtel Business')
      await expense(k('security'), day(month, 7), 'Housekeeping & security', `Housekeeping & security contract — ${month}`, vary(48000 * Math.pow(1.05, y), 0.01), 'BANK_TRANSFER', 'SecureCare Facility Services')
      await expense(k('fuel'), day(month, 15), 'Student transport & fuel', `Bus fuel — ${month}`, vary(n === 5 || n === 6 ? 22000 : 46000), 'CARD', 'Indian Oil fuel station')
      await expense(k('meals'), day(month, 20), 'Mid-day meal & canteen', `Mid-day meal supplies — ${month}`, vary(n === 5 || n === 6 ? 21000 : 55000), 'BANK_TRANSFER', 'Annapurna Caterers')
      await expense(k('office'), day(month, 9), 'Office stationery & printing', `Office stationery & printing — ${month}`, vary(6500, 0.35), 'CASH')
      await expense(k('admin'), day(month, 18), 'Administrative expenses', `Postage, courier & sundries — ${month}`, vary(8500, 0.3), 'CASH')
      await expense(k('repairs'), day(month, 22), 'Repairs & maintenance', `Minor repairs — ${month}`, vary(4200, 0.45), 'CASH')
      await expense(k('bank'), day(month, 30), 'Bank charges', `Bank charges — ${month}`, vary(650, 0.35), 'BANK_TRANSFER')
      if (n === 6 || n === 12) await expense(k('lab'), day(month, 14), 'Lab, library & sports', n === 6 ? 'Library books and sports kit' : 'Science lab consumables', vary(32000, 0.2), 'BANK_TRANSFER')
      if (n === 8) await expense(k('event'), day(month, 14), 'Student activities & events', 'Independence Day celebration', vary(18000), 'CASH')
      if (n === 11) await expense(k('event'), day(month, 13), 'Student activities & events', "Children's Day programme", vary(15000), 'CASH')
      if (n === 12) await expense(k('event'), day(month, 18), 'Student activities & events', 'Annual Day function', vary(120000), 'BANK_TRANSFER', 'Utsav Events & Decor')
      if (n === 1) await expense(k('event'), day(month, 24), 'Student activities & events', 'Sports Day', vary(35000), 'BANK_TRANSFER')
      if (n === 9 || n === 3) await expense(k('exam'), day(month, 8), 'Exam & assessment expenses', n === 9 ? 'Half-yearly exam papers & printing' : 'Annual exam papers & printing', vary(28000), 'BANK_TRANSFER', 'Print Point')
      if (n === 12 || n === 1 || n === 2 || n === 3) await expense(k('ads'), day(month, 6), 'Advertising & admissions marketing', 'Admissions campaign — newspaper & social media', vary(52000, 0.25), 'BANK_TRANSFER', 'Local Media Agency')
      if (n === 9) await expense(k('audit'), day(month, 25), 'Professional & audit fees', 'Statutory audit fee', vary(75000, 0.03), 'BANK_TRANSFER', 'Gupta & Associates, Chartered Accountants')
      if (n === 7) await expense(k('insurance'), day(month, 10), 'Insurance', 'School bus & building insurance premium', vary(62000, 0.05), 'CHEQUE', 'National Insurance Co.')
    }

    // ------------------------------------------------- vendors and purchases
    const vendorDefs = [
      { name: 'Sharma Stationers & Suppliers', creditDays: 30, contactPerson: 'Rakesh Sharma', phone: '+91 98110 22334' },
      { name: 'Bright Books & Publications', creditDays: 45, contactPerson: 'Neha Kapoor', phone: '+91 98990 45612' },
      { name: 'TechServe IT Solutions', creditDays: 30, contactPerson: 'Arjun Mehta', phone: '+91 99580 77120' },
      { name: 'Ramesh Maintenance Works', creditDays: 15, contactPerson: 'Ramesh Kumar', phone: '+91 98731 66054' },
    ]
    const vendors = new Map<string, string>()
    for (const v of vendorDefs) {
      const existing = await db.vendor.findFirst({ where: { name: v.name }, select: { id: true } })
      vendors.set(v.name, existing?.id ?? (await payables.createVendor(ctx, { ...v, notes: 'Demo data' })).id)
    }

    type Bill = { key: string; vendor: string; date: string; invoiceNo: string; lines: { description: string; head: string; quantity: number; unit: number }[]; paidAfter: number | null }
    const bills: Bill[] = []
    for (const month of months) {
      const n = monthNo(month)
      if (n === 4 || n === 7 || n === 10 || n === 1) {
        bills.push({ key: `stat-${month}`, vendor: 'Sharma Stationers & Suppliers', date: day(month, 4), invoiceNo: `SSS/${month.replace('-', '')}/${Math.floor(rand() * 900 + 100)}`,
          lines: [
            { description: 'Notebooks & registers', head: 'Academic & teaching material', quantity: 400, unit: vary(45, 0.1) },
            { description: 'Chart paper, markers & art supplies', head: 'Academic & teaching material', quantity: 1, unit: vary(14000, 0.2) },
          ], paidAfter: 34 })
      }
      if (n === 3) {
        bills.push({ key: `books-${month}`, vendor: 'Bright Books & Publications', date: day(month, 20), invoiceNo: `BBP-${month.slice(0, 4)}-${Math.floor(rand() * 9000 + 1000)}`,
          lines: [{ description: 'Textbooks for the new session (library & teacher copies)', head: 'Academic & teaching material', quantity: 1, unit: vary(210000, 0.1) }], paidAfter: 50 })
      }
      if (n === 6) {
        bills.push({ key: `it-${month}`, vendor: 'TechServe IT Solutions', date: day(month, 3), invoiceNo: `TS/AMC/${month.slice(0, 4)}`,
          lines: [{ description: 'Annual IT maintenance contract & antivirus licences', head: 'Software & IT', quantity: 1, unit: vary(64000, 0.05) }], paidAfter: 28 })
      }
      if (n % 2 === 0) {
        bills.push({ key: `maint-${month}`, vendor: 'Ramesh Maintenance Works', date: day(month, 16), invoiceNo: `RMW-${month.replace('-', '')}`,
          lines: [{ description: n === 4 || n === 6 ? 'AC servicing & electrical repairs' : 'Plumbing, carpentry & painting work', head: 'Repairs & maintenance', quantity: 1, unit: vary(32000, 0.3) }], paidAfter: 14 })
      }
    }

    for (const bill of bills) {
      if (bill.date > today) continue
      const existed = await db.purchaseVoucher.findFirst({ where: { idempotencyKey: `demo-seed:pv:${bill.key}` }, select: { id: true } })
      const voucher = await payables.createPurchaseVoucher(ctx, {
        vendorId: vendors.get(bill.vendor)!, supplierInvoiceNo: bill.invoiceNo, invoiceDate: bill.date, post: true,
        narration: 'Demo data', idempotencyKey: `demo-seed:pv:${bill.key}`,
        lines: bill.lines.map((l) => ({ description: l.description, accountId: head(l.head).accountId!, quantity: l.quantity, unitCostMinor: l.unit * 100, taxPercent: 0 })),
      })
      if (existed) counts.skipped++
      else counts.vouchers++
      const paidOn = bill.paidAfter === null ? null : addDays(bill.date, bill.paidAfter)
      // Leave the latest bills open so vendor aging has something to show.
      if (!paidOn || paidOn > today || paidOn > addDays(today, -20)) continue
      const exists = await db.vendorPayment.findFirst({ where: { idempotencyKey: `demo-seed:vp:${bill.key}` }, select: { id: true } })
      if (exists) { counts.skipped++; continue }
      const total = (voucher as { totalMinor: number }).totalMinor
      await payables.recordVendorPayment(ctx, {
        vendorId: vendors.get(bill.vendor)!, paidOn, mode: 'BANK_TRANSFER', reference: `NEFT${paidOn.replace(/-/g, '')}${Math.floor(rand() * 9000 + 1000)}`,
        amountMinor: total, narration: `Payment against ${bill.invoiceNo}`, allocations: [{ voucherId: voucher.id, amountMinor: total }],
        idempotencyKey: `demo-seed:vp:${bill.key}`,
      })
      counts.payments++
    }

    // ------------------------------------------------- fixed assets and depreciation
    const assetDefs = [
      { key: 'computers', name: 'Computer lab — 25 desktops', category: 'Computers', location: 'Computer lab', capitalisedOn: '2024-04-20', cost: 750000, rateBp: 4000 },
      { key: 'furniture', name: 'Classroom furniture (desks & benches)', category: 'Furniture & fixtures', location: 'Classrooms', capitalisedOn: '2024-06-10', cost: 360000, rateBp: 1000 },
      { key: 'bus', name: 'School bus — 40-seater', category: 'Vehicles', location: 'Transport', capitalisedOn: '2024-07-05', cost: 2400000, rateBp: 1500 },
      { key: 'smartboards', name: 'Smart boards (8 classrooms)', category: 'Electronic equipment', location: 'Classrooms', capitalisedOn: '2025-04-15', cost: 480000, rateBp: 1500 },
      { key: 'lab', name: 'Science lab equipment', category: 'Lab equipment', location: 'Science lab', capitalisedOn: '2025-08-12', cost: 210000, rateBp: 1500 },
      { key: 'cctv', name: 'CCTV surveillance system (24 cameras)', category: 'Electronic equipment', location: 'Campus', capitalisedOn: '2026-01-20', cost: 165000, rateBp: 1500 },
    ]
    for (const a of assetDefs) {
      if (a.capitalisedOn > today) continue
      const exists = await db.fixedAsset.findFirst({ where: { idempotencyKey: `demo-seed:fa:${a.key}` }, select: { id: true } })
      if (exists) { counts.skipped++; continue }
      await assets.createFixedAsset(ctx, {
        name: a.name, category: a.category, location: a.location, capitalisedOn: a.capitalisedOn, costMinor: a.cost * 100, rateBp: a.rateBp,
        capitalisation: 'POSTED', fundingAccountId: BANK, notes: 'Demo data', idempotencyKey: `demo-seed:fa:${a.key}`,
      })
      counts.assets++
    }
    for (const periodEnd of ['2025-03-31', '2026-03-31']) {
      if (periodEnd > today) continue
      const exists = await db.depreciationRun.findFirst({ where: { periodKey: periodEnd }, select: { id: true } })
      if (exists) { counts.skipped++; continue }
      await assets.createDepreciationRun(ctx, { periodEnd, idempotencyKey: `demo-seed:dep:${periodEnd}` })
      counts.runs++
    }

    // ------------------------------------------------- post, then refresh analytics
    const sync = await syncLedgerForTenant(tenant.id, { full: true })
    const refresh = await refreshLedgerSummary(tenant.id, { force: true })
    console.log('created:', JSON.stringify(counts))
    console.log('ledger sync:', JSON.stringify(sync))
    console.log('analytics summary:', JSON.stringify(refresh))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

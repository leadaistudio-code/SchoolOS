/* eslint-disable no-console */
/**
 * Import Apni Pathshala 2026-27 fee structures + student ledgers from the
 * parsed Uolo payment-collection CSV. Touches ONLY that tenant.
 *
 *   npx tsx scripts/import-apni-pathshala-fees.ts           # dry-run (default)
 *   npx tsx scripts/import-apni-pathshala-fees.ts --apply
 *   npx tsx scripts/import-apni-pathshala-fees.ts --apply --force
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PrismaClient, type InvoiceStatus } from '@prisma/client'

const prisma = new PrismaClient()

const SESSION_NAME = '2026-27'
const INVOICE_TITLE = '2026-27 Academic fees (Uolo import)'
const CSV_PATH = path.join(__dirname, '..', 'prisma', '_apni_fees_2026_27.csv')

const APPLY = process.argv.includes('--apply')
const FORCE = process.argv.includes('--force')

type CsvRow = {
  admission: string
  name: string
  class: string
  past_due: number
  requested: number
  discount: number
  amount_paid: number
  balance: number
}

function rupeesToMinor(n: number): number {
  return Math.round(n * 100)
}

function parseCsv(filePath: string): CsvRow[] {
  const raw = readFileSync(filePath, 'utf8').trim()
  const lines = raw.split(/\r?\n/)
  if (lines.length < 2) throw new Error(`CSV empty: ${filePath}`)
  const header = lines[0]!.split(',')
  const idx = (name: string) => {
    const i = header.indexOf(name)
    if (i < 0) throw new Error(`CSV missing column ${name}`)
    return i
  }
  const cols = {
    admission: idx('admission'),
    name: idx('name'),
    class: idx('class'),
    past_due: idx('past_due'),
    requested: idx('requested'),
    discount: idx('discount'),
    amount_paid: idx('amount_paid'),
    balance: idx('balance'),
  }

  const rows: CsvRow[] = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    // Simple CSV (no embedded commas in fields for this extract)
    const parts = line.split(',')
    rows.push({
      admission: parts[cols.admission]!.trim(),
      name: parts[cols.name]!.trim(),
      class: parts[cols.class]!.trim(),
      past_due: Number(parts[cols.past_due]),
      requested: Number(parts[cols.requested]),
      discount: Number(parts[cols.discount]),
      amount_paid: Number(parts[cols.amount_paid]),
      balance: Number(parts[cols.balance]),
    })
  }
  return rows
}

/** Mode of requested; ties → higher amount. */
function modeRequested(amounts: number[]): number {
  const counts = new Map<number, number>()
  for (const a of amounts) counts.set(a, (counts.get(a) ?? 0) + 1)
  let best = amounts[0] ?? 0
  let bestN = -1
  for (const [amt, n] of counts) {
    if (n > bestN || (n === bestN && amt > best)) {
      best = amt
      bestN = n
    }
  }
  return best
}

function classNumeric(label: string): number {
  if (/11/.test(label)) return 11
  if (/12/.test(label)) return 12
  return 0
}

function classStream(label: string): string | null {
  const l = label.toLowerCase()
  if (l.includes('medical') && !l.includes('non')) return 'Medical'
  if (l.includes('non-med') || l.includes('non medical') || l.includes('non-medical')) {
    return 'Non-Medical'
  }
  if (l.includes('commerce') || l.includes('comm ')) {
    return l.includes('without') ? 'Commerce without Math' : 'Commerce with Math'
  }
  if (l.includes('arts')) return 'Arts'
  return null
}

function classYear(label: string): 11 | 12 | 0 {
  if (/11/.test(label)) return 11
  if (/12/.test(label)) return 12
  return 0
}

const NAME_ALIASES: Record<string, string> = {
  shushant: 'sushant',
  arron: 'aaron',
  yogeeta: 'yogita',
  anshuman: 'anshuman',
}

function normalizePersonName(s: string): string {
  let parts = s
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => NAME_ALIASES[p] ?? p)

  // Collapse "m d zami" / "md zami" → "md zami"
  if (parts[0] === 'm' && parts[1] === 'd') {
    parts = ['md', ...parts.slice(2)]
  }
  if (parts[0] === 'md') {
    // keep
  }
  return parts.join(' ')
}

function invoiceStatus(totalMinor: number, paidMinor: number, balanceMinor: number): InvoiceStatus {
  if (balanceMinor <= 0 && paidMinor > 0) return 'PAID'
  if (paidMinor > 0 && balanceMinor > 0) return 'PARTIALLY_PAID'
  if (totalMinor > 0 && balanceMinor > 0) return 'ISSUED'
  if (totalMinor === 0) return 'PAID'
  return 'ISSUED'
}

function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 8).toUpperCase()
}

type MatchedStudent = {
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  matchVia: 'admission' | 'name'
}

async function loadAndMatchStudents(
  tenantId: string,
  rows: CsvRow[],
): Promise<{
  matched: { row: CsvRow; student: MatchedStudent }[]
  unmatched: CsvRow[]
  ambiguous: { row: CsvRow; candidates: string[] }[]
}> {
  const students = await prisma.student.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        select: { classLevel: { select: { name: true } } },
      },
    },
  })

  const enriched = students.map((s) => {
    const cls = s.enrollments[0]?.classLevel.name ?? ''
    return {
      id: s.id,
      admissionNo: s.admissionNo,
      firstName: s.firstName,
      lastName: s.lastName,
      key: normalizePersonName(`${s.firstName} ${s.lastName}`),
      year: classYear(cls),
    }
  })

  const byAdm = new Map(enriched.map((s) => [s.admissionNo.toLowerCase(), s]))
  const used = new Set<string>()
  const matched: { row: CsvRow; student: MatchedStudent }[] = []
  const unmatched: CsvRow[] = []
  const ambiguous: { row: CsvRow; candidates: string[] }[] = []

  for (const row of rows) {
    const byAdmission = byAdm.get(row.admission.toLowerCase())
    if (byAdmission && !used.has(byAdmission.id)) {
      used.add(byAdmission.id)
      matched.push({
        row,
        student: { ...byAdmission, matchVia: 'admission' },
      })
      continue
    }

    const key = normalizePersonName(row.name)
    const year = classYear(row.class)
    let hits = enriched.filter((s) => !used.has(s.id) && s.key === key)
    if (hits.length === 0) {
      const tokens = key.split(' ').filter((t) => t.length > 1)
      hits = enriched.filter((s) => {
        if (used.has(s.id)) return false
        const st = new Set(s.key.split(' '))
        return tokens.length > 0 && tokens.every((t) => st.has(t))
      })
    }
    if (hits.length > 1 && year) {
      const byYear = hits.filter((s) => s.year === year)
      if (byYear.length > 0) hits = byYear
    }

    if (hits.length === 1) {
      used.add(hits[0]!.id)
      matched.push({
        row,
        student: { ...hits[0]!, matchVia: 'name' },
      })
    } else if (hits.length > 1) {
      ambiguous.push({
        row,
        candidates: hits.map((h) => `${h.admissionNo} (${h.firstName} ${h.lastName})`),
      })
    } else {
      unmatched.push(row)
    }
  }

  return { matched, unmatched, ambiguous }
}

async function syncEnrollmentToStreamClass(opts: {
  tenantId: string
  sessionId: string
  studentId: string
  classLevelId: string
}) {
  const section = await prisma.section.findFirst({
    where: { tenantId: opts.tenantId, classLevelId: opts.classLevelId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true },
  })
  if (!section) return

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId: opts.tenantId,
      studentId: opts.studentId,
      sessionId: opts.sessionId,
    },
  })
  if (!enrollment) {
    await prisma.enrollment.create({
      data: {
        tenantId: opts.tenantId,
        studentId: opts.studentId,
        sessionId: opts.sessionId,
        classLevelId: opts.classLevelId,
        sectionId: section.id,
        isCurrent: true,
      },
    })
    return
  }
  if (enrollment.classLevelId === opts.classLevelId) return
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { classLevelId: opts.classLevelId, sectionId: section.id, isCurrent: true },
  })
}

async function maybeUpdateAdmissionNo(opts: {
  tenantId: string
  studentId: string
  current: string
  uoloAdmission: string
}) {
  if (opts.current.toLowerCase() === opts.uoloAdmission.toLowerCase()) return
  if (!opts.current.toUpperCase().startsWith('ADM-2026')) return
  const clash = await prisma.student.findFirst({
    where: {
      tenantId: opts.tenantId,
      admissionNo: { equals: opts.uoloAdmission, mode: 'insensitive' },
      id: { not: opts.studentId },
      deletedAt: null,
    },
    select: { id: true },
  })
  if (clash) return
  await prisma.student.update({
    where: { id: opts.studentId },
    data: { admissionNo: opts.uoloAdmission },
  })
}

async function resolveTenant() {
  // Prefer exact slug; never touch little-pathshala or other siblings.
  const bySlug = await prisma.tenant.findFirst({
    where: { slug: 'apni-pathshala' },
    include: { school: { select: { id: true, name: true, code: true } } },
  })
  if (bySlug) return bySlug

  const tenants = await prisma.tenant.findMany({
    where: {
      OR: [
        { name: { equals: 'Apni Pathshala', mode: 'insensitive' } },
        { school: { name: { contains: 'APNI PATHSHALA', mode: 'insensitive' } } },
        { school: { name: { contains: 'Apni Pathshala', mode: 'insensitive' } } },
      ],
      NOT: { slug: { contains: 'little', mode: 'insensitive' } },
    },
    include: { school: { select: { id: true, name: true, code: true } } },
  })

  if (tenants.length === 0) {
    throw new Error('Apni Pathshala tenant not found (slug apni-pathshala)')
  }
  if (tenants.length > 1) {
    throw new Error(
      `Ambiguous Pathshala tenants: ${tenants.map((t) => `${t.slug}/${t.id}`).join(', ')}`,
    )
  }

  const tenant = tenants[0]!
  if (tenant.slug !== 'apni-pathshala' && !/apni.?pathshala/i.test(tenant.school?.name ?? tenant.name)) {
    throw new Error(`Refusing tenant that does not look like Apni Pathshala: ${tenant.slug}`)
  }
  return tenant
}

async function ensureSession(tenantId: string) {
  const existing = await prisma.academicSession.findFirst({
    where: { tenantId, name: SESSION_NAME },
  })
  if (existing) return existing

  const hasCurrent = await prisma.academicSession.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true },
  })

  if (!APPLY) {
    console.log(`[dry-run] would create session ${SESSION_NAME}`)
    return {
      id: `dry-session-${tenantId}`,
      tenantId,
      name: SESSION_NAME,
      startsOn: new Date('2026-04-01'),
      endsOn: new Date('2027-03-31'),
      isCurrent: !hasCurrent,
      isLocked: false,
      createdAt: new Date(),
    }
  }

  return prisma.academicSession.create({
    data: {
      tenantId,
      name: SESSION_NAME,
      startsOn: new Date('2026-04-01'),
      endsOn: new Date('2027-03-31'),
      isCurrent: !hasCurrent,
    },
  })
}

async function ensureFeeHeads(tenantId: string) {
  const specs = [
    { code: 'TUI', name: 'Tuition', frequency: 'ANNUAL' as const, sortOrder: 10 },
    { code: 'ARR', name: 'Arrears', frequency: 'ONE_TIME' as const, sortOrder: 5 },
  ]

  const map = new Map<string, string>()
  for (const spec of specs) {
    if (!APPLY) {
      const existing = await prisma.feeHead.findFirst({
        where: { tenantId, code: spec.code, deletedAt: null },
        select: { id: true },
      })
      map.set(spec.code, existing?.id ?? `dry-head-${spec.code}`)
      continue
    }
    const row = await prisma.feeHead.upsert({
      where: { tenantId_code: { tenantId, code: spec.code } },
      create: {
        tenantId,
        code: spec.code,
        name: spec.name,
        frequency: spec.frequency,
        sortOrder: spec.sortOrder,
      },
      update: {
        name: spec.name,
        frequency: spec.frequency,
        deletedAt: null,
        sortOrder: spec.sortOrder,
      },
    })
    map.set(spec.code, row.id)
  }
  return map
}

async function ensureClassLevel(
  tenantId: string,
  sessionId: string,
  label: string,
): Promise<{ id: string; name: string }> {
  const existing = await prisma.classLevel.findFirst({
    where: { tenantId, sessionId, name: label },
    select: { id: true, name: true, deletedAt: true },
  })
  if (existing) {
    if (existing.deletedAt && APPLY) {
      await prisma.classLevel.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          numeric: classNumeric(label),
          stream: classStream(label),
        },
      })
    }
    const section = await prisma.section.findFirst({
      where: { tenantId, classLevelId: existing.id, deletedAt: null },
      select: { id: true },
    })
    if (!section && APPLY) {
      await prisma.section.create({
        data: { tenantId, classLevelId: existing.id, name: 'A', capacity: 60 },
      })
    }
    return { id: existing.id, name: existing.name }
  }

  if (!APPLY) {
    console.log(`[dry-run] would create class "${label}"`)
    return { id: `dry-class-${shortHash(label)}`, name: label }
  }

  try {
    const created = await prisma.classLevel.create({
      data: {
        tenantId,
        sessionId,
        name: label,
        numeric: classNumeric(label),
        stream: classStream(label),
        sections: { create: { tenantId, name: 'A', capacity: 60 } },
      },
      select: { id: true, name: true },
    })
    return created
  } catch (err) {
    const again = await prisma.classLevel.findFirst({
      where: { tenantId, sessionId, name: label },
      select: { id: true, name: true },
    })
    if (again) return again
    throw err
  }
}

async function ensureStructure(opts: {
  tenantId: string
  sessionId: string
  classLevelId: string
  label: string
  tuitionRupees: number
  tuiHeadId: string
}) {
  const name = `${opts.label} ${SESSION_NAME}`
  const amountMinor = rupeesToMinor(opts.tuitionRupees)

  if (!APPLY) {
    console.log(`[dry-run] structure "${name}" TUI=₹${opts.tuitionRupees}`)
    return { id: `dry-struct-${shortHash(name)}`, name }
  }

  const structure = await prisma.feeStructure.upsert({
    where: {
      tenantId_sessionId_name: {
        tenantId: opts.tenantId,
        sessionId: opts.sessionId,
        name,
      },
    },
    create: {
      tenantId: opts.tenantId,
      sessionId: opts.sessionId,
      classLevelId: opts.classLevelId,
      name,
      description: `Standard annual tuition for ${opts.label} (mode from Uolo Requested)`,
      isActive: true,
    },
    update: {
      classLevelId: opts.classLevelId,
      isActive: true,
      deletedAt: null,
      description: `Standard annual tuition for ${opts.label} (mode from Uolo Requested)`,
    },
  })

  await prisma.feeStructureItem.upsert({
    where: {
      tenantId_structureId_feeHeadId: {
        tenantId: opts.tenantId,
        structureId: structure.id,
        feeHeadId: opts.tuiHeadId,
      },
    },
    create: {
      tenantId: opts.tenantId,
      structureId: structure.id,
      feeHeadId: opts.tuiHeadId,
      amountMinor,
      isOptional: false,
    },
    update: { amountMinor, isOptional: false },
  })

  return structure
}

async function nextInvoiceNumber(tenantId: string, seq: number): Promise<string> {
  const base = `INV-2627-UOLO-${String(seq).padStart(4, '0')}`
  const clash = await prisma.feeInvoice.findFirst({
    where: { tenantId, number: base },
    select: { id: true },
  })
  if (!clash) return base
  return `INV-2627-UOLO-${String(seq).padStart(4, '0')}-${shortHash(base)}`
}

async function nextReceiptNumber(tenantId: string, seq: number): Promise<string> {
  const base = `RCP-2627-UOLO-${String(seq).padStart(4, '0')}`
  const clash = await prisma.feeReceipt.findFirst({
    where: { tenantId, number: base },
    select: { id: true },
  })
  if (!clash) return base
  return `RCP-2627-UOLO-${String(seq).padStart(4, '0')}-${shortHash(base)}`
}

async function main() {
  console.log(APPLY ? 'MODE: apply' : 'MODE: dry-run (pass --apply to write)')
  if (FORCE) console.log('FORCE: replace existing Uolo-import invoices')

  const rows = parseCsv(CSV_PATH)
  console.log(`CSV rows: ${rows.length} from ${CSV_PATH}`)

  const tenant = await resolveTenant()
  const tenantId = tenant.id
  console.log(`Tenant locked: ${tenant.school?.name ?? tenant.name} / ${tenant.slug} / ${tenantId}`)

  const session = await ensureSession(tenantId)
  console.log(`Session: ${session.name} (${session.id})`)

  const heads = await ensureFeeHeads(tenantId)
  const tuiHeadId = heads.get('TUI')!
  const arrHeadId = heads.get('ARR')!

  const byClass = new Map<string, CsvRow[]>()
  for (const row of rows) {
    const list = byClass.get(row.class) ?? []
    list.push(row)
    byClass.set(row.class, list)
  }

  const classModes = new Map<string, number>()
  const structureByClass = new Map<string, { id: string; name: string }>()
  const classLevelIds = new Map<string, string>()

  console.log('\n=== Fee structures (mode Requested) ===')
  for (const [label, classRows] of [...byClass.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const mode = modeRequested(classRows.map((r) => r.requested))
    classModes.set(label, mode)
    const classLevel = await ensureClassLevel(tenantId, session.id, label)
    classLevelIds.set(label, classLevel.id)
    const structure = await ensureStructure({
      tenantId,
      sessionId: session.id,
      classLevelId: classLevel.id,
      label,
      tuitionRupees: mode,
      tuiHeadId,
    })
    structureByClass.set(label, { id: structure.id, name: structure.name })
    console.log(`  ${label}: mode ₹${mode} → ${structure.name}`)
  }

  const { matched, unmatched, ambiguous } = await loadAndMatchStudents(tenantId, rows)

  console.log(`\n=== Student match ===`)
  console.log(`  matched: ${matched.length} (admission: ${matched.filter((m) => m.student.matchVia === 'admission').length}, name: ${matched.filter((m) => m.student.matchVia === 'name').length})`)
  console.log(`  unmatched: ${unmatched.length}`)
  console.log(`  ambiguous: ${ambiguous.length}`)
  if (unmatched.length) {
    console.log('  Unmatched:')
    for (const u of unmatched) {
      console.log(`    ${u.admission}  ${u.name}  ${u.class}`)
    }
  }
  if (ambiguous.length) {
    console.log('  Ambiguous (skipped):')
    for (const a of ambiguous) {
      console.log(`    ${a.row.admission} ${a.row.name} → ${a.candidates.join(' | ')}`)
    }
  }

  let wouldCreate = 0
  let wouldSkip = 0
  let wouldReplace = 0
  let sheetBalanceMatched = 0
  let invoiceBalanceSum = 0
  let seq = 1
  let enrollmentMoves = 0
  let admissionUpdates = 0

  console.log(`\n=== Invoices (${INVOICE_TITLE}) ===`)

  for (const { row, student } of matched) {
    const structure = structureByClass.get(row.class)
    const classLevelId = classLevelIds.get(row.class)

    if (APPLY && classLevelId && !classLevelId.startsWith('dry-')) {
      const before = await prisma.enrollment.findFirst({
        where: { tenantId, studentId: student.id, sessionId: session.id },
        select: { classLevelId: true },
      })
      await syncEnrollmentToStreamClass({
        tenantId,
        sessionId: session.id,
        studentId: student.id,
        classLevelId,
      })
      if (before && before.classLevelId !== classLevelId) enrollmentMoves++
      else if (!before) enrollmentMoves++

      const beforeAdm = student.admissionNo
      await maybeUpdateAdmissionNo({
        tenantId,
        studentId: student.id,
        current: student.admissionNo,
        uoloAdmission: row.admission,
      })
      const after = await prisma.student.findFirst({
        where: { id: student.id },
        select: { admissionNo: true },
      })
      if (after && after.admissionNo !== beforeAdm) admissionUpdates++
    }

    const pastDueCredit = row.past_due < 0 ? Math.abs(row.past_due) : 0
    const pastDueCharge = row.past_due > 0 ? row.past_due : 0
    const discountRupees = row.discount + pastDueCredit

    const lines: { feeHeadId: string; label: string; amountMinor: number; discountMinor: number }[] =
      []
    if (pastDueCharge > 0) {
      lines.push({
        feeHeadId: arrHeadId,
        label: 'Arrears (past due)',
        amountMinor: rupeesToMinor(pastDueCharge),
        discountMinor: 0,
      })
    }
    if (row.requested > 0) {
      lines.push({
        feeHeadId: tuiHeadId,
        label: 'Tuition',
        amountMinor: rupeesToMinor(row.requested),
        discountMinor: 0,
      })
    }

    const subtotalMinor = lines.reduce((s, l) => s + l.amountMinor, 0)
    const discountMinor = rupeesToMinor(discountRupees)
    const totalMinor = Math.max(0, subtotalMinor - discountMinor)
    const paidMinor = Math.min(totalMinor, rupeesToMinor(row.amount_paid))
    const balanceMinor = Math.max(0, totalMinor - paidMinor)
    const expectedBalanceMinor = rupeesToMinor(row.balance)

    sheetBalanceMatched += row.balance
    invoiceBalanceSum += balanceMinor / 100

    if (balanceMinor !== expectedBalanceMinor) {
      console.warn(
        `  balance drift ${row.admission}: invoice ₹${balanceMinor / 100} vs sheet ₹${row.balance}`,
      )
    }

    const existing = await prisma.feeInvoice.findFirst({
      where: {
        tenantId,
        studentId: student.id,
        title: INVOICE_TITLE,
        cancelledAt: null,
      },
      select: { id: true, number: true },
    })

    if (existing && !FORCE) {
      wouldSkip++
      continue
    }
    if (existing && FORCE) wouldReplace++
    else wouldCreate++

    const status = invoiceStatus(totalMinor, paidMinor, balanceMinor)
    const issuedOn = new Date('2026-04-01')
    const dueOn = new Date('2026-06-30')

    if (!APPLY) {
      if (seq <= 5 || balanceMinor !== expectedBalanceMinor) {
        console.log(
          `  [dry-run] ${row.admission} ↔ ${student.admissionNo} (${student.matchVia}) ${student.firstName} ${student.lastName}: ` +
            `sub ₹${subtotalMinor / 100} disc ₹${discountMinor / 100} paid ₹${paidMinor / 100} ` +
            `bal ₹${balanceMinor / 100} (${status})`,
        )
      }
      seq++
      continue
    }

    await prisma.$transaction(async (tx) => {
      if (existing && FORCE) {
        await tx.feePaymentAllocation.deleteMany({ where: { invoiceId: existing.id, tenantId } })
        await tx.feeInvoice.update({
          where: { id: existing.id },
          data: { cancelledAt: new Date(), status: 'CANCELLED', balanceMinor: 0 },
        })
      }

      const number = await nextInvoiceNumber(tenantId, seq)
      const invoice = await tx.feeInvoice.create({
        data: {
          tenantId,
          number,
          studentId: student.id,
          sessionId: session.id,
          structureId: structure && !structure.id.startsWith('dry-') ? structure.id : null,
          title: INVOICE_TITLE,
          issuedOn,
          dueOn,
          status,
          subtotalMinor,
          discountMinor,
          taxMinor: 0,
          lateFeeMinor: 0,
          totalMinor,
          paidMinor,
          balanceMinor,
          notes: `Imported from Uolo collection sheet 2026-09-04. Admission ${row.admission}. Class ${row.class}.`,
          lines: {
            create: lines.map((l) => ({
              tenantId,
              feeHeadId: l.feeHeadId,
              label: l.label,
              amountMinor: l.amountMinor,
              discountMinor: l.discountMinor,
            })),
          },
        },
      })

      if (paidMinor > 0) {
        const payment = await tx.feePayment.create({
          data: {
            tenantId,
            studentId: student.id,
            amountMinor: paidMinor,
            mode: 'BANK_TRANSFER',
            status: 'SUCCESS',
            provider: 'manual',
            providerPaymentId: `uolo-import-${row.admission}-${shortHash(row.admission + String(paidMinor))}`,
            paidAt: issuedOn,
            allocations: {
              create: { tenantId, invoiceId: invoice.id, amountMinor: paidMinor },
            },
          },
        })
        await tx.feeReceipt.create({
          data: {
            tenantId,
            number: await nextReceiptNumber(tenantId, seq),
            paymentId: payment.id,
            issuedOn,
          },
        })
      }
    })

    seq++
  }

  console.log(`\n=== Summary ===`)
  console.log(`  structures: ${structureByClass.size}`)
  console.log(`  invoices create: ${wouldCreate}`)
  console.log(`  invoices skip (already imported): ${wouldSkip}`)
  console.log(`  invoices replace (--force): ${wouldReplace}`)
  console.log(`  enrollment stream moves: ${enrollmentMoves}`)
  console.log(`  admissionNo synced to Uolo id: ${admissionUpdates}`)
  console.log(`  sheet balance (matched students) ₹${sheetBalanceMatched}`)
  console.log(`  computed invoice balance sum ₹${Math.round(invoiceBalanceSum)}`)
  console.log(`  unmatched students: ${unmatched.length}`)
  console.log(`  ambiguous students: ${ambiguous.length}`)
  if (!APPLY) console.log('\nRe-run with --apply to write to the database.')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

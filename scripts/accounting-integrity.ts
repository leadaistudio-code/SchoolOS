/**
 * Read-only accounting integrity check across every school.
 *
 *   npx tsx scripts/accounting-integrity.ts            # summary
 *   npx tsx scripts/accounting-integrity.ts --verbose  # with sample ids
 *
 * Exits 1 when a rule is broken. "Info" lines are reported but never fail the run.
 * Nothing is written.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { runIntegrityChecks } from '../src/server/modules/accounting/integrity'

const prisma = new PrismaClient()
const verbose = process.argv.includes('--verbose')

async function main() {
  const tenants = new Map((await prisma.tenant.findMany({ select: { id: true, slug: true } })).map((t) => [t.id, t.slug]))
  const totals = await prisma.$queryRaw<{ entries: bigint; lines: bigint; dr: bigint | null; cr: bigint | null }[]>`
    SELECT (SELECT COUNT(*) FROM "JournalEntry") AS entries, COUNT(*) AS lines, SUM("debitMinor")::bigint AS dr, SUM("creditMinor")::bigint AS cr FROM "JournalLine"`
  const t = totals[0]!
  console.log(`Journal: ${t.entries} vouchers, ${t.lines} lines, Dr ${t.dr ?? 0} = Cr ${t.cr ?? 0}: ${t.dr === t.cr ? 'balanced' : 'NOT BALANCED'}\n`)

  let broken = 0
  for (const result of await runIntegrityChecks(prisma)) {
    const byTenant = new Map<string, number>()
    for (const r of result.rows) byTenant.set(r.tenantId, (byTenant.get(r.tenantId) ?? 0) + 1)
    const label = result.rows.length === 0 ? 'ok  ' : result.kind === 'rule' ? 'FAIL' : 'info'
    if (result.rows.length && result.kind === 'rule') broken += 1
    const where = [...byTenant].map(([id, n]) => `${tenants.get(id) ?? id}: ${n}`).join(', ')
    console.log(`${label}  ${result.name}${result.rows.length ? `  (${where})` : ''}`)
    if (verbose) for (const r of result.rows.slice(0, 5)) console.log(`        ${tenants.get(r.tenantId) ?? r.tenantId} ${r.id} ${r.detail ?? ''}`)
  }
  console.log(`\n${broken === 0 ? 'All rules hold.' : `${broken} rule(s) broken.`}`)
  process.exitCode = broken === 0 ? 0 : 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 2
  })
  .finally(() => prisma.$disconnect())

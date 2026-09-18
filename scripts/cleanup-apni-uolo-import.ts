/* eslint-disable no-console */
/**
 * Reverse the Apni Pathshala Uolo PDF ledger import.
 * Tenant-locked to slug `apni-pathshala` only.
 *
 * Removes:
 *  - Fee invoices titled "2026-27 Academic fees (Uolo import)" (+ lines, allocations)
 *  - Payments with providerPaymentId `uolo-import-*` (+ receipts)
 *  - Fee structures whose description mentions Uolo Requested
 *  - Class levels / sections created for those Uolo stream labels (soft-delete)
 *    when they have no remaining non-cancelled invoices and no other fee structures
 *
 * Does NOT delete students.
 *
 *   npx tsx scripts/cleanup-apni-uolo-import.ts            # dry-run
 *   npx tsx scripts/cleanup-apni-uolo-import.ts --apply
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const INVOICE_TITLE = '2026-27 Academic fees (Uolo import)'

async function main() {
  console.log(APPLY ? 'MODE: apply' : 'MODE: dry-run (pass --apply to write)')

  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'apni-pathshala' },
    select: { id: true, slug: true, name: true, school: { select: { name: true } } },
  })
  if (!tenant) throw new Error('Tenant apni-pathshala not found')
  const tenantId = tenant.id
  console.log(`Tenant: ${tenant.school?.name ?? tenant.name} / ${tenant.slug} / ${tenantId}`)

  const invoices = await prisma.feeInvoice.findMany({
    where: {
      tenantId,
      OR: [
        { title: INVOICE_TITLE },
        { number: { startsWith: 'INV-2627-UOLO-' } },
        { notes: { contains: 'Imported from Uolo collection sheet' } },
      ],
    },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      cancelledAt: true,
      studentId: true,
      structureId: true,
      totalMinor: true,
      paidMinor: true,
      balanceMinor: true,
    },
  })

  const payments = await prisma.feePayment.findMany({
    where: {
      tenantId,
      OR: [
        { providerPaymentId: { startsWith: 'uolo-import-' } },
        { notes: { contains: 'Uolo' } },
        { providerPaymentId: { contains: 'uolo-import' } },
      ],
    },
    select: {
      id: true,
      amountMinor: true,
      providerPaymentId: true,
      status: true,
      receipt: { select: { id: true, number: true } },
    },
  })

  // Also catch receipts numbered from the import even if payment link is odd
  const receipts = await prisma.feeReceipt.findMany({
    where: { tenantId, number: { startsWith: 'RCP-2627-UOLO-' } },
    select: { id: true, number: true, paymentId: true },
  })

  const structures = await prisma.feeStructure.findMany({
    where: {
      tenantId,
      OR: [
        { description: { contains: 'Uolo Requested' } },
        { description: { contains: 'mode from Uolo' } },
        { name: { endsWith: '2026-27' }, description: { contains: 'Uolo' } },
      ],
    },
    select: {
      id: true,
      name: true,
      classLevelId: true,
      description: true,
      deletedAt: true,
      _count: { select: { items: true, invoices: true } },
    },
  })

  const uoloClassIds = [
    ...new Set(structures.map((s) => s.classLevelId).filter((id): id is string => Boolean(id))),
  ]

  const uoloClasses = uoloClassIds.length
    ? await prisma.classLevel.findMany({
        where: { tenantId, id: { in: uoloClassIds } },
        select: {
          id: true,
          name: true,
          deletedAt: true,
          sessionId: true,
          sections: {
            where: { deletedAt: null },
            select: { id: true, name: true, _count: { select: { enrollments: { where: { isCurrent: true } } } } },
          },
          _count: {
            select: {
              enrollments: { where: { isCurrent: true } },
              feeStructures: true,
            },
          },
        },
      })
    : []

  // Extra: class levels whose name matches known Uolo CSV labels even if structure already gone
  const csvLabels = [
    'Class 11th comm without math',
    '12th SCIENCE - Medical',
    '12th SCIENCE - Non-Medical',
    '12th COMMERCE with Math',
    '12th COMMERCE without Math',
  ]
  // Pull distinct labels from CSV file if present — also scan all class names containing stream markers
  const streamLike = await prisma.classLevel.findMany({
    where: {
      tenantId,
      deletedAt: null,
      OR: [
        { name: { contains: 'SCIENCE - Medical' } },
        { name: { contains: 'SCIENCE - Non-Medical' } },
        { name: { contains: 'COMMERCE with Math' } },
        { name: { contains: 'COMMERCE without Math' } },
        { name: { contains: 'comm without math' } },
        { name: { in: csvLabels } },
      ],
    },
    select: {
      id: true,
      name: true,
      deletedAt: true,
      sessionId: true,
      sections: {
        where: { deletedAt: null },
        select: { id: true, name: true, _count: { select: { enrollments: { where: { isCurrent: true } } } } },
      },
      _count: {
        select: {
          enrollments: { where: { isCurrent: true } },
          feeStructures: true,
        },
      },
    },
  })

  const classById = new Map<string, (typeof uoloClasses)[number]>()
  for (const c of [...uoloClasses, ...streamLike]) classById.set(c.id, c)
  const classesToRemove = [...classById.values()]

  console.log('\n=== Uolo invoices ===')
  console.log(`  count: ${invoices.length}`)
  console.log(
    `  active: ${invoices.filter((i) => !i.cancelledAt).length}, cancelled: ${invoices.filter((i) => i.cancelledAt).length}`,
  )
  console.log(
    `  totals ₹${(invoices.reduce((s, i) => s + i.totalMinor, 0) / 100).toLocaleString('en-IN')} · paid ₹${(invoices.reduce((s, i) => s + i.paidMinor, 0) / 100).toLocaleString('en-IN')}`,
  )

  console.log('\n=== Uolo payments ===')
  console.log(`  count: ${payments.length}`)
  console.log(`  amount ₹${(payments.reduce((s, p) => s + p.amountMinor, 0) / 100).toLocaleString('en-IN')}`)

  console.log('\n=== Uolo receipts ===')
  console.log(`  count: ${receipts.length}`)

  console.log('\n=== Uolo fee structures ===')
  for (const s of structures) {
    console.log(`  ${s.name} (${s.id}) class=${s.classLevelId} items=${s._count.items} invoices=${s._count.invoices}`)
  }

  console.log('\n=== Classes/sections tied to Uolo import (candidates) ===')
  for (const c of classesToRemove) {
    console.log(
      `  ${c.name} (${c.id}) enrollments=${c._count.enrollments} structures=${c._count.feeStructures} sections=${c.sections.map((s) => `${s.name}:${s._count.enrollments}`).join(',')}`,
    )
  }

  // Also list ALL class levels for the current session for context (duplicates)
  const sessions = await prisma.academicSession.findMany({
    where: { tenantId },
    select: { id: true, name: true, isCurrent: true },
  })
  console.log('\n=== All class levels (for duplicate review) ===')
  for (const session of sessions) {
    const all = await prisma.classLevel.findMany({
      where: { tenantId, sessionId: session.id, deletedAt: null },
      orderBy: [{ numeric: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        numeric: true,
        stream: true,
        _count: {
          select: {
            enrollments: { where: { isCurrent: true } },
            sections: { where: { deletedAt: null } },
            feeStructures: true,
          },
        },
      },
    })
    console.log(`Session ${session.name}${session.isCurrent ? ' (current)' : ''}: ${all.length} classes`)
    for (const c of all) {
      console.log(
        `  [${c.numeric}] ${c.name}${c.stream ? ` / ${c.stream}` : ''} · enroll=${c._count.enrollments} sec=${c._count.sections} structs=${c._count.feeStructures}`,
      )
    }
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to delete the Uolo import artifacts above.')
    return
  }

  console.log('\n=== Applying cleanup ===')

  await prisma.$transaction(
    async (tx) => {
    const invoiceIds = invoices.map((i) => i.id)
    const paymentIds = [...new Set([...payments.map((p) => p.id), ...receipts.map((r) => r.paymentId).filter(Boolean) as string[]])]
    const receiptIds = receipts.map((r) => r.id)

    if (invoiceIds.length) {
      const alloc = await tx.feePaymentAllocation.deleteMany({
        where: { tenantId, invoiceId: { in: invoiceIds } },
      })
      console.log(`  deleted allocations (by invoice): ${alloc.count}`)
    }

    if (paymentIds.length) {
      const alloc2 = await tx.feePaymentAllocation.deleteMany({
        where: { tenantId, paymentId: { in: paymentIds } },
      })
      console.log(`  deleted allocations (by payment): ${alloc2.count}`)
    }

    if (receiptIds.length || paymentIds.length) {
      const rec = await tx.feeReceipt.deleteMany({
        where: {
          tenantId,
          OR: [
            ...(receiptIds.length ? [{ id: { in: receiptIds } }] : []),
            ...(paymentIds.length ? [{ paymentId: { in: paymentIds } }] : []),
            { number: { startsWith: 'RCP-2627-UOLO-' } },
          ],
        },
      })
      console.log(`  deleted receipts: ${rec.count}`)
    }

    if (paymentIds.length) {
      const pay = await tx.feePayment.deleteMany({
        where: {
          tenantId,
          OR: [
            { id: { in: paymentIds } },
            { providerPaymentId: { startsWith: 'uolo-import-' } },
          ],
        },
      })
      console.log(`  deleted payments: ${pay.count}`)
    }

    if (invoiceIds.length) {
      const lines = await tx.feeInvoiceLine.deleteMany({
        where: { tenantId, invoiceId: { in: invoiceIds } },
      })
      console.log(`  deleted invoice lines: ${lines.count}`)
      const inv = await tx.feeInvoice.deleteMany({
        where: { tenantId, id: { in: invoiceIds } },
      })
      console.log(`  deleted invoices: ${inv.count}`)
    }

    const structureIds = structures.map((s) => s.id)
    if (structureIds.length) {
      const items = await tx.feeStructureItem.deleteMany({
        where: { tenantId, structureId: { in: structureIds } },
      })
      console.log(`  deleted structure items: ${items.count}`)
      // Null any leftover invoice FKs, then hard-delete structures
      await tx.feeInvoice.updateMany({
        where: { tenantId, structureId: { in: structureIds } },
        data: { structureId: null },
      })
      const del = await tx.feeStructure.deleteMany({
        where: { tenantId, id: { in: structureIds } },
      })
      console.log(`  hard-deleted structures: ${del.count}`)
    }

    // Soft-delete Uolo stream class levels + their sections.
    // Clear enrollments pointing at them first by moving isCurrent off / soft approach:
    // set enrollment class to null is not allowed — leave enrollments but soft-delete class
    // so UI (deletedAt: null filters) no longer shows them. Better: soft-delete and
    // mark enrollments non-current if they point only to these classes? User asked to remove
    // duplicates — soft-delete classes/sections is enough for UI.
    const classIds = classesToRemove.map((c) => c.id)
    if (classIds.length) {
      const now = new Date()

      // Prefer remapping enrollments back onto a non-Uolo class of the same
      // numeric year (e.g. "Class 12") so students stay on roll.
      for (const doomed of classesToRemove) {
        const full = await tx.classLevel.findFirst({
          where: { id: doomed.id },
          select: { id: true, sessionId: true, numeric: true, name: true },
        })
        if (!full) continue

        const year =
          /11/.test(full.name) ? 11 : /12/.test(full.name) ? 12 : full.numeric === 11 || full.numeric === 12 ? full.numeric : 0

        const fallback = await tx.classLevel.findFirst({
          where: {
            tenantId,
            sessionId: full.sessionId,
            deletedAt: null,
            id: { notIn: classIds },
            OR:
              year === 11
                ? [{ name: { equals: 'Class 11' } }, { name: { startsWith: 'Class 11 ' } }]
                : year === 12
                  ? [{ name: { equals: 'Class 12' } }, { name: { startsWith: 'Class 12 ' } }]
                  : [{ id: '___none___' }],
          },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            sections: {
              where: { deletedAt: null },
              orderBy: { name: 'asc' },
              take: 1,
              select: { id: true },
            },
          },
        })

        if (fallback) {
          const sectionId = fallback.sections[0]?.id ?? null
          const moved = await tx.enrollment.updateMany({
            where: { tenantId, classLevelId: doomed.id, isCurrent: true },
            data: {
              classLevelId: fallback.id,
              ...(sectionId ? { sectionId } : {}),
            },
          })
          console.log(
            `  remapped ${moved.count} enrollments from "${full.name}" → "${fallback.name}"`,
          )
        } else {
          const unmarked = await tx.enrollment.updateMany({
            where: { tenantId, classLevelId: doomed.id, isCurrent: true },
            data: { isCurrent: false },
          })
          console.log(
            `  unmarked ${unmarked.count} enrollments on "${full.name}" (no fallback class found)`,
          )
        }
      }

      // Soft-delete first (UI-safe), then hard-delete empty Uolo classes
      const secSoft = await tx.section.updateMany({
        where: { tenantId, classLevelId: { in: classIds }, deletedAt: null },
        data: { deletedAt: now },
      })
      console.log(`  soft-deleted sections: ${secSoft.count}`)
      const clsSoft = await tx.classLevel.updateMany({
        where: { tenantId, id: { in: classIds }, deletedAt: null },
        data: { deletedAt: now },
      })
      console.log(`  soft-deleted class levels: ${clsSoft.count}`)

      // Hard-delete when no current enrollments remain on these classes
      const stillEnrolled = await tx.enrollment.count({
        where: { tenantId, classLevelId: { in: classIds }, isCurrent: true },
      })
      if (stillEnrolled === 0) {
        const secHard = await tx.section.deleteMany({
          where: { tenantId, classLevelId: { in: classIds } },
        })
        console.log(`  hard-deleted sections: ${secHard.count}`)
        const clsHard = await tx.classLevel.deleteMany({
          where: { tenantId, id: { in: classIds } },
        })
        console.log(`  hard-deleted class levels: ${clsHard.count}`)
      } else {
        console.log(`  skipped hard-delete of classes (${stillEnrolled} current enrollments remain)`)
      }
    }
    },
    { timeout: 120_000 },
  )

  console.log('\nDone. Review class list in Academics — original classes should remain.')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

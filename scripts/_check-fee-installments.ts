import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const byAdm = await db.student.findMany({
    where: {
      OR: [
        { admissionNo: { contains: '2026-017', mode: 'insensitive' } },
        { admissionNo: { contains: 'ADM-2026', mode: 'insensitive' } },
        {
          AND: [
            { firstName: { contains: 'Aaron', mode: 'insensitive' } },
            { lastName: { contains: 'Massey', mode: 'insensitive' } },
          ],
        },
      ],
    },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, tenantId: true },
  })
  console.log('matches', byAdm)

  const structures = await db.feeStructure.findMany({
    where: { deletedAt: null, status: 'PUBLISHED' },
    select: {
      id: true,
      name: true,
      tenantId: true,
      _count: { select: { installments: true, assignments: true } },
      items: { include: { feeHead: { select: { name: true } } } },
      installments: {
        select: { lines: { include: { feeHead: { select: { name: true } } } } },
      },
    },
  })
  console.log('--- structures with >12 installments or >12 tuition lines ---')
  for (const s of structures) {
    const tuitionTotal = s.installments.reduce(
      (sum, inst) =>
        sum + inst.lines.filter((l) => /tuition/i.test(l.feeHead.name)).length,
      0,
    )
    if (tuitionTotal > 12 || s._count.installments > 12) {
      console.log({
        name: s.name,
        installments: s._count.installments,
        tuitionLines: tuitionTotal,
        assignments: s._count.assignments,
        items: s.items.map((i) => `${i.feeHead.name}:${i.amountMinor}`),
      })
    }
  }

  const tuitionHeads = await db.feeHead.findMany({
    where: { name: { contains: 'Tuition', mode: 'insensitive' }, deletedAt: null },
    select: { id: true, name: true, tenantId: true },
  })
  console.log('tuitionHeads', tuitionHeads)

  for (const head of tuitionHeads) {
    const rows = await db.$queryRaw<
      {
        id: string
        admissionNo: string
        firstName: string
        lastName: string
        invoice_count: number
      }[]
    >`
      SELECT st.id, st."admissionNo", st."firstName", st."lastName",
             COUNT(DISTINCT fi.id)::int AS invoice_count
      FROM "Student" st
      JOIN "FeeInvoice" fi ON fi."studentId" = st.id AND fi.status <> 'CANCELLED'
      JOIN "FeeInvoiceLine" fil ON fil."invoiceId" = fi.id AND fil."feeHeadId" = ${head.id}
      WHERE st."tenantId" = ${head.tenantId} AND st."deletedAt" IS NULL
      GROUP BY st.id
      HAVING COUNT(DISTINCT fi.id) > 12
      ORDER BY invoice_count DESC
    `
    console.log('head', head.name, 'students_gt_12_tuition_invoices', rows.length)
    console.log(JSON.stringify(rows, null, 2))
  }

  for (const s of byAdm) {
    const inv = await db.feeInvoice.count({
      where: { studentId: s.id, status: { not: 'CANCELLED' } },
    })
    const asg = await db.studentFeeAssignment.findMany({
      where: { studentId: s.id },
      select: {
        status: true,
        structure: {
          select: {
            name: true,
            _count: { select: { installments: true } },
            items: { include: { feeHead: { select: { name: true } } } },
          },
        },
      },
    })
    console.log({
      admissionNo: s.admissionNo,
      invoices: inv,
      assignments: asg.map((a) => ({
        status: a.status,
        structure: a.structure.name,
        installments: a.structure._count.installments,
        items: a.structure.items.map((i) => `${i.feeHead.name}:${i.amountMinor}`),
      })),
    })
  }

  // Students with multiple ACTIVE assignments (any tenant)
  const multi = await db.$queryRaw<
    { tenantId: string; count: number }[]
  >`
    SELECT s."tenantId", COUNT(*)::int AS count
    FROM (
      SELECT st.id, st."tenantId"
      FROM "Student" st
      JOIN "StudentFeeAssignment" sfa ON sfa."studentId" = st.id AND sfa.status = 'ACTIVE'
      WHERE st."deletedAt" IS NULL
      GROUP BY st.id, st."tenantId"
      HAVING COUNT(DISTINCT sfa.id) > 1
    ) s
    GROUP BY s."tenantId"
  `
  console.log('tenants_with_multi_assignment_students', multi)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })

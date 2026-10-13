import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const aarons = await db.student.findMany({
    where: {
      OR: [
        { admissionNo: 'ADM-2026-017' },
        { admissionNo: 'APG2026/13' },
        {
          AND: [
            { firstName: { equals: 'Aaron', mode: 'insensitive' } },
            { lastName: { contains: 'Massey', mode: 'insensitive' } },
          ],
        },
      ],
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      tenantId: true,
      feeAssignments: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          status: true,
          structure: {
            select: {
              id: true,
              name: true,
              classLevelId: true,
              status: true,
              items: { include: { feeHead: { select: { name: true } } } },
              installments: {
                orderBy: { dueOn: 'asc' },
                select: {
                  dueOn: true,
                  lines: { include: { feeHead: { select: { id: true, name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  })

  for (const s of aarons) {
    console.log('===', s.admissionNo, s.firstName, s.lastName, s.id, 'tenant', s.tenantId)
    console.log('active_assignments', s.feeAssignments.length)
    for (const a of s.feeAssignments) {
      const tuition = a.structure.installments.flatMap((i) =>
        i.lines
          .filter((l) => /tuition/i.test(l.feeHead.name))
          .map((l) => ({
            due: i.dueOn.toISOString().slice(0, 10),
            amt: l.amountMinor,
            head: l.feeHead.name,
          })),
      )
      console.log({
        structure: a.structure.name,
        classLevelId: a.structure.classLevelId,
        installments: a.structure.installments.length,
        items: a.structure.items.map((i) => `${i.feeHead.name}:${i.amountMinor}`),
        tuitionLines: tuition.length,
        tuitionSample: tuition.slice(0, 4),
        tuitionAnnual: tuition.reduce((sum, t) => sum + t.amt, 0),
      })
    }
  }

  const rows = await db.$queryRaw<
    {
      student_id: string
      admissionNo: string
      firstName: string
      lastName: string
      tenantId: string
      tenant_name: string
      tuition_installment_lines: number
      distinct_months: number
      active_assignments: number
      tuition_annual_minor: bigint
    }[]
  >`
    SELECT st.id AS student_id,
           st."admissionNo",
           st."firstName",
           st."lastName",
           st."tenantId",
           t.name AS tenant_name,
           COUNT(*)::int AS tuition_installment_lines,
           COUNT(DISTINCT date_trunc('month', fi."dueOn"))::int AS distinct_months,
           COUNT(DISTINCT sfa.id)::int AS active_assignments,
           SUM(fil."amountMinor")::bigint AS tuition_annual_minor
    FROM "Student" st
    JOIN "Tenant" t ON t.id = st."tenantId"
    JOIN "StudentFeeAssignment" sfa ON sfa."studentId" = st.id AND sfa.status = 'ACTIVE'
    JOIN "FeeStructure" fs ON fs.id = sfa."structureId" AND fs."deletedAt" IS NULL
    JOIN "FeeInstallment" fi ON fi."structureId" = fs.id
    JOIN "FeeInstallmentLine" fil ON fil."installmentId" = fi.id
    JOIN "FeeHead" fh ON fh.id = fil."feeHeadId" AND fh.name ILIKE '%tuition%'
    WHERE st."deletedAt" IS NULL
    GROUP BY st.id, st."admissionNo", st."firstName", st."lastName", st."tenantId", t.name
    HAVING COUNT(*) > 12
    ORDER BY tuition_installment_lines DESC, st."admissionNo"
  `

  console.log('--- students with >12 tuition installment lines across ACTIVE assignments ---')
  console.log('count', rows.length)
  const byTenant: Record<string, number> = {}
  for (const r of rows) {
    byTenant[r.tenant_name] = (byTenant[r.tenant_name] || 0) + 1
  }
  console.log('byTenant', byTenant)
  const with24 = rows.filter((r) => r.tuition_installment_lines >= 24)
  console.log('students_with_gte_24_tuition_lines', with24.length)
  console.log(
    JSON.stringify(
      with24.slice(0, 40),
      (_k, v) => (typeof v === 'bigint' ? Number(v) : v),
      2,
    ),
  )
  const aaronIn = rows.filter((r) =>
    /aaron|017|APG2026/i.test(`${r.admissionNo}${r.firstName}${r.lastName}`),
  )
  console.log('aaron_in_list', aaronIn)

  const dual = await db.$queryRaw<
    {
      admissionNo: string
      firstName: string
      lastName: string
      tenant_name: string
      head: string
      structures_with_head: number
      total_installment_lines: number
    }[]
  >`
    SELECT st."admissionNo", st."firstName", st."lastName", t.name AS tenant_name,
           fh.name AS head,
           COUNT(DISTINCT sfa.id)::int AS structures_with_head,
           SUM(
             (SELECT COUNT(*) FROM "FeeInstallment" fi
              JOIN "FeeInstallmentLine" fil ON fil."installmentId" = fi.id AND fil."feeHeadId" = fh.id
              WHERE fi."structureId" = fs.id)
           )::int AS total_installment_lines
    FROM "Student" st
    JOIN "Tenant" t ON t.id = st."tenantId"
    JOIN "StudentFeeAssignment" sfa ON sfa."studentId" = st.id AND sfa.status = 'ACTIVE'
    JOIN "FeeStructure" fs ON fs.id = sfa."structureId" AND fs."deletedAt" IS NULL
    JOIN "FeeStructureItem" fsi ON fsi."structureId" = fs.id
    JOIN "FeeHead" fh ON fh.id = fsi."feeHeadId" AND fh.name ILIKE '%tuition%'
    WHERE st."deletedAt" IS NULL
    GROUP BY st.id, st."admissionNo", st."firstName", st."lastName", t.name, fh.id, fh.name
    HAVING COUNT(DISTINCT sfa.id) > 1
    ORDER BY total_installment_lines DESC
  `

  console.log('--- students with Tuition head on 2+ ACTIVE assignments ---')
  console.log('count', dual.length)
  console.log(JSON.stringify(dual.slice(0, 50), null, 2))
  const dual24 = dual.filter((r) => r.total_installment_lines >= 24)
  console.log('dual_with_gte_24_lines', dual24.length)

  // Breakdown of installment line counts
  const buckets: Record<string, number> = {}
  for (const r of rows) {
    const k = String(r.tuition_installment_lines)
    buckets[k] = (buckets[k] || 0) + 1
  }
  console.log('line_count_buckets', buckets)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })

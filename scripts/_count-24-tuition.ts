import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function countForTenant(tenantId: string, label: string) {
  const students = await db.student.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      feeAssignments: {
        where: { status: 'ACTIVE' },
        select: {
          structure: {
            select: {
              name: true,
              items: {
                select: {
                  feeHead: { select: { name: true } },
                  amountMinor: true,
                },
              },
              installments: {
                select: {
                  lines: {
                    select: {
                      amountMinor: true,
                      feeHead: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  let gt12 = 0
  let gte24 = 0
  const affected: {
    admissionNo: string
    name: string
    tuitionLines: number
    annualMinor: number
    structures: string[]
  }[] = []

  for (const s of students) {
    const tuitionLines = s.feeAssignments.flatMap((a) =>
      a.structure.installments.flatMap((i) =>
        i.lines.filter((l) => /tuition/i.test(l.feeHead.name)),
      ),
    )
    if (tuitionLines.length <= 12) continue
    gt12++
    if (tuitionLines.length >= 24) gte24++
    const structures = [
      ...new Set(
        s.feeAssignments
          .filter((a) =>
            a.structure.items.some((i) => /tuition/i.test(i.feeHead.name)),
          )
          .map((a) => a.structure.name),
      ),
    ]
    affected.push({
      admissionNo: s.admissionNo,
      name: `${s.firstName} ${s.lastName}`.trim(),
      tuitionLines: tuitionLines.length,
      annualMinor: tuitionLines.reduce((sum, l) => sum + l.amountMinor, 0),
      structures,
    })
  }

  console.log(`=== ${label} (${tenantId}) ===`)
  console.log({
    students: students.length,
    showing_gt_12_tuition_installments: gt12,
    showing_gte_24_tuition_installments: gte24,
  })
  console.log(JSON.stringify(affected, null, 2))
  return affected
}

async function main() {
  // Demo / seed tenant where Aaron ADM-2026-017 has the duplicate plans
  await countForTenant('cmtrdyu1100udpf0f11bq6g29', 'demo-tenant')
  // Live school tenant
  await countForTenant('cmt204gfm002nnu0f22tm2f6t', 'main-school')

  // Confirm Aaron detail
  const aaron = await db.student.findFirst({
    where: {
      id: 'cmtre0rij0123pf0fuupvzyl5',
    },
    select: {
      admissionNo: true,
      firstName: true,
      lastName: true,
      feeAssignments: {
        where: { status: 'ACTIVE' },
        select: {
          structure: {
            select: {
              name: true,
              items: {
                select: {
                  amountMinor: true,
                  feeHead: { select: { name: true } },
                },
              },
              installments: {
                orderBy: { dueOn: 'asc' },
                select: {
                  dueOn: true,
                  lines: {
                    select: {
                      amountMinor: true,
                      feeHead: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  if (aaron) {
    const tuition = aaron.feeAssignments.flatMap((a) =>
      a.structure.installments.flatMap((i) =>
        i.lines
          .filter((l) => /tuition/i.test(l.feeHead.name))
          .map((l) => ({
            structure: a.structure.name,
            due: i.dueOn.toISOString().slice(0, 10),
            amt: l.amountMinor,
          })),
      ),
    )
    console.log('=== Aaron demo detail ===')
    console.log({
      admissionNo: aaron.admissionNo,
      name: `${aaron.firstName} ${aaron.lastName}`,
      tuitionInstallmentsMerged: tuition.length,
      annualMinorMerged: tuition.reduce((s, t) => s + t.amt, 0),
      duplicateMonths: tuition
        .map((t) => t.due)
        .filter((d, i, arr) => arr.indexOf(d) !== i)
        .slice(0, 6),
    })
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })

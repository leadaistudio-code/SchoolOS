/**
 * Deactivate redundant "Monthly Tuition Fee" assignments when the same student
 * already has an ACTIVE "Session 2026-27" (or any other) plan that includes Tuition.
 *
 * Usage:
 *   npx tsx scripts/_fix-dup-tuition-plans.ts           # dry-run
 *   npx tsx scripts/_fix-dup-tuition-plans.ts --apply   # write
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const students = await db.student.findMany({
    where: { deletedAt: null },
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
          structure: {
            select: {
              id: true,
              name: true,
              items: {
                select: {
                  feeHeadId: true,
                  feeHead: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  type Fix = {
    studentId: string
    admissionNo: string
    name: string
    tenantId: string
    keep: string[]
    deactivate: { id: string; name: string }[]
  }

  const fixes: Fix[] = []

  for (const student of students) {
    const tuitionAssignments = student.feeAssignments.filter((a) =>
      a.structure.items.some((i) => /tuition/i.test(i.feeHead.name)),
    )
    if (tuitionAssignments.length < 2) continue

    // Prefer the broader session/class plan over a tuition-only monthly plan.
    const ranked = [...tuitionAssignments].sort((a, b) => {
      const score = (name: string) => {
        if (/session/i.test(name)) return 0
        if (/monthly tuition/i.test(name)) return 2
        return 1
      }
      const byName = score(a.structure.name) - score(b.structure.name)
      if (byName !== 0) return byName
      // Prefer the plan with more fee heads (more complete).
      return b.structure.items.length - a.structure.items.length
    })

    const keep = ranked[0]!
    const deactivate = ranked.slice(1).map((a) => ({
      id: a.id,
      name: a.structure.name,
    }))

    fixes.push({
      studentId: student.id,
      admissionNo: student.admissionNo,
      name: `${student.firstName} ${student.lastName}`.trim(),
      tenantId: student.tenantId,
      keep: [keep.structure.name],
      deactivate,
    })
  }

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    studentsAffected: fixes.length,
    assignmentsToDeactivate: fixes.reduce((n, f) => n + f.deactivate.length, 0),
  })
  console.log(JSON.stringify(fixes.slice(0, 15), null, 2))
  if (fixes.length > 15) console.log(`... and ${fixes.length - 15} more`)

  if (!apply) {
    console.log('Re-run with --apply to deactivate redundant tuition plans.')
    return
  }

  const ids = fixes.flatMap((f) => f.deactivate.map((d) => d.id))
  if (ids.length === 0) {
    console.log('Nothing to update.')
    return
  }

  const result = await db.studentFeeAssignment.updateMany({
    where: { id: { in: ids }, status: 'ACTIVE' },
    data: { status: 'ENDED', endedAt: new Date() },
  })
  console.log({ deactivated: result.count })

  // Verify
  let remaining = 0
  const after = await db.student.findMany({
    where: { deletedAt: null, id: { in: fixes.map((f) => f.studentId) } },
    select: {
      admissionNo: true,
      feeAssignments: {
        where: { status: 'ACTIVE' },
        select: {
          structure: {
            select: {
              name: true,
              items: { select: { feeHead: { select: { name: true } } } },
            },
          },
        },
      },
    },
  })
  for (const s of after) {
    const tuition = s.feeAssignments.filter((a) =>
      a.structure.items.some((i) => /tuition/i.test(i.feeHead.name)),
    )
    if (tuition.length > 1) {
      remaining++
      console.log('STILL_DUP', s.admissionNo, tuition.map((a) => a.structure.name))
    }
  }
  console.log({ remainingDupTuitionPlans: remaining })
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })

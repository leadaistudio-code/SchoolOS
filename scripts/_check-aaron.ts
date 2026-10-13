import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const student = await db.student.findFirst({
    where: { admissionNo: 'ADM-2026-017' },
    include: {
      enrollments: {
        where: { isCurrent: true },
        include: { classLevel: true, section: true, session: true },
      },
      feeAssignments: {
        include: {
          structure: {
            include: {
              items: { include: { feeHead: true } },
              installments: {
                include: { lines: { include: { feeHead: true } } },
                orderBy: { dueOn: 'asc' },
              },
            },
          },
        },
      },
    },
  })
  if (!student) {
    console.log('not found')
    return
  }
  console.log({
    id: student.id,
    name: `${student.firstName} ${student.lastName}`,
    admissionNo: student.admissionNo,
    class: student.enrollments[0]
      ? `${student.enrollments[0].classLevel.name}-${student.enrollments[0].section.name}`
      : null,
    sessionId: student.enrollments[0]?.sessionId,
  })

  console.log('assignments_all_statuses', student.feeAssignments.length)
  for (const a of student.feeAssignments) {
    const tuition = a.structure.installments.flatMap((i) =>
      i.lines.filter((l) => /tuition/i.test(l.feeHead.name)),
    )
    console.log({
      status: a.status,
      structure: a.structure.name,
      structureStatus: a.structure.status,
      deletedAt: a.structure.deletedAt,
      installments: a.structure.installments.length,
      tuitionLines: tuition.length,
      tuitionDueOns: tuition.map((l) => {
        const inst = a.structure.installments.find((i) => i.lines.some((x) => x.id === l.id))
        return inst?.dueOn.toISOString().slice(0, 10)
      }),
      items: a.structure.items.map((i) => `${i.feeHead.name}:${i.amountMinor}`),
    })
  }

  const invoices = await db.feeInvoice.findMany({
    where: { studentId: student.id },
    include: { lines: { include: { feeHead: true } } },
    orderBy: { dueOn: 'asc' },
  })
  console.log('invoices_all', invoices.length)
  console.log(
    invoices.map((i) => ({
      number: i.number,
      status: i.status,
      title: i.title,
      dueOn: i.dueOn.toISOString().slice(0, 10),
      total: i.totalMinor,
      paid: i.paidMinor,
      lines: i.lines.map((l) => `${l.feeHead?.name ?? l.label}:${l.amountMinor}`),
    })),
  )

  // Class structures for this student's class
  const classId = student.enrollments[0]?.classLevelId
  if (classId) {
    const structures = await db.feeStructure.findMany({
      where: {
        classLevelId: classId,
        deletedAt: null,
        sessionId: student.enrollments[0]!.sessionId,
      },
      include: {
        items: { include: { feeHead: true } },
        installments: {
          include: { lines: { include: { feeHead: true } } },
        },
        _count: { select: { assignments: true } },
      },
    })
    console.log('class_structures', structures.length)
    for (const s of structures) {
      const tuitionLines = s.installments.flatMap((i) =>
        i.lines.filter((l) => /tuition/i.test(l.feeHead.name)),
      )
      console.log({
        name: s.name,
        status: s.status,
        installments: s.installments.length,
        tuitionLines: tuitionLines.length,
        assignments: s._count.assignments,
        items: s.items.map((i) => `${i.feeHead.name}:${i.amountMinor}`),
        tuitionByMonth: s.installments.map((i) => ({
          due: i.dueOn.toISOString().slice(0, 10),
          tuition: i.lines
            .filter((l) => /tuition/i.test(l.feeHead.name))
            .map((l) => l.amountMinor),
        })),
      })
    }
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

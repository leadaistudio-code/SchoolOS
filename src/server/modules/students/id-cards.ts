import type { AppContext } from '@/server/context'
import { conflict, notFound } from '@/server/api/response'
import { currentSession } from '@/server/modules/academics/service'

export async function studentIdCardSetup(ctx: AppContext) {
  ctx.require('students.id_cards')
  const session = await currentSession(ctx)
  const classes = await ctx.db.classLevel.findMany({
    where: { sessionId: session.id, deletedAt: null },
    orderBy: { numeric: 'asc' },
    select: {
      id: true,
      name: true,
      sections: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      },
    },
  })
  return { session, classes }
}

export async function getStudentIdCards(
  ctx: AppContext,
  classLevelId: string,
  sectionId?: string,
) {
  ctx.require('students.id_cards')
  const setup = await studentIdCardSetup(ctx)
  const classLevel = setup.classes.find((item) => item.id === classLevelId)
  if (!classLevel) throw notFound('Class')
  if (sectionId && !classLevel.sections.some((section) => section.id === sectionId)) {
    throw conflict('The selected section does not belong to this class')
  }

  const [enrollments, school] = await Promise.all([
    ctx.db.enrollment.findMany({
      where: {
        sessionId: setup.session.id,
        classLevelId,
        isCurrent: true,
        ...(sectionId ? { sectionId } : {}),
        student: { deletedAt: null, status: 'ACTIVE' },
      },
      orderBy: [
        { section: { name: 'asc' } },
        { rollNumber: 'asc' },
        { student: { firstName: 'asc' } },
      ],
      select: {
        rollNumber: true,
        classLevel: { select: { name: true } },
        section: { select: { name: true } },
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            dateOfBirth: true,
            bloodGroup: true,
            addressLine1: true,
            city: true,
            emergencyContactPhone: true,
            guardians: {
              where: { isPrimary: true },
              take: 1,
              select: {
                parent: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    ctx.db.school.findFirst({
      where: { tenantId: ctx.tenant.id },
      select: {
        name: true,
        code: true,
        branding: { select: { logoUrl: true } },
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        phone: true,
        email: true,
        website: true,
      },
    }),
  ])

  return {
    setup,
    classLevel,
    selectedSection: classLevel.sections.find((section) => section.id === sectionId) ?? null,
    school,
    cards: enrollments.map((enrollment) => ({
      ...enrollment.student,
      className: enrollment.classLevel.name,
      sectionName: enrollment.section.name,
      rollNumber: enrollment.rollNumber,
      guardian: enrollment.student.guardians[0]?.parent ?? null,
    })),
  }
}

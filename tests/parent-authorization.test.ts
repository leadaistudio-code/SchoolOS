import { describe, expect, it } from 'vitest'
import { ROLE } from '../src/lib/rbac/roles'
import { listCertificates } from '../src/server/modules/certificates/service'
import { getEvent } from '../src/server/modules/events/service'
import { submitHomework } from '../src/server/modules/homework/service'
import { listStudentFeedback } from '../src/server/modules/students/performance'

function parentUser() {
  return {
    userId: 'parent-user',
    firstName: 'Parent',
    lastName: 'One',
    roleKeys: [ROLE.PARENT],
  }
}

describe('parent child-only query boundaries', () => {
  it('scopes the certificate register to linked children', async () => {
    let where: Record<string, unknown> | undefined
    const ctx = {
      user: parentUser(),
      tenant: { id: 'tenant-1' },
      require: () => undefined,
      db: {
        parent: {
          findFirst: async () => ({ children: [{ studentId: 'child-1' }] }),
        },
        certificate: {
          findMany: async (args: { where: Record<string, unknown> }) => {
            where = args.where
            return []
          },
        },
      },
    }

    await listCertificates(ctx as never)
    expect(where).toMatchObject({ studentId: { in: ['child-1'] } })
  })

  it('requests only linked-child participants on event detail', async () => {
    let participantWhere: Record<string, unknown> | undefined
    const ctx = {
      user: parentUser(),
      require: () => undefined,
      db: {
        parent: {
          findFirst: async () => ({ children: [{ studentId: 'child-1' }] }),
        },
        schoolEvent: {
          findFirst: async (args: {
            include: { participants: { where?: Record<string, unknown> } }
          }) => {
            participantWhere = args.include.participants.where
            return { id: 'event-1', participants: [] }
          },
        },
      },
    }

    await getEvent(ctx as never, 'event-1')
    expect(participantWhere).toEqual({ studentId: { in: ['child-1'] } })
  })

  it('limits feedback to parent-visible labels', async () => {
    let feedbackWhere: Record<string, unknown> | undefined
    const ctx = {
      user: parentUser(),
      require: () => undefined,
      db: {
        parent: {
          findFirst: async () => ({ children: [{ studentId: 'child-1' }] }),
        },
        teacherStudentFeedback: {
          findMany: async (args: { where: Record<string, unknown> }) => {
            feedbackWhere = args.where
            return []
          },
        },
        subject: { findMany: async () => [] },
      },
    }

    await listStudentFeedback(ctx as never, 'child-1')
    expect(feedbackWhere).toMatchObject({
      visibility: { in: ['PARENT', 'STUDENT_AND_PARENT'] },
    })
  })

  it('includes the homework section in enrollment validation', async () => {
    let enrollmentWhere: Record<string, unknown> | undefined
    const ctx = {
      user: parentUser(),
      require: () => undefined,
      db: {
        parent: {
          findFirst: async () => ({ children: [{ studentId: 'child-1' }] }),
        },
        homework: {
          findFirst: async () => ({
            id: 'homework-1',
            title: 'Section work',
            dueOn: new Date(),
            classLevelId: 'class-1',
            sectionId: 'section-a',
          }),
        },
        enrollment: {
          findFirst: async (args: { where: Record<string, unknown> }) => {
            enrollmentWhere = args.where
            return null
          },
        },
      },
    }

    await expect(submitHomework(ctx as never, {
      homeworkId: 'homework-1',
      studentId: 'child-1',
    })).rejects.toThrow('not in the class')
    expect(enrollmentWhere).toMatchObject({
      studentId: 'child-1',
      classLevelId: 'class-1',
      sectionId: 'section-a',
    })
  })
})

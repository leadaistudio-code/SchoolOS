import { describe, expect, it } from 'vitest'
import { accessibleStudentIds, isPortalOnlyRole, isTeacherOnlyRole } from '../src/server/scope'
import { isSelfScoped, isTeacherScoped, ROLE, SYSTEM_ROLES } from '../src/lib/rbac/roles'

describe('identity scopes survive custom permissions', () => {
  it('keeps a parent child-scoped when a custom role is added', () => {
    const roles = [ROLE.PARENT, 'FEEDBACK_SUBMITTER']
    expect(isPortalOnlyRole(roles)).toBe(true)
    expect(isSelfScoped(roles)).toBe(true)
  })

  it('keeps a student self-scoped when a custom role is added', () => {
    const roles = [ROLE.STUDENT, 'CLUB_MEMBER']
    expect(isPortalOnlyRole(roles)).toBe(true)
    expect(isSelfScoped(roles)).toBe(true)
  })

  it('keeps a teacher assignment-scoped when a custom role is added', () => {
    const roles = [ROLE.TEACHER, 'FEEDBACK_VIEWER']
    expect(isTeacherOnlyRole(roles)).toBe(true)
    expect(isTeacherScoped(roles)).toBe(true)
  })

  it('allows only explicit leadership roles to override portal scope', () => {
    for (const elevated of [ROLE.SCHOOL_ADMIN, ROLE.PRINCIPAL, ROLE.SUPER_ADMIN]) {
      expect(isPortalOnlyRole([ROLE.PARENT, elevated])).toBe(false)
      expect(isSelfScoped([ROLE.PARENT, elevated])).toBe(false)
    }
  })

  it('resolves only linked children for a parent with an additional custom role', async () => {
    const ctx = {
      user: { userId: 'parent-user', roleKeys: [ROLE.PARENT, 'FEEDBACK_SUBMITTER'] },
      db: {
        parent: {
          findFirst: async () => ({
            children: [{ studentId: 'child-1' }, { studentId: 'child-2' }],
          }),
        },
      },
    }
    await expect(accessibleStudentIds(ctx as never)).resolves.toEqual(['child-1', 'child-2'])
  })

  it('does not grant school-wide student access to a custom role alone', async () => {
    const ctx = {
      user: { userId: 'custom-user', roleKeys: ['CUSTOM_STUDENT_VIEWER'] },
      db: {},
    }
    await expect(accessibleStudentIds(ctx as never)).resolves.toEqual([])
  })
})

describe('teacher student scope is section-aware', () => {
  function teacherCtx(db: Record<string, unknown>) {
    return {
      user: { userId: 'teacher-user', roleKeys: [ROLE.TEACHER] },
      db: {
        staff: {
          findFirst: async () => ({ id: 'staff-1' }),
        },
        academicSession: {
          findFirst: async () => ({ id: 'session-1' }),
        },
        ...db,
      },
    }
  }

  it('returns no students when the teacher has no section assignments', async () => {
    const ctx = teacherCtx({
      section: { findMany: async () => [] },
      classSubject: { findMany: async () => [] },
      enrollment: { findMany: async () => [{ studentId: 'should-not-appear' }] },
    })
    await expect(accessibleStudentIds(ctx as never)).resolves.toEqual([])
  })

  it('scopes students to assigned sections only, not the whole class', async () => {
    const ctx = teacherCtx({
      section: {
        findMany: async (args: { where?: { classTeacherId?: string; id?: { in: string[] } } }) => {
          if (args.where?.classTeacherId) return [{ id: 'sec-a' }]
          if (args.where?.id?.in) {
            return args.where.id.in.map((id: string) => ({
              id,
              classLevelId: 'class-10',
            }))
          }
          return []
        },
      },
      classSubject: {
        findMany: async () => [
          {
            sections: [{ sectionId: 'sec-b' }],
            classLevel: {
              sessionId: 'session-1',
              deletedAt: null,
              sections: [{ id: 'sec-a' }, { id: 'sec-b' }, { id: 'sec-c' }],
            },
          },
        ],
      },
      enrollment: {
        findMany: async (args: { where: { sectionId: { in: string[] } } }) => {
          const ids = args.where.sectionId.in
          expect(ids.sort()).toEqual(['sec-a', 'sec-b'])
          expect(ids).not.toContain('sec-c')
          return [{ studentId: 'stu-a' }, { studentId: 'stu-b' }, { studentId: 'stu-a' }]
        },
      },
    })
    await expect(accessibleStudentIds(ctx as never)).resolves.toEqual(['stu-a', 'stu-b'])
  })

  it('treats a class-subject with no section mappings as all sections of that class', async () => {
    const ctx = teacherCtx({
      section: { findMany: async () => [] },
      classSubject: {
        findMany: async () => [
          {
            sections: [],
            classLevel: {
              sessionId: 'session-1',
              deletedAt: null,
              sections: [{ id: 'sec-a' }, { id: 'sec-b' }],
            },
          },
        ],
      },
      enrollment: {
        findMany: async (args: { where: { sectionId: { in: string[] } } }) => {
          expect(args.where.sectionId.in.sort()).toEqual(['sec-a', 'sec-b'])
          return [{ studentId: 'stu-1' }]
        },
      },
    })
    await expect(accessibleStudentIds(ctx as never)).resolves.toEqual(['stu-1'])
  })
})

describe('feedback defaults', () => {
  it('lets students submit feedback by default', () => {
    const student = SYSTEM_ROLES.find((role) => role.key === ROLE.STUDENT)!
    expect(student.permissions).toEqual(expect.arrayContaining([
      'feedback.view',
      'feedback.submit',
      'feedback.student_submit',
    ]))
  })

  it('lets teachers see only their own feedback by default', () => {
    const teacher = SYSTEM_ROLES.find((role) => role.key === ROLE.TEACHER)!
    expect(teacher.permissions).toEqual(expect.arrayContaining([
      'feedback.view',
      'feedback.teacher_view_own',
    ]))
  })
})

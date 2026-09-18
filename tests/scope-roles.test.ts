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

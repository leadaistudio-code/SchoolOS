import { describe, expect, it } from 'vitest'
import { finaliseSchema, markSchema } from '../src/server/modules/assessments/evaluation'
import { PERMISSIONS } from '../src/lib/rbac/permissions'
import { SYSTEM_ROLES, ROLE } from '../src/lib/rbac/roles'

describe('marking validation', () => {
  it('accepts a mark with a comment', () => {
    expect(markSchema.safeParse({ marksAwarded: 3, teacherComment: 'Missed the third point.' }).success).toBe(
      true,
    )
  })

  it('accepts a zero', () => {
    expect(markSchema.safeParse({ marksAwarded: 0 }).success).toBe(true)
  })

  it('accepts half marks', () => {
    expect(markSchema.safeParse({ marksAwarded: 2.5 }).success).toBe(true)
  })

  it('rejects a negative mark', () => {
    expect(markSchema.safeParse({ marksAwarded: -1 }).success).toBe(false)
  })

  it('rejects a mark with no number at all', () => {
    expect(markSchema.safeParse({ teacherComment: 'Good' }).success).toBe(false)
  })

  it('lets the overall comment be left out', () => {
    expect(finaliseSchema.safeParse({}).success).toBe(true)
    expect(finaliseSchema.safeParse({ teacherComment: null }).success).toBe(true)
  })
})

describe('evaluation permissions', () => {
  const keys = PERMISSIONS.map((p) => p.key)

  it('separates marking from releasing', () => {
    // Two permissions because they are two decisions: a coordinator may mark
    // without being the person who decides a class sees its results.
    expect(keys).toContain('assessments.evaluate')
    expect(keys).toContain('assessments.publish')
  })

  it('gives teachers both', () => {
    const teacher = SYSTEM_ROLES.find((r) => r.key === ROLE.TEACHER)
    expect(teacher?.permissions).toContain('assessments.evaluate')
    expect(teacher?.permissions).toContain('assessments.publish')
  })

  it('gives students neither', () => {
    const student = SYSTEM_ROLES.find((r) => r.key === ROLE.STUDENT)
    expect(student?.permissions).not.toContain('assessments.evaluate')
    expect(student?.permissions).not.toContain('assessments.publish')
  })

  it('gives parents neither', () => {
    const parent = SYSTEM_ROLES.find((r) => r.key === ROLE.PARENT)
    expect(parent?.permissions).not.toContain('assessments.evaluate')
    expect(parent?.permissions).not.toContain('assessments.publish')
  })
})

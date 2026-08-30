import { describe, expect, it } from 'vitest'
import { PERMISSIONS, PERMISSION_KEYS, isValidPermission } from '../src/lib/rbac/permissions'
import { ROLE, SYSTEM_ROLES, isSelfScoped, isTeacherScoped } from '../src/lib/rbac/roles'

describe('permission catalogue', () => {
  it('has no duplicate keys', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length)
  })

  it('keys are always module.action', () => {
    for (const p of PERMISSIONS) {
      expect(p.key).toBe(`${p.module}.${p.action}`)
      expect(p.key).toMatch(/^[a-z_]+\.[a-z_]+$/)
    }
  })

  it('rejects an unknown permission', () => {
    expect(isValidPermission('students.view')).toBe(true)
    expect(isValidPermission('students.exfiltrate')).toBe(false)
  })
})

describe('system roles', () => {
  it('every granted permission exists in the catalogue', () => {
    for (const role of SYSTEM_ROLES) {
      for (const key of role.permissions) {
        expect(isValidPermission(key), `${role.key} grants unknown permission ${key}`).toBe(true)
      }
    }
  })

  it('only the platform role holds platform permissions', () => {
    for (const role of SYSTEM_ROLES) {
      const platformPerms = role.permissions.filter((k) => k.startsWith('platform.'))
      if (role.key === ROLE.SUPER_ADMIN) {
        expect(platformPerms.length).toBeGreaterThan(0)
      } else {
        expect(platformPerms, `${role.key} must not hold platform permissions`).toEqual([])
      }
    }
  })

  it('school admin holds every tenant permission and no platform permission', () => {
    const admin = SYSTEM_ROLES.find((r) => r.key === ROLE.SCHOOL_ADMIN)!
    const tenantKeys = PERMISSION_KEYS.filter((k) => !k.startsWith('platform.'))

    expect(new Set(admin.permissions)).toEqual(new Set(tenantKeys))
  })

  it('parents and students cannot reach money, staff or settings', () => {
    const forbiddenPrefixes = [
      'fees.collect',
      'fees.refund',
      'fees.structure',
      'staff.',
      'settings.',
      'users.',
      'roles.',
      'audit.',
      'admissions.',
      'inventory.',
    ]

    for (const key of [ROLE.PARENT, ROLE.STUDENT]) {
      const role = SYSTEM_ROLES.find((r) => r.key === key)!
      for (const prefix of forbiddenPrefixes) {
        const offending = role.permissions.filter((p) => p.startsWith(prefix))
        expect(offending, `${key} must not hold ${prefix}*`).toEqual([])
      }
    }
  })

  it('teachers can mark attendance and view scoped fees but cannot collect or refund', () => {
    const teacher = SYSTEM_ROLES.find((r) => r.key === ROLE.TEACHER)!

    expect(teacher.permissions).toContain('attendance.mark')
    expect(teacher.permissions).toContain('exams.marks')
    expect(teacher.permissions).toContain('fees.view')
    expect(teacher.permissions).not.toContain('fees.collect')
    expect(teacher.permissions).not.toContain('fees.refund')
    expect(teacher.permissions).not.toContain('exams.publish')
    expect(teacher.permissions).not.toContain('students.delete')
    expect(teacher.permissions).not.toContain('parents.view')
    expect(teacher.permissions).not.toContain('reports.view')
  })

  it('accountants own fees but cannot edit academic results', () => {
    const accountant = SYSTEM_ROLES.find((r) => r.key === ROLE.ACCOUNTANT)!

    expect(accountant.permissions).toContain('fees.collect')
    expect(accountant.permissions).toContain('fees.refund')
    expect(accountant.permissions).not.toContain('exams.marks')
    expect(accountant.permissions).not.toContain('attendance.mark')
  })

  it('drivers get transport operations only', () => {
    const driver = SYSTEM_ROLES.find((r) => r.key === ROLE.DRIVER)!

    expect(driver.permissions).toContain('transport.drive')
    expect(driver.permissions).not.toContain('students.view')
    expect(driver.permissions).not.toContain('fees.view')
  })
})

describe('self-scoped role detection', () => {
  it('treats a lone parent or student as self-scoped', () => {
    expect(isSelfScoped([ROLE.PARENT])).toBe(true)
    expect(isSelfScoped([ROLE.STUDENT])).toBe(true)
    expect(isSelfScoped([ROLE.PARENT, ROLE.STUDENT])).toBe(true)
  })

  it('does not self-scope a staff member who is also a parent', () => {
    // A teacher whose child attends the school still sees the whole school.
    expect(isSelfScoped([ROLE.TEACHER, ROLE.PARENT])).toBe(false)
    expect(isSelfScoped([ROLE.SCHOOL_ADMIN])).toBe(false)
  })

  it('never self-scopes an empty role list', () => {
    expect(isSelfScoped([])).toBe(false)
  })

  it('treats a teacher-only account as teacher-scoped', () => {
    expect(isTeacherScoped([ROLE.TEACHER])).toBe(true)
    expect(isTeacherScoped([ROLE.TEACHER, ROLE.PARENT])).toBe(false)
  })
})

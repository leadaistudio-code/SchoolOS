import { describe, expect, it } from 'vitest'
import {
  chapterCreateSchema,
  curriculumCreateSchema,
  outcomeCreateSchema,
  reorderSchema,
  topicCreateSchema,
} from '../src/server/modules/curriculum/service'
import { PERMISSIONS } from '../src/lib/rbac/permissions'
import { SYSTEM_ROLES } from '../src/lib/rbac/roles'
import { ROLE } from '../src/lib/rbac/roles'
import { TENANT_SCOPED_MODELS } from '../src/server/db/tenant-models'

describe('curriculum input validation', () => {
  it('requires a class-subject to start a syllabus', () => {
    const result = curriculumCreateSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('trims chapter names and keeps the optional code', () => {
    const parsed = chapterCreateSchema.parse({
      curriculumId: 'c1',
      name: '  Crop Production  ',
      code: 'Ch 1',
    })
    expect(parsed.name).toBe('Crop Production')
    expect(parsed.code).toBe('Ch 1')
  })

  it('rejects an empty chapter name', () => {
    expect(chapterCreateSchema.safeParse({ curriculumId: 'c1', name: '   ' }).success).toBe(false)
  })

  it('caps topic weightage at 100 per cent', () => {
    expect(topicCreateSchema.safeParse({ chapterId: 'x', name: 'Photosynthesis', weightage: 101 }).success).toBe(false)
    expect(topicCreateSchema.safeParse({ chapterId: 'x', name: 'Photosynthesis', weightage: 15 }).success).toBe(true)
  })

  it('accepts only the six Bloom levels on an outcome', () => {
    expect(
      outcomeCreateSchema.safeParse({ topicId: 't1', statement: 'Explain it', bloomLevel: 'UNDERSTAND' })
        .success,
    ).toBe(true)
    expect(
      outcomeCreateSchema.safeParse({ topicId: 't1', statement: 'Explain it', bloomLevel: 'MEMORISE' })
        .success,
    ).toBe(false)
  })

  it('will not accept an empty reorder list', () => {
    expect(reorderSchema.safeParse({ ids: [] }).success).toBe(false)
    expect(reorderSchema.safeParse({ ids: ['a', 'b'] }).success).toBe(true)
  })
})

describe('curriculum permissions', () => {
  const keys = PERMISSIONS.map((p) => p.key)

  it('registers view and manage in the catalogue', () => {
    expect(keys).toContain('curriculum.view')
    expect(keys).toContain('curriculum.manage')
  })

  it('grants teachers the syllabus for subjects they take', () => {
    const teacher = SYSTEM_ROLES.find((r) => r.key === ROLE.TEACHER)
    expect(teacher?.permissions).toContain('curriculum.view')
    expect(teacher?.permissions).toContain('curriculum.manage')
  })

  it('grants principals the full module', () => {
    const principal = SYSTEM_ROLES.find((r) => r.key === ROLE.PRINCIPAL)
    expect(principal?.permissions).toContain('curriculum.manage')
  })

  it('lets students and parents view published syllabus for their own class', () => {
    for (const key of [ROLE.STUDENT, ROLE.PARENT]) {
      const role = SYSTEM_ROLES.find((r) => r.key === key)
      expect(role?.permissions).toContain('curriculum.view')
      expect(role?.permissions).not.toContain('curriculum.manage')
    }
  })
})

describe('curriculum tenant isolation', () => {
  it('registers every new model with the tenant client', () => {
    for (const model of ['Curriculum', 'Chapter', 'Topic', 'LearningOutcome']) {
      expect(TENANT_SCOPED_MODELS).toContain(model)
    }
  })
})

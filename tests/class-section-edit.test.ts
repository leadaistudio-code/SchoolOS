import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import {
  archiveClassLevel,
  archiveSection,
  classUpdateSchema,
  sectionUpdateSchema,
  updateClassLevel,
  updateSection,
} from '../src/server/modules/academics/service'
import type { AppContext } from '../src/server/context'

/**
 * Editing and removing classes and sections.
 *
 * The interesting cases are all refusals. A rename is easy to get right; what
 * decides whether this feature is safe is that it will not let an admin cut a
 * room below the students sitting in it, collide two sections on one name, or
 * remove a class out from under an enrolled child.
 */
const prisma = new PrismaClient()

let tenantId: string
let sessionId: string
let ctx: AppContext

function contextFor(id: string): AppContext {
  const held = new Set(['academics.view', 'academics.manage'])
  return {
    user: {
      sessionId: 's_test',
      userId: 'u_test',
      tenantId: id,
      isSuperAdmin: false,
      firstName: 'Test',
      lastName: 'Admin',
      email: null,
      phone: null,
      avatarUrl: null,
      mustChangePassword: false,
      roleKeys: ['SCHOOL_ADMIN'],
      permissions: held,
      impersonatedById: null,
    },
    tenant: { id, name: 'Test School' } as never,
    db: tenantDb(id),
    can: (p: string) => held.has(p),
    canAny: (...ps: string[]) => ps.some((p) => held.has(p)),
    require: (p: string) => {
      if (!held.has(p)) throw new Error(`missing ${p}`)
    },
  }
}

/** A throwaway class in the current session, cleaned up by the caller. */
async function makeClass(name: string, numeric: number) {
  return prisma.classLevel.create({
    data: { tenantId, sessionId, name, numeric },
  })
}

beforeAll(async () => {
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo' } })
  if (!demo) throw new Error('Seed the database first: npm run db:seed')
  tenantId = demo.id

  const session = await prisma.academicSession.findFirst({
    where: { tenantId, isCurrent: true },
  })
  if (!session) throw new Error('The demo tenant has no current academic session')
  sessionId = session.id

  ctx = contextFor(tenantId)
})

afterAll(async () => {
  await prisma.classLevel.deleteMany({ where: { tenantId, name: { startsWith: 'ZZTest' } } })
  await prisma.$disconnect()
})

describe('edit contracts', () => {
  it('allows a partial class edit — a rename need not restate the rest', () => {
    const parsed = classUpdateSchema.parse({ id: 'c_1', name: 'Class 7' })
    expect(parsed.numeric).toBeUndefined()
    expect(parsed.stream).toBeUndefined()
  })

  it('requires an id to know what is being edited', () => {
    expect(() => classUpdateSchema.parse({ name: 'Class 7' })).toThrow()
    expect(() => sectionUpdateSchema.parse({ name: 'B' })).toThrow()
  })

  it('holds the ladder position inside its range', () => {
    expect(() => classUpdateSchema.parse({ id: 'c_1', numeric: 21 })).toThrow()
    expect(() => classUpdateSchema.parse({ id: 'c_1', numeric: -1 })).toThrow()
  })

  it('refuses a section capacity of zero', () => {
    expect(() => sectionUpdateSchema.parse({ id: 's_1', capacity: 0 })).toThrow()
  })
})

describe('editing a class', () => {
  it('renames it', async () => {
    const created = await makeClass('ZZTest Alpha', 18)
    const updated = await updateClassLevel(ctx, { id: created.id, name: 'ZZTest Renamed' })

    expect(updated.name).toBe('ZZTest Renamed')
  })

  it('refuses a name another class in the session already holds', async () => {
    const first = await makeClass('ZZTest One', 17)
    await makeClass('ZZTest Two', 16)

    await expect(
      updateClassLevel(ctx, { id: first.id, name: 'ZZTest Two' }),
    ).rejects.toThrow(/already exists/i)
  })

  it('lets a class keep its own name', async () => {
    const created = await makeClass('ZZTest Same', 15)
    const updated = await updateClassLevel(ctx, { id: created.id, name: 'ZZTest Same', numeric: 14 })

    expect(updated.numeric).toBe(14)
  })

  it('clears the stream when it is emptied', async () => {
    const created = await prisma.classLevel.create({
      data: { tenantId, sessionId, name: 'ZZTest Stream', numeric: 13, stream: 'Science' },
    })
    const updated = await updateClassLevel(ctx, { id: created.id, stream: '' })

    expect(updated.stream).toBeNull()
  })
})

describe('editing a section', () => {
  it('changes capacity, room and teacher together', async () => {
    const cls = await makeClass('ZZTest Sec', 12)
    const section = await prisma.section.create({
      data: { tenantId, classLevelId: cls.id, name: 'A', capacity: 40 },
    })

    const updated = await updateSection(ctx, section.id, {
      capacity: 45,
      roomName: 'Room 9',
    })

    expect(updated.capacity).toBe(45)
    expect(updated.roomName).toBe('Room 9')
  })

  it('refuses a name another section in the same class already holds', async () => {
    const cls = await makeClass('ZZTest Clash', 11)
    const a = await prisma.section.create({
      data: { tenantId, classLevelId: cls.id, name: 'A', capacity: 40 },
    })
    await prisma.section.create({
      data: { tenantId, classLevelId: cls.id, name: 'B', capacity: 40 },
    })

    await expect(updateSection(ctx, a.id, { name: 'B' })).rejects.toThrow(/already exists/i)
  })

  it('allows the same section name in a different class', async () => {
    const one = await makeClass('ZZTest ClassX', 10)
    const two = await makeClass('ZZTest ClassY', 9)
    await prisma.section.create({
      data: { tenantId, classLevelId: one.id, name: 'A', capacity: 40 },
    })
    const other = await prisma.section.create({
      data: { tenantId, classLevelId: two.id, name: 'B', capacity: 40 },
    })

    const updated = await updateSection(ctx, other.id, { name: 'A' })
    expect(updated.name).toBe('A')
  })
})

describe('removing a class or section', () => {
  it('archives an empty section', async () => {
    const cls = await makeClass('ZZTest Empty', 8)
    const section = await prisma.section.create({
      data: { tenantId, classLevelId: cls.id, name: 'A', capacity: 40 },
    })

    const archived = await archiveSection(ctx, section.id)
    expect(archived.deletedAt).not.toBeNull()
  })

  it('archives a class together with its sections', async () => {
    const cls = await makeClass('ZZTest Cascade', 7)
    await prisma.section.create({
      data: { tenantId, classLevelId: cls.id, name: 'A', capacity: 40 },
    })
    await prisma.section.create({
      data: { tenantId, classLevelId: cls.id, name: 'B', capacity: 40 },
    })

    await archiveClassLevel(ctx, cls.id)

    const after = await prisma.classLevel.findUniqueOrThrow({ where: { id: cls.id } })
    const sections = await prisma.section.findMany({ where: { classLevelId: cls.id } })

    expect(after.deletedAt).not.toBeNull()
    // A section outliving its class would be unreachable but still counted.
    expect(sections.every((s) => s.deletedAt !== null)).toBe(true)
  })

  it('refuses to remove a class while a student is enrolled', async () => {
    const cls = await makeClass('ZZTest Occupied', 6)
    const section = await prisma.section.create({
      data: { tenantId, classLevelId: cls.id, name: 'A', capacity: 40 },
    })
    // A throwaway student: every seeded one already holds an enrolment in the
    // current session, and there is one per student per session.
    const student = await prisma.student.create({
      data: {
        tenantId,
        admissionNo: 'ZZTEST-0001',
        firstName: 'ZZTest',
        lastName: 'Pupil',
      },
    })
    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId,
        studentId: student.id,
        sessionId,
        classLevelId: cls.id,
        sectionId: section.id,
        isCurrent: true,
      },
    })

    try {
      await expect(archiveClassLevel(ctx, cls.id)).rejects.toThrow(/enrolled/i)
      await expect(archiveSection(ctx, section.id)).rejects.toThrow(/another section first/i)

      // And capacity cannot be cut below the one student sitting in it.
      await expect(updateSection(ctx, section.id, { capacity: 0 })).rejects.toThrow()

      const still = await prisma.classLevel.findUniqueOrThrow({ where: { id: cls.id } })
      expect(still.deletedAt).toBeNull()
    } finally {
      await prisma.enrollment.delete({ where: { id: enrollment.id } })
      await prisma.student.delete({ where: { id: student.id } })
    }
  })
})

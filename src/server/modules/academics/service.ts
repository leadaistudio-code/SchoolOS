import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'

export const classCreateSchema = z.object({
  name: z.string().trim().min(1, 'Class name is required').max(60),
  numeric: z.coerce.number().int().min(0).max(20),
  stream: z.string().trim().max(40).optional(),
})

export const sectionCreateSchema = z.object({
  classLevelId: z.string().min(1),
  name: z.string().trim().min(1, 'Section name is required').max(20),
  capacity: z.coerce.number().int().min(1).max(200).default(40),
  roomName: z.string().trim().max(40).optional(),
  classTeacherId: z.string().optional(),
})

export const subjectCreateSchema = z.object({
  code: z.string().trim().min(1).max(12).regex(/^[A-Z0-9_-]+$/i, 'Use letters and numbers only'),
  name: z.string().trim().min(1).max(80),
  isElective: z.boolean().default(false),
})

/** The current academic session, or a clear error telling the admin to make one. */
export async function currentSession(ctx: AppContext) {
  const session = await ctx.db.academicSession.findFirst({ where: { isCurrent: true } })
  if (!session) {
    throw new ApiException(
      409,
      'NO_ACTIVE_SESSION',
      'No active academic session. Create one in Settings before continuing.',
    )
  }
  return session
}

/**
 * The class/section tree with live headcounts. This is the backbone of
 * attendance, timetabling and fee assignment, so it is loaded in one query
 * rather than N+1 per section.
 */
export async function getClassTree(ctx: AppContext) {
  const session = await ctx.db.academicSession.findFirst({ where: { isCurrent: true } })
  if (!session) return []

  return ctx.db.classLevel.findMany({
    where: { sessionId: session.id, deletedAt: null },
    orderBy: { numeric: 'asc' },
    select: {
      id: true,
      name: true,
      numeric: true,
      stream: true,
      sections: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          capacity: true,
          roomName: true,
          classTeacher: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { enrollments: { where: { isCurrent: true } } } },
        },
      },
      _count: { select: { subjects: true } },
    },
  })
}

/** Sections a teacher may mark attendance for. */
export async function markableSections(ctx: AppContext) {
  const session = await ctx.db.academicSession.findFirst({ where: { isCurrent: true } })
  if (!session) return []

  // Anyone who can edit past attendance is treated as school-wide staff;
  // a plain teacher sees the sections they actually teach or own.
  const schoolWide = ctx.can('attendance.edit') || ctx.can('academics.manage')

  const staff = schoolWide
    ? null
    : await ctx.db.staff.findFirst({
        where: { userId: ctx.user.userId },
        select: { id: true },
      })

  return ctx.db.section.findMany({
    where: {
      deletedAt: null,
      classLevel: { sessionId: session.id, deletedAt: null },
      ...(schoolWide || !staff
        ? {}
        : {
            OR: [
              { classTeacherId: staff.id },
              { classLevel: { subjects: { some: { teacherId: staff.id } } } },
            ],
          }),
    },
    orderBy: [{ classLevel: { numeric: 'asc' } }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      capacity: true,
      classLevel: { select: { id: true, name: true, numeric: true } },
      _count: { select: { enrollments: { where: { isCurrent: true } } } },
    },
  })
}

export async function createClassLevel(
  ctx: AppContext,
  input: z.infer<typeof classCreateSchema>,
) {
  ctx.require('academics.manage')
  const session = await currentSession(ctx)

  const existing = await ctx.db.classLevel.findFirst({
    where: { sessionId: session.id, name: input.name, deletedAt: null },
  })
  if (existing) throw conflict(`${input.name} already exists in ${session.name}`)

  const created = await ctx.db.classLevel.create({
    data: {
      tenantId: ctx.tenant.id,
      sessionId: session.id,
      name: input.name,
      numeric: input.numeric,
      stream: input.stream,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'class.create',
    module: 'academics',
    entityType: 'ClassLevel',
    entityId: created.id,
    summary: `Created ${created.name}`,
    after: created,
  })
  return created
}

export async function createSection(
  ctx: AppContext,
  input: z.infer<typeof sectionCreateSchema>,
) {
  ctx.require('academics.manage')

  const classLevel = await ctx.db.classLevel.findFirst({
    where: { id: input.classLevelId, deletedAt: null },
  })
  if (!classLevel) throw notFound('Class')

  const existing = await ctx.db.section.findFirst({
    where: { classLevelId: input.classLevelId, name: input.name, deletedAt: null },
  })
  if (existing) {
    throw conflict(`Section ${input.name} already exists in ${classLevel.name}`)
  }

  const created = await ctx.db.section.create({
    data: {
      tenantId: ctx.tenant.id,
      classLevelId: input.classLevelId,
      name: input.name,
      capacity: input.capacity,
      roomName: input.roomName,
      classTeacherId: input.classTeacherId || null,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'section.create',
    module: 'academics',
    entityType: 'Section',
    entityId: created.id,
    summary: `Created ${classLevel.name} section ${created.name}`,
    after: created,
  })
  return created
}

export async function updateSection(
  ctx: AppContext,
  id: string,
  input: Partial<z.infer<typeof sectionCreateSchema>>,
) {
  ctx.require('academics.manage')

  const before = await ctx.db.section.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { enrollments: { where: { isCurrent: true } } } } },
  })
  if (!before) throw notFound('Section')

  // Capacity cannot be cut below the students already sitting in the room.
  if (input.capacity !== undefined && input.capacity < before._count.enrollments) {
    throw conflict(
      `Capacity cannot be lower than the ${before._count.enrollments} students currently enrolled`,
    )
  }

  const updated = await ctx.db.section.update({
    where: { id },
    data: {
      name: input.name,
      capacity: input.capacity,
      roomName: input.roomName,
      ...(input.classTeacherId !== undefined
        ? { classTeacherId: input.classTeacherId || null }
        : {}),
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'section.update',
    module: 'academics',
    entityType: 'Section',
    entityId: id,
    summary: `Updated section ${updated.name}`,
    before,
    after: updated,
  })
  return updated
}

/**
 * Archives a section. Refuses while students are still enrolled: removing the
 * room out from under a class would orphan attendance and timetable rows.
 */
export async function archiveSection(ctx: AppContext, id: string) {
  ctx.require('academics.manage')

  const section = await ctx.db.section.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { enrollments: { where: { isCurrent: true } } } } },
  })
  if (!section) throw notFound('Section')

  if (section._count.enrollments > 0) {
    throw conflict(
      `Move the ${section._count.enrollments} enrolled students to another section first`,
    )
  }

  const archived = await ctx.db.section.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'section.archive',
    module: 'academics',
    entityType: 'Section',
    entityId: id,
    summary: `Archived section ${section.name}`,
    before: section,
  })
  return archived
}

export async function listSubjects(ctx: AppContext) {
  return ctx.db.subject.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      isElective: true,
      _count: { select: { classes: true } },
    },
  })
}

export async function createSubject(
  ctx: AppContext,
  input: z.infer<typeof subjectCreateSchema>,
) {
  ctx.require('academics.manage')

  const code = input.code.toUpperCase()
  const existing = await ctx.db.subject.findFirst({ where: { code, deletedAt: null } })
  if (existing) throw conflict(`Subject code ${code} is already in use`)

  const created = await ctx.db.subject.create({
    data: { tenantId: ctx.tenant.id, code, name: input.name, isElective: input.isElective },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'subject.create',
    module: 'academics',
    entityType: 'Subject',
    entityId: created.id,
    summary: `Created subject ${created.name} (${created.code})`,
    after: created,
  })
  return created
}

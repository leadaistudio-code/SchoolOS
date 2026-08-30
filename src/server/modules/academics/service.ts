import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { classLevelScopeWhere, teachingClassSubjectIds } from '@/server/scope'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { findOrRestore } from '@/server/db/soft-delete'

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

/**
 * Editing an existing class or section.
 *
 * Separate from the create schemas because the identifier is required and
 * everything else is optional: a rename must not force an admin to restate the
 * capacity and the room.
 */
export const classUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Class name is required').max(60).optional(),
  numeric: z.coerce.number().int().min(0).max(20).optional(),
  stream: z.string().trim().max(40).optional(),
})

export const sectionUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Section name is required').max(20).optional(),
  capacity: z.coerce.number().int().min(1).max(200).optional(),
  roomName: z.string().trim().max(40).optional(),
  classTeacherId: z.string().optional(),
})

export const subjectCreateSchema = z.object({
  code: z.string().trim().min(1).max(12).regex(/^[A-Z0-9_-]+$/i, 'Use letters and numbers only'),
  name: z.string().trim().min(1).max(80),
  isElective: z.boolean().default(false),
})

export const subjectUpdateSchema = subjectCreateSchema.partial().extend({
  id: z.string().min(1),
})

export const classSubjectUpdateSchema = z.object({
  id: z.string().min(1),
  teacherId: z.string().optional().nullable(),
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

  const classScope = await classLevelScopeWhere(ctx)

  return ctx.db.classLevel.findMany({
    where: { sessionId: session.id, deletedAt: null, ...classScope },
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

  const created = await findOrRestore({
    model: ctx.db.classLevel,
    where: { tenantId: ctx.tenant.id, sessionId: session.id, name: input.name },
    createData: {
      tenantId: ctx.tenant.id,
      sessionId: session.id,
      name: input.name,
      numeric: input.numeric,
      stream: input.stream,
    },
    restoreData: { numeric: input.numeric, stream: input.stream },
    conflictMsg: `${input.name} already exists in ${session.name}`,
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

  const created = await findOrRestore({
    model: ctx.db.section,
    where: { tenantId: ctx.tenant.id, classLevelId: input.classLevelId, name: input.name },
    createData: {
      tenantId: ctx.tenant.id,
      classLevelId: input.classLevelId,
      name: input.name,
      capacity: input.capacity,
      roomName: input.roomName,
      classTeacherId: input.classTeacherId || null,
    },
    restoreData: {
      capacity: input.capacity,
      roomName: input.roomName,
      classTeacherId: input.classTeacherId || null,
    },
    conflictMsg: `Section ${input.name} already exists in ${classLevel.name}`,
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

/**
 * Renames a class or moves it on the ladder.
 *
 * Renaming is safe at any time: every other table points at the class by id,
 * so attendance, timetables and fee structures follow the new name rather than
 * being orphaned by it.
 */
export async function updateClassLevel(
  ctx: AppContext,
  input: z.infer<typeof classUpdateSchema>,
) {
  ctx.require('academics.manage')

  const before = await ctx.db.classLevel.findFirst({
    where: { id: input.id, deletedAt: null },
  })
  if (!before) throw notFound('Class')

  if (input.name && input.name !== before.name) {
    const clash = await ctx.db.classLevel.findFirst({
      where: {
        sessionId: before.sessionId,
        name: input.name,
        deletedAt: null,
        id: { not: input.id },
      },
    })
    if (clash) throw conflict(`${input.name} already exists in this session`)
  }

  const updated = await ctx.db.classLevel.update({
    where: { id: input.id },
    data: {
      name: input.name,
      numeric: input.numeric,
      ...(input.stream !== undefined ? { stream: input.stream || null } : {}),
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'class.update',
    module: 'academics',
    entityType: 'ClassLevel',
    entityId: input.id,
    summary:
      input.name && input.name !== before.name
        ? `Renamed ${before.name} to ${updated.name}`
        : `Updated ${updated.name}`,
    before,
    after: updated,
  })
  return updated
}

/**
 * Archives a class and its sections together.
 *
 * Refuses while anybody is enrolled: a class removed out from under its
 * students would leave attendance, timetable and fee rows pointing at
 * something no screen can show. The sections go with it in the same
 * transaction, because a section whose class has vanished is unreachable but
 * still counted.
 */
export async function archiveClassLevel(ctx: AppContext, id: string) {
  ctx.require('academics.manage')

  const classLevel = await ctx.db.classLevel.findFirst({
    where: { id, deletedAt: null },
    include: {
      sections: {
        where: { deletedAt: null },
        include: { _count: { select: { enrollments: { where: { isCurrent: true } } } } },
      },
    },
  })
  if (!classLevel) throw notFound('Class')

  const enrolled = classLevel.sections.reduce((sum, s) => sum + s._count.enrollments, 0)
  if (enrolled > 0) {
    throw conflict(
      `Move the ${enrolled} student${enrolled === 1 ? '' : 's'} enrolled in ${classLevel.name} to another class first`,
    )
  }

  const now = new Date()
  await ctx.db.$transaction([
    ctx.db.section.updateMany({
      where: { classLevelId: id, deletedAt: null },
      data: { deletedAt: now },
    }),
    ctx.db.classLevel.update({ where: { id }, data: { deletedAt: now } }),
  ])

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'class.archive',
    module: 'academics',
    entityType: 'ClassLevel',
    entityId: id,
    summary: `Archived ${classLevel.name}${classLevel.sections.length > 0 ? ` and its ${classLevel.sections.length} section(s)` : ''}`,
    before: classLevel,
  })
  return { id, name: classLevel.name }
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

  // Caught here rather than left to the unique index, which would surface as a
  // raw constraint violation instead of a sentence naming the clash.
  if (input.name && input.name !== before.name) {
    const clash = await ctx.db.section.findFirst({
      where: {
        classLevelId: before.classLevelId,
        name: input.name,
        deletedAt: null,
        id: { not: id },
      },
    })
    if (clash) throw conflict(`Section ${input.name} already exists in this class`)
  }

  const updated = await ctx.db.section.update({
    where: { id },
    data: {
      name: input.name,
      capacity: input.capacity,
      // Clearing the field stores null rather than an empty string, so "no
      // room" reads the same whether it was never set or later removed.
      ...(input.roomName !== undefined ? { roomName: input.roomName || null } : {}),
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

export const classSubjectSchema = z.object({
  classLevelId: z.string().min(1, 'Select a class'),
  subjectId: z.string().min(1, 'Select a subject'),
  teacherId: z.string().optional(),
})

export const assignSubjectToClassesSchema = z.object({
  subjectId: z.string().min(1, 'Select a subject'),
  classLevelIds: z.array(z.string()).min(1, 'Select at least one class'),
  teacherId: z.string().optional(),
})

export const subjectCreateWithClassesSchema = subjectCreateSchema.extend({
  classLevelIds: z.array(z.string()).default([]),
  teacherId: z.string().optional(),
})

/**
 * Updates a subject in the school-wide catalogue.
 */
export async function updateSubject(
  ctx: AppContext,
  input: z.infer<typeof subjectUpdateSchema>,
) {
  ctx.require('academics.manage')

  const before = await ctx.db.subject.findFirst({ where: { id: input.id, deletedAt: null } })
  if (!before) throw notFound('Subject')

  const code = input.code ? input.code.toUpperCase() : undefined
  if (code && code !== before.code) {
    const clash = await ctx.db.subject.findFirst({
      where: { code, deletedAt: null, id: { not: input.id } },
      select: { id: true },
    })
    if (clash) throw conflict(`Subject code ${code} is already in use`)
  }

  const updated = await ctx.db.subject.update({
    where: { id: input.id },
    data: {
      code,
      name: input.name,
      isElective: input.isElective,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'subject.update',
    module: 'academics',
    entityType: 'Subject',
    entityId: updated.id,
    summary: `Updated subject ${updated.name} (${updated.code})`,
    before,
    after: updated,
  })
  return updated
}

export async function archiveSubject(ctx: AppContext, id: string) {
  ctx.require('academics.manage')

  const before = await ctx.db.subject.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { classes: true } } },
  })
  if (!before) throw notFound('Subject')
  if (before._count.classes > 0) {
    throw conflict(
      `${before.name} is still taught in ${before._count.classes} class${before._count.classes === 1 ? '' : 'es'}. Unassign it first.`,
    )
  }

  const archived = await ctx.db.subject.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'subject.archive',
    module: 'academics',
    entityType: 'Subject',
    entityId: id,
    summary: `Archived subject ${before.name}`,
    before,
  })
  return archived
}

export async function assignSubjectToClass(
  ctx: AppContext,
  input: z.infer<typeof classSubjectSchema>,
) {
  ctx.require('academics.manage')

  const [classLevel, subject] = await Promise.all([
    ctx.db.classLevel.findFirst({ where: { id: input.classLevelId, deletedAt: null } }),
    ctx.db.subject.findFirst({ where: { id: input.subjectId, deletedAt: null } }),
  ])
  if (!classLevel) throw notFound('Class')
  if (!subject) throw notFound('Subject')

  const existing = await ctx.db.classSubject.findFirst({
    where: { classLevelId: input.classLevelId, subjectId: input.subjectId },
  })
  if (existing) throw conflict(`${subject.name} is already taught in ${classLevel.name}`)

  const created = await ctx.db.classSubject.create({
    data: {
      tenantId: ctx.tenant.id,
      classLevelId: input.classLevelId,
      subjectId: input.subjectId,
      teacherId: input.teacherId || null,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'class_subject.create',
    module: 'academics',
    entityType: 'ClassSubject',
    entityId: created.id,
    summary: `Added ${subject.name} to ${classLevel.name}`,
    after: created,
  })
  return created
}

export async function assignSubjectToClasses(
  ctx: AppContext,
  input: z.infer<typeof assignSubjectToClassesSchema>,
) {
  ctx.require('academics.manage')

  const subject = await ctx.db.subject.findFirst({
    where: { id: input.subjectId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!subject) throw notFound('Subject')

  let created = 0
  const skipped: string[] = []

  for (const classLevelId of input.classLevelIds) {
    const classLevel = await ctx.db.classLevel.findFirst({
      where: { id: classLevelId, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!classLevel) continue

    const existing = await ctx.db.classSubject.findFirst({
      where: { classLevelId, subjectId: input.subjectId },
    })
    if (existing) {
      skipped.push(classLevel.name)
      continue
    }

    const row = await ctx.db.classSubject.create({
      data: {
        tenantId: ctx.tenant.id,
        classLevelId,
        subjectId: input.subjectId,
        teacherId: input.teacherId || null,
      },
    })

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'class_subject.create',
      module: 'academics',
      entityType: 'ClassSubject',
      entityId: row.id,
      summary: `Added ${subject.name} to ${classLevel.name}`,
      after: row,
    })
    created++
  }

  if (created === 0) {
    throw conflict(
      skipped.length > 0
        ? `${subject.name} is already taught in ${skipped.join(', ')}`
        : 'No classes were selected',
    )
  }

  return { created, skipped, subjectName: subject.name }
}

export async function createSubjectWithClasses(
  ctx: AppContext,
  input: z.infer<typeof subjectCreateWithClassesSchema>,
) {
  const { classLevelIds, teacherId, ...subjectInput } = input
  const created = await createSubject(ctx, subjectInput)

  if (classLevelIds.length === 0) {
    return { subject: created, assigned: 0, skipped: [] as string[] }
  }

  const mapped = await assignSubjectToClasses(ctx, {
    subjectId: created.id,
    classLevelIds,
    teacherId,
  })

  return { subject: created, assigned: mapped.created, skipped: mapped.skipped }
}

export async function updateClassSubject(
  ctx: AppContext,
  input: z.infer<typeof classSubjectUpdateSchema>,
) {
  ctx.require('academics.manage')

  const before = await ctx.db.classSubject.findFirst({
    where: { id: input.id },
    include: {
      subject: { select: { name: true, code: true } },
      classLevel: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  })
  if (!before) throw notFound('Class subject')

  if (input.teacherId) {
    const teacher = await ctx.db.staff.findFirst({
      where: { id: input.teacherId, deletedAt: null },
      select: { id: true },
    })
    if (!teacher) throw notFound('Teacher')
  }

  const updated = await ctx.db.classSubject.update({
    where: { id: input.id },
    data: {
      teacherId: input.teacherId === undefined ? undefined : input.teacherId || null,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'class_subject.update',
    module: 'academics',
    entityType: 'ClassSubject',
    entityId: updated.id,
    summary: `Updated teacher for ${before.subject.name} in ${before.classLevel.name}`,
    before,
    after: updated,
  })
  return updated
}

export async function unassignSubjectFromClass(ctx: AppContext, id: string) {
  ctx.require('academics.manage')

  const before = await ctx.db.classSubject.findFirst({
    where: { id },
    include: {
      subject: { select: { name: true } },
      classLevel: { select: { name: true } },
      _count: { select: { curricula: true, timetable: true } },
    },
  })
  if (!before) throw notFound('Class subject')
  if (before._count.curricula > 0 || before._count.timetable > 0) {
    throw conflict(
      `${before.subject.name} in ${before.classLevel.name} still has a syllabus or timetable slots. Remove those first.`,
    )
  }

  await ctx.db.classSubject.delete({ where: { id } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'class_subject.delete',
    module: 'academics',
    entityType: 'ClassSubject',
    entityId: id,
    summary: `Removed ${before.subject.name} from ${before.classLevel.name}`,
    before,
  })
  return { ok: true }
}

/**
 * Every class-subject pairing, for the table on the Subjects page.
 *
 * Ordered by the class ladder rather than alphabetically: an admin checking
 * that Class 6 has its full complement of subjects reads down a class, not
 * across the alphabet.
 */
export async function listClassSubjects(ctx: AppContext) {
  const subjectScope = await teachingClassSubjectIds(ctx)

  return ctx.db.classSubject.findMany({
    where: {
      classLevel: { deletedAt: null },
      ...(subjectScope !== null ? { id: { in: subjectScope } } : {}),
    },
    orderBy: [{ classLevel: { numeric: 'asc' } }, { subject: { name: 'asc' } }],
    select: {
      id: true,
      classLevel: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true, isElective: true } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { curricula: true, timetable: true } },
    },
  })
}

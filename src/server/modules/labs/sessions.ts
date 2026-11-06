import type { LabSessionStatus, LabType, Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { schoolToday } from '@/lib/periods'
import { assertLabs, auditLab, dateOnly, isoOf } from './access'
import { getLab } from './service'
import { lockLabItems, postMovement } from './stock'
import { bookSessionSchema, completeSessionSchema, experimentSchema } from './schema'

export type Apparatus = { itemCode: string; qty: number }

export function apparatusOf(experiment: { apparatus: Prisma.JsonValue } | null | undefined): Apparatus[] {
  const v = experiment?.apparatus
  if (!Array.isArray(v)) return []
  return v.filter(
    (a): a is Apparatus =>
      !!a && typeof a === 'object' && typeof (a as Apparatus).itemCode === 'string' && typeof (a as Apparatus).qty === 'number',
  )
}

/* -------------------------------------------------------------- library */

export async function listExperiments(ctx: AppContext, opts: { labType?: LabType; classNumber?: number } = {}) {
  ctx.require('labs.view')
  await assertLabs(ctx)
  return ctx.db.labExperiment.findMany({
    where: {
      deletedAt: null,
      ...(opts.labType ? { labType: opts.labType } : {}),
      ...(opts.classNumber ? { classNumber: opts.classNumber } : {}),
    },
    orderBy: [{ classNumber: 'asc' }, { subject: 'asc' }, { title: 'asc' }],
  })
}

export async function saveExperiment(ctx: AppContext, id: string | null, raw: unknown) {
  ctx.require('labs.manage')
  await assertLabs(ctx)
  const input = experimentSchema.parse(raw)
  const data = {
    labType: input.labType,
    classNumber: input.classNumber ?? null,
    subject: input.subject ?? null,
    title: input.title,
    aim: input.aim ?? null,
    safetyNotes: input.safetyNotes ?? null,
    apparatus: input.apparatus,
  }
  if (id) {
    const existing = await ctx.db.labExperiment.findFirst({ where: { id, deletedAt: null } })
    if (!existing) throw notFound('Practical')
    const saved = await ctx.db.labExperiment.update({ where: { id }, data })
    await auditLab(ctx, 'labs.practical.update', 'LabExperiment', id, `Edited practical ${saved.title}`)
    return saved
  }
  const saved = await ctx.db.labExperiment.create({ data: { tenantId: ctx.tenant.id, ...data } })
  await auditLab(ctx, 'labs.practical.create', 'LabExperiment', saved.id, `Added practical ${saved.title}`)
  return saved
}

export async function archiveExperiment(ctx: AppContext, id: string) {
  ctx.require('labs.manage')
  await assertLabs(ctx)
  const existing = await ctx.db.labExperiment.findFirst({ where: { id, deletedAt: null } })
  if (!existing) throw notFound('Practical')
  await ctx.db.labExperiment.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
  await auditLab(ctx, 'labs.practical.archive', 'LabExperiment', id, `Removed practical ${existing.title}`)
}

/* -------------------------------------------------------------- booking */

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd)
}

/** Mon=1..Sun=7, matching TimetableSlot.dayOfWeek. */
function dayOfWeek(iso: string) {
  const d = dateOnly(iso).getUTCDay()
  return d === 0 ? 7 : d
}

export async function bookingOptions(ctx: AppContext) {
  const periods = await ctx.db.timetablePeriod.findMany({
    where: { isBreak: false },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, startTime: true, endTime: true },
  })
  return { periods }
}

export async function bookSession(ctx: AppContext, raw: unknown) {
  ctx.require('labs.sessions')
  const input = bookSessionSchema.parse(raw)
  const lab = await getLab(ctx, input.labId)

  const section = await ctx.db.section.findFirst({
    where: { id: input.sectionId, deletedAt: null },
    select: { id: true, name: true, classLevel: { select: { name: true } } },
  })
  if (!section) throw notFound('Class')

  let startTime = input.startTime
  let endTime = input.endTime
  let teacherStaffId = input.teacherStaffId ?? null
  if (input.periodId) {
    const period = await ctx.db.timetablePeriod.findFirst({ where: { id: input.periodId } })
    if (!period) throw notFound('Period')
    startTime ??= period.startTime
    endTime ??= period.endTime
    // The timetable already says who teaches this class in this period.
    if (!teacherStaffId) {
      const slot = await ctx.db.timetableSlot.findFirst({
        where: { sectionId: section.id, periodId: period.id, dayOfWeek: dayOfWeek(input.date) },
        select: { teacherId: true },
      })
      teacherStaffId = slot?.teacherId ?? null
    }
  }
  if (!startTime || !endTime) throw badRequest('Pick a period or enter the start and end time')
  if (toMinutes(endTime) <= toMinutes(startTime)) throw badRequest('The session must end after it starts')
  if (input.date < schoolToday()) throw badRequest('Pick today or a later date')

  if (input.experimentId) {
    const exp = await ctx.db.labExperiment.findFirst({ where: { id: input.experimentId, deletedAt: null } })
    if (!exp) throw notFound('Practical')
  }

  const sameDay = await ctx.db.labSession.findMany({
    where: { date: dateOnly(input.date), status: { not: 'CANCELLED' } },
    select: { id: true, labId: true, sectionId: true, teacherStaffId: true, startTime: true, endTime: true, batch: true },
  })
  for (const other of sameDay) {
    if (!overlaps(startTime, endTime, other.startTime, other.endTime)) continue
    if (other.labId === lab.id) {
      throw conflict(`${lab.name} is already booked from ${other.startTime} to ${other.endTime} on ${input.date}`)
    }
    // Split batches of one class may run side by side in different labs.
    if (other.sectionId === section.id && !(input.batch && other.batch && input.batch !== other.batch)) {
      throw conflict(`${section.classLevel.name} ${section.name} already has a lab session at ${other.startTime}`)
    }
    if (teacherStaffId && other.teacherStaffId === teacherStaffId) {
      throw conflict(`That teacher is already taking a lab session at ${other.startTime}`)
    }
  }

  const session = await ctx.db.labSession.create({
    data: {
      tenantId: ctx.tenant.id,
      labId: lab.id,
      experimentId: input.experimentId ?? null,
      sectionId: section.id,
      teacherStaffId,
      date: dateOnly(input.date),
      periodId: input.periodId ?? null,
      startTime,
      endTime,
      batch: input.batch ?? null,
      notes: input.notes ?? null,
      createdById: ctx.user.userId,
    },
  })
  await auditLab(ctx, 'labs.session.book', 'LabSession', session.id, `Booked ${lab.name} for ${section.classLevel.name} ${section.name} on ${input.date}`)
  return session
}

export async function cancelSession(ctx: AppContext, id: string) {
  ctx.require('labs.sessions')
  await assertLabs(ctx)
  const session = await ctx.db.labSession.findFirst({ where: { id } })
  if (!session) throw notFound('Session')
  if (session.status !== 'SCHEDULED') throw conflict('Only a scheduled session can be cancelled')
  await ctx.db.labSession.update({ where: { id }, data: { status: 'CANCELLED' } })
  await auditLab(ctx, 'labs.session.cancel', 'LabSession', id, 'Cancelled a lab session')
}

async function sectionLabels(ctx: AppContext, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  const rows = unique.length
    ? await ctx.db.section.findMany({
        where: { id: { in: unique } },
        select: { id: true, name: true, classLevel: { select: { name: true } } },
      })
    : []
  return new Map(rows.map((s) => [s.id, `${s.classLevel.name} ${s.name}`]))
}

async function staffLabels(ctx: AppContext, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  const rows = unique.length
    ? await ctx.db.staff.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } })
    : []
  return new Map(rows.map((s) => [s.id, `${s.firstName} ${s.lastName}`]))
}

export async function listSessions(
  ctx: AppContext,
  opts: { labId?: string; status?: LabSessionStatus; from?: string; to?: string; take?: number } = {},
) {
  ctx.require('labs.view')
  await assertLabs(ctx)
  const sessions = await ctx.db.labSession.findMany({
    where: {
      ...(opts.labId ? { labId: opts.labId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.from || opts.to
        ? { date: { ...(opts.from ? { gte: dateOnly(opts.from) } : {}), ...(opts.to ? { lte: dateOnly(opts.to) } : {}) } }
        : {}),
    },
    include: {
      lab: { select: { name: true } },
      experiment: { select: { title: true, classNumber: true } },
      _count: { select: { students: true } },
    },
    orderBy: [{ date: opts.status === 'COMPLETED' ? 'desc' : 'asc' }, { startTime: 'asc' }],
    take: opts.take ?? 200,
  })
  const [sections, staff] = await Promise.all([
    sectionLabels(ctx, sessions.map((s) => s.sectionId)),
    staffLabels(ctx, sessions.map((s) => s.teacherStaffId)),
  ])
  return sessions.map((s) => ({
    ...s,
    dateIso: isoOf(s.date),
    sectionLabel: s.sectionId ? sections.get(s.sectionId) ?? 'Class' : '—',
    teacherLabel: s.teacherStaffId ? staff.get(s.teacherStaffId) ?? null : null,
  }))
}

/** Everything the conduct screen needs: roster, suggested consumption and what is short. */
export async function sessionDetail(ctx: AppContext, id: string) {
  ctx.require('labs.view')
  await assertLabs(ctx)
  const session = await ctx.db.labSession.findFirst({
    where: { id },
    include: { lab: true, experiment: true, students: true, movements: { include: { item: { select: { name: true, unit: true } } } } },
  })
  if (!session) throw notFound('Session')

  const [roster, items, labels, staff] = await Promise.all([
    session.sectionId
      ? ctx.db.enrollment.findMany({
          where: { sectionId: session.sectionId, isCurrent: true, student: { deletedAt: null } },
          select: { rollNumber: true, student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
          orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
        })
      : Promise.resolve([]),
    ctx.db.labItem.findMany({
      where: { labId: session.labId, deletedAt: null, isActive: true },
      select: { id: true, templateCode: true, name: true, unit: true, kind: true, quantity: true, category: true },
      orderBy: { name: 'asc' },
    }),
    sectionLabels(ctx, [session.sectionId]),
    staffLabels(ctx, [session.teacherStaffId]),
  ])

  const byCode = new Map(items.filter((i) => i.templateCode).map((i) => [i.templateCode!, i]))
  const apparatus = apparatusOf(session.experiment).map((a) => {
    const item = byCode.get(a.itemCode) ?? null
    return { ...a, item, short: item ? item.quantity < a.qty : true }
  })

  return {
    session,
    dateIso: isoOf(session.date),
    sectionLabel: session.sectionId ? labels.get(session.sectionId) ?? 'Class' : '—',
    teacherLabel: session.teacherStaffId ? staff.get(session.teacherStaffId) ?? null : null,
    roster: roster.map((r) => ({
      studentId: r.student.id,
      rollNumber: r.rollNumber,
      name: `${r.student.firstName} ${r.student.lastName}`,
      admissionNo: r.student.admissionNo,
      saved: session.students.find((s) => s.studentId === r.student.id) ?? null,
    })),
    items,
    apparatus,
  }
}

export async function completeSession(ctx: AppContext, raw: unknown) {
  ctx.require('labs.sessions')
  await assertLabs(ctx)
  const input = completeSessionSchema.parse(raw)
  const tenantId = ctx.tenant.id

  const result = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    // Lock the session row so a double submit cannot deduct stock twice.
    const [locked] = await tx.$queryRawUnsafe<{ id: string; status: string; labId: string }[]>(
      `SELECT id, status, "labId" FROM "LabSession" WHERE "tenantId" = $1 AND id = $2 FOR UPDATE`,
      tenantId,
      input.sessionId,
    )
    if (!locked) throw notFound('Session')
    if (locked.status !== 'SCHEDULED') throw conflict('This session has already been completed or cancelled')

    const session = await tx.labSession.findFirst({ where: { id: input.sessionId, tenantId }, select: { sectionId: true } })
    const roster = new Set(
      session?.sectionId
        ? (
            await tx.enrollment.findMany({
              where: { tenantId, sectionId: session.sectionId, isCurrent: true },
              select: { studentId: true },
            })
          ).map((e) => e.studentId)
        : [],
    )
    const outsider = [...input.attendance.map((a) => a.studentId), ...input.breakages.map((b) => b.studentId ?? '')]
      .filter(Boolean)
      .find((id) => !roster.has(id))
    if (outsider) throw badRequest('A student in this list is not in the class booked for the session')

    for (const a of input.attendance) {
      await tx.labSessionStudent.upsert({
        where: { sessionId_studentId: { sessionId: input.sessionId, studentId: a.studentId } },
        create: {
          tenantId,
          sessionId: input.sessionId,
          studentId: a.studentId,
          present: a.present,
          recordDone: a.present && a.recordDone,
          marks: a.present ? a.marks ?? null : null,
          remarks: a.remarks || null,
        },
        update: {
          present: a.present,
          recordDone: a.present && a.recordDone,
          marks: a.present ? a.marks ?? null : null,
          remarks: a.remarks || null,
        },
      })
    }

    const itemIds = [...input.consumption.map((c) => c.itemId), ...input.breakages.map((b) => b.itemId)]
    const items = await lockLabItems(tx, tenantId, itemIds)
    for (const item of items.values()) {
      if (item.labId !== locked.labId) throw badRequest(`${item.name} belongs to another lab`)
    }

    let consumed = 0
    for (const c of input.consumption) {
      if (c.qty <= 0) continue
      const item = items.get(c.itemId)!
      if (item.quantity < c.qty) {
        throw conflict(
          `Only ${item.quantity} ${item.unit} of ${item.name} is in the register. Record the purchase first or reduce the quantity used.`,
        )
      }
      await postMovement(tx, ctx, item, { type: 'CONSUMPTION', delta: -c.qty, sessionId: input.sessionId, reason: 'Used in practical' })
      consumed++
    }
    for (const b of input.breakages) {
      const item = items.get(b.itemId)!
      await postMovement(tx, ctx, item, {
        type: 'BREAKAGE',
        delta: -b.qty,
        sessionId: input.sessionId,
        studentId: b.studentId || null,
        chargeMinor: b.chargeMinor ?? null,
        reason: 'Broken during practical',
      })
    }

    await tx.labSession.update({
      where: { id: input.sessionId },
      data: { status: 'COMPLETED', completedAt: new Date(), ...(input.notes ? { notes: input.notes } : {}) },
    })
    return { consumed, breakages: input.breakages.length, present: input.attendance.filter((a) => a.present).length }
  })

  await auditLab(
    ctx,
    'labs.session.complete',
    'LabSession',
    input.sessionId,
    `Completed a practical: ${result.present} present, ${result.consumed} consumable(s) deducted, ${result.breakages} breakage(s)`,
  )
  return result
}

/* -------------------------------------------------------- student record */

/** Practical record for a class: every completed session and each student's entry. */
export async function sectionRecord(ctx: AppContext, sectionId: string) {
  ctx.require('labs.view')
  await assertLabs(ctx)
  const section = await ctx.db.section.findFirst({
    where: { id: sectionId, deletedAt: null },
    select: { id: true, name: true, classLevel: { select: { name: true } } },
  })
  if (!section) throw notFound('Class')

  const [sessions, roster, breakages] = await Promise.all([
    ctx.db.labSession.findMany({
      where: { sectionId, status: 'COMPLETED' },
      include: { experiment: { select: { title: true } }, lab: { select: { name: true } }, students: true },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    }),
    ctx.db.enrollment.findMany({
      where: { sectionId, isCurrent: true, student: { deletedAt: null } },
      select: { rollNumber: true, student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
      orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
    }),
    ctx.db.labStockMovement.findMany({
      where: { type: 'BREAKAGE', studentId: { not: null }, session: { sectionId } },
      select: { studentId: true, quantity: true, chargeMinor: true, item: { select: { name: true } } },
    }),
  ])

  const students = roster.map((r) => {
    const entries = sessions.map((s) => s.students.find((x) => x.studentId === r.student.id) ?? null)
    const attended = entries.filter((e) => e?.present).length
    const recorded = entries.filter((e) => e?.recordDone).length
    const marks = entries.map((e) => e?.marks).filter((m): m is number => typeof m === 'number')
    const broke = breakages.filter((b) => b.studentId === r.student.id)
    return {
      studentId: r.student.id,
      rollNumber: r.rollNumber,
      name: `${r.student.firstName} ${r.student.lastName}`,
      admissionNo: r.student.admissionNo,
      entries,
      attended,
      recorded,
      averageMarks: marks.length ? Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 10) / 10 : null,
      breakages: broke.map((b) => `${b.item.name} × ${Math.abs(b.quantity)}`),
      chargesMinor: broke.reduce((sum, b) => sum + (b.chargeMinor ?? 0), 0),
    }
  })

  return {
    section: { id: section.id, label: `${section.classLevel.name} ${section.name}` },
    sessions: sessions.map((s) => ({
      id: s.id,
      dateIso: isoOf(s.date),
      title: s.experiment?.title ?? 'Practical',
      lab: s.lab.name,
    })),
    students,
  }
}

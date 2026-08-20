import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound, ApiException } from '@/server/api/response'
import type {
  PromotionApplyInput,
  PromotionDecision,
  PromotionPlanInput,
} from './schema'

/**
 * End-of-session promotion.
 *
 * The operation this replaces is a school secretary editing several hundred
 * records by hand over a week, which is why the shape here is "review a whole
 * class, then commit once" rather than a per-student action repeated. Three
 * rules hold it together:
 *
 *  1. Promotion never edits history. A child's placement in 2025-26 stays
 *     exactly as it was; moving up writes a NEW Enrollment row for 2026-27.
 *     Last year's attendance, marks and receipts keep pointing at the class
 *     the child was actually in.
 *
 *  2. `Enrollment.isCurrent` follows the school's current session, not the
 *     promotion. Promoting into a session that has not started yet queues the
 *     placement; it goes live when someone switches the session over. Without
 *     that rule, promoting in February would move the whole school up a class
 *     while the year was still running.
 *
 *  3. Nothing the browser sends is trusted as a destination. Every target
 *     class and section is re-read and re-checked against the target session
 *     before a row is written.
 */

export type PromotionSession = {
  id: string
  name: string
  startsOn: Date
  endsOn: Date
  isCurrent: boolean
  isLocked: boolean
  classCount: number
}

export type PromotionSection = {
  id: string
  name: string
  capacity: number
  filled: number
}

export type PromotionClass = {
  id: string
  name: string
  numeric: number
  stream: string | null
  sections: PromotionSection[]
}

export type PromotionCandidate = {
  studentId: string
  admissionNo: string
  firstName: string
  lastName: string
  photoUrl: string | null
  rollNumber: number | null
  className: string
  sectionName: string
  /** Outstanding fees across every session, in minor units. */
  duesMinor: number
  /** Already has a placement in the target session — promoting again is a no-op. */
  alreadyPlaced: boolean
  /** Where the existing placement puts them, when `alreadyPlaced`. */
  placedIn: string | null
  suggestedDecision: PromotionDecision
  suggestedClassLevelId: string | null
  suggestedSectionId: string | null
}

export type PromotionPlan = {
  fromSession: PromotionSession
  toSession: PromotionSession
  /** The class in the target session that this class normally feeds into. */
  nextClass: PromotionClass | null
  /** The same class in the target session, for students who repeat the year. */
  repeatClass: PromotionClass | null
  /** Every class in the target session, for overriding the suggestion. */
  targetClasses: PromotionClass[]
  candidates: PromotionCandidate[]
  /** True when this is the top class and there is nothing above it to move into. */
  isTerminalClass: boolean
}

export type PromotionResult = {
  promoted: number
  repeated: number
  graduated: number
  transferred: number
  skipped: number
  /** Students the server refused to move, with the reason, so nothing fails silently. */
  rejected: { studentId: string; name: string; reason: string }[]
}

/** Sessions available as either end of a promotion. */
export async function listPromotionSessions(ctx: AppContext): Promise<PromotionSession[]> {
  ctx.require('students.promote')

  const sessions = await ctx.db.academicSession.findMany({
    orderBy: { startsOn: 'asc' },
    select: {
      id: true,
      name: true,
      startsOn: true,
      endsOn: true,
      isCurrent: true,
      isLocked: true,
      _count: { select: { classes: true } },
    },
  })

  return sessions.map((s) => ({
    id: s.id,
    name: s.name,
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    isCurrent: s.isCurrent,
    isLocked: s.isLocked,
    classCount: s._count.classes,
  }))
}

/** The class/section tree for one session, with how full each section is. */
export async function getSessionStructure(
  ctx: AppContext,
  sessionId: string,
): Promise<PromotionClass[]> {
  const classes = await ctx.db.classLevel.findMany({
    where: { sessionId, deletedAt: null },
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
          _count: { select: { enrollments: { where: { sessionId } } } },
        },
      },
    },
  })

  return classes.map((c) => ({
    id: c.id,
    name: c.name,
    numeric: c.numeric,
    stream: c.stream,
    sections: c.sections.map((s) => ({
      id: s.id,
      name: s.name,
      capacity: s.capacity,
      filled: s._count.enrollments,
    })),
  }))
}

/**
 * Picks the receiving section within a target class.
 *
 * Same letter first — a child in 6B expects to be in 7B — then the emptiest
 * section that still has room, and only then the emptiest section at all. The
 * last case is a school that is genuinely over capacity, which is a fact to
 * show the office, not a reason to refuse to promote.
 */
function suggestSection(target: PromotionClass, currentSectionName: string): string | null {
  if (target.sections.length === 0) return null

  const sameLetter = target.sections.find(
    (s) => s.name.toLowerCase() === currentSectionName.toLowerCase(),
  )
  if (sameLetter) return sameLetter.id

  const withRoom = target.sections
    .filter((s) => s.filled < s.capacity)
    .sort((a, b) => a.filled - b.filled)[0]
  if (withRoom) return withRoom.id

  return [...target.sections].sort((a, b) => a.filled - b.filled)[0]!.id
}

/**
 * Builds the review list for one class: who is in it, what it would cost them,
 * and what the system proposes to do with each of them.
 */
export async function planPromotion(
  ctx: AppContext,
  input: PromotionPlanInput,
): Promise<PromotionPlan> {
  ctx.require('students.promote')

  if (input.fromSessionId === input.toSessionId) {
    throw conflict('Choose two different sessions')
  }

  const [fromSession, toSession] = await Promise.all([
    ctx.db.academicSession.findFirst({ where: { id: input.fromSessionId } }),
    ctx.db.academicSession.findFirst({ where: { id: input.toSessionId } }),
  ])
  if (!fromSession || !toSession) throw notFound('Academic session')

  const fromClass = await ctx.db.classLevel.findFirst({
    where: { id: input.fromClassLevelId, sessionId: fromSession.id, deletedAt: null },
    select: { id: true, name: true, numeric: true, stream: true },
  })
  if (!fromClass) throw notFound('Class')

  const targetClasses = await getSessionStructure(ctx, toSession.id)

  // The class one rung up. `numeric` is the ladder the whole product orders
  // classes by, so "next" is a lookup rather than a guess at the name.
  const nextClass = targetClasses.find((c) => c.numeric === fromClass.numeric + 1) ?? null
  const repeatClass = targetClasses.find((c) => c.numeric === fromClass.numeric) ?? null

  // No class above this one in the target session: the children in it are
  // finishing school, not moving up.
  const isTerminalClass =
    nextClass === null && !targetClasses.some((c) => c.numeric > fromClass.numeric)

  const enrollments = await ctx.db.enrollment.findMany({
    where: {
      sessionId: fromSession.id,
      classLevelId: fromClass.id,
      ...(input.fromSectionId ? { sectionId: input.fromSectionId } : {}),
      student: { deletedAt: null },
    },
    select: {
      rollNumber: true,
      section: { select: { name: true } },
      classLevel: { select: { name: true } },
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          status: true,
        },
      },
    },
    orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
  })

  const studentIds = enrollments.map((e) => e.student.id)

  // Two aggregate queries for the whole class rather than two per child: a
  // section of forty would otherwise be eighty round trips before the page
  // could render.
  const [dues, placements] = await Promise.all([
    studentIds.length
      ? ctx.db.feeInvoice.groupBy({
          by: ['studentId'],
          where: {
            studentId: { in: studentIds },
            status: { notIn: ['CANCELLED', 'DRAFT'] },
            balanceMinor: { gt: 0 },
          },
          _sum: { balanceMinor: true },
        })
      : Promise.resolve([] as { studentId: string; _sum: { balanceMinor: number | null } }[]),
    studentIds.length
      ? ctx.db.enrollment.findMany({
          where: { sessionId: toSession.id, studentId: { in: studentIds } },
          select: {
            studentId: true,
            classLevel: { select: { name: true } },
            section: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ])

  const duesBy = new Map(dues.map((d) => [d.studentId, d._sum.balanceMinor ?? 0]))
  const placedBy = new Map(
    placements.map((p) => [p.studentId, `${p.classLevel.name} ${p.section.name}`]),
  )

  const candidates: PromotionCandidate[] = enrollments.map((e) => {
    const placedIn = placedBy.get(e.student.id) ?? null
    const sectionName = e.section.name

    // A child who has already left is not promoted by default, and neither is
    // one who is already sitting in the target session.
    const suggestedDecision: PromotionDecision = placedIn
      ? 'SKIP'
      : e.student.status !== 'ACTIVE'
        ? 'SKIP'
        : isTerminalClass
          ? 'GRADUATE'
          : nextClass
            ? 'PROMOTE'
            : 'SKIP'

    const targetClass = suggestedDecision === 'PROMOTE' ? nextClass : null

    return {
      studentId: e.student.id,
      admissionNo: e.student.admissionNo,
      firstName: e.student.firstName,
      lastName: e.student.lastName,
      photoUrl: e.student.photoUrl,
      rollNumber: e.rollNumber,
      className: e.classLevel.name,
      sectionName,
      duesMinor: duesBy.get(e.student.id) ?? 0,
      alreadyPlaced: placedIn !== null,
      placedIn,
      suggestedDecision,
      suggestedClassLevelId: targetClass?.id ?? null,
      suggestedSectionId: targetClass ? suggestSection(targetClass, sectionName) : null,
    }
  })

  const shape = (s: typeof fromSession): PromotionSession => ({
    id: s.id,
    name: s.name,
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    isCurrent: s.isCurrent,
    isLocked: s.isLocked,
    classCount: 0,
  })

  return {
    fromSession: shape(fromSession),
    toSession: shape(toSession),
    nextClass,
    repeatClass,
    targetClasses,
    candidates,
    isTerminalClass,
  }
}

/**
 * Allocates a roll number in a section without colliding with one already
 * issued there.
 *
 * `Enrollment` has a unique index on (section, session, rollNumber), so this
 * is not a nicety — a duplicate would abort the whole transaction and lose the
 * entire class's promotion.
 */
function allocateRoll(used: Set<number>, preferred: number | null): number {
  if (preferred !== null && preferred > 0 && !used.has(preferred)) {
    used.add(preferred)
    return preferred
  }
  let next = 1
  while (used.has(next)) next += 1
  used.add(next)
  return next
}

/**
 * Commits a reviewed plan.
 *
 * Everything happens in one transaction: a promotion that half-applied would
 * leave a school unable to tell which children had been moved and which had
 * not, and the only recovery would be reading the audit log row by row.
 */
export async function applyPromotion(
  ctx: AppContext,
  input: PromotionApplyInput,
): Promise<PromotionResult> {
  ctx.require('students.promote')

  const [fromSession, toSession] = await Promise.all([
    ctx.db.academicSession.findFirst({ where: { id: input.fromSessionId } }),
    ctx.db.academicSession.findFirst({ where: { id: input.toSessionId } }),
  ])
  if (!fromSession || !toSession) throw notFound('Academic session')

  // Locking exists to freeze a finished year. Writing new placements into a
  // locked session, or closing placements inside one, would defeat it.
  if (toSession.isLocked) throw conflict(`${toSession.name} is locked`)
  if (fromSession.isLocked) throw conflict(`${fromSession.name} is locked`)

  const actionable = input.decisions.filter((d) => d.decision !== 'SKIP')
  if (actionable.length === 0) {
    return { promoted: 0, repeated: 0, graduated: 0, transferred: 0, skipped: input.decisions.length, rejected: [] }
  }

  const studentIds = actionable.map((d) => d.studentId)

  // Re-read everything the decision list refers to. The browser chose the
  // targets; it does not get to assert that they exist, belong to this school,
  // or sit in the session being promoted into.
  const [students, currentEnrollments, existingInTarget, targetSections] = await Promise.all([
    ctx.db.student.findMany({
      where: { id: { in: studentIds }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, status: true },
    }),
    ctx.db.enrollment.findMany({
      where: { sessionId: fromSession.id, studentId: { in: studentIds } },
      select: { id: true, studentId: true, rollNumber: true },
    }),
    ctx.db.enrollment.findMany({
      where: { sessionId: toSession.id, studentId: { in: studentIds } },
      select: { studentId: true },
    }),
    ctx.db.section.findMany({
      where: {
        deletedAt: null,
        classLevel: { sessionId: toSession.id, deletedAt: null },
      },
      select: { id: true, name: true, classLevelId: true },
    }),
  ])

  const studentBy = new Map(students.map((s) => [s.id, s]))
  const currentBy = new Map(currentEnrollments.map((e) => [e.studentId, e]))
  const alreadyPlaced = new Set(existingInTarget.map((e) => e.studentId))
  const sectionBy = new Map(targetSections.map((s) => [s.id, s]))

  // Roll numbers already issued in each receiving section, so `continue` picks
  // up after them instead of on top of them.
  const usedRolls = new Map<string, Set<number>>()
  const touchedSections = new Set(
    actionable.map((d) => d.toSectionId).filter((id): id is string => Boolean(id)),
  )
  if (touchedSections.size > 0) {
    const taken = await ctx.db.enrollment.findMany({
      where: { sessionId: toSession.id, sectionId: { in: [...touchedSections] } },
      select: { sectionId: true, rollNumber: true },
    })
    for (const row of taken) {
      if (row.rollNumber === null) continue
      const set = usedRolls.get(row.sectionId) ?? new Set<number>()
      set.add(row.rollNumber)
      usedRolls.set(row.sectionId, set)
    }
  }

  const rejected: PromotionResult['rejected'] = []
  const result: PromotionResult = {
    promoted: 0,
    repeated: 0,
    graduated: 0,
    transferred: 0,
    skipped: input.decisions.length - actionable.length,
    rejected,
  }

  type Move = {
    studentId: string
    decision: PromotionDecision
    closeEnrollmentId: string
    createIn?: { classLevelId: string; sectionId: string; rollNumber: number }
  }
  const moves: Move[] = []

  for (const decision of actionable) {
    const student = studentBy.get(decision.studentId)
    const name = student ? `${student.firstName} ${student.lastName}`.trim() : decision.studentId

    if (!student) {
      rejected.push({ studentId: decision.studentId, name, reason: 'No such student' })
      continue
    }
    const current = currentBy.get(decision.studentId)
    if (!current) {
      rejected.push({
        studentId: decision.studentId,
        name,
        reason: `Not enrolled in ${fromSession.name}`,
      })
      continue
    }
    if (alreadyPlaced.has(decision.studentId)) {
      rejected.push({
        studentId: decision.studentId,
        name,
        reason: `Already placed in ${toSession.name}`,
      })
      continue
    }

    if (decision.decision === 'GRADUATE' || decision.decision === 'TRANSFER_OUT') {
      moves.push({
        studentId: decision.studentId,
        decision: decision.decision,
        closeEnrollmentId: current.id,
      })
      continue
    }

    // PROMOTE and REPEAT both need a real destination in the target session.
    const section = decision.toSectionId ? sectionBy.get(decision.toSectionId) : undefined
    if (!section) {
      rejected.push({ studentId: decision.studentId, name, reason: 'No section chosen' })
      continue
    }
    if (decision.toClassLevelId && section.classLevelId !== decision.toClassLevelId) {
      rejected.push({
        studentId: decision.studentId,
        name,
        reason: 'That section is not in the chosen class',
      })
      continue
    }

    const used = usedRolls.get(section.id) ?? new Set<number>()
    usedRolls.set(section.id, used)
    const rollNumber = allocateRoll(
      used,
      input.rollPolicy === 'keep' ? current.rollNumber : null,
    )

    moves.push({
      studentId: decision.studentId,
      decision: decision.decision,
      closeEnrollmentId: current.id,
      createIn: { classLevelId: section.classLevelId, sectionId: section.id, rollNumber },
    })
  }

  if (moves.length === 0) {
    if (rejected.length > 0) {
      throw new ApiException(
        409,
        'CONFLICT',
        `Nothing could be applied — ${rejected[0]!.reason.toLowerCase()}`,
      )
    }
    return result
  }

  // A promotion into a session that is not yet the school's current one is a
  // placement waiting to start. Only the current session's enrolments are live,
  // and `setCurrentSession` is what flips them over.
  const targetIsLive = toSession.isCurrent
  const now = new Date()

  await ctx.db.$transaction(
    async (tx) => {
      for (const move of moves) {
        if (move.createIn) {
          await tx.enrollment.create({
            data: {
              tenantId: ctx.tenant.id,
              studentId: move.studentId,
              sessionId: toSession.id,
              classLevelId: move.createIn.classLevelId,
              sectionId: move.createIn.sectionId,
              rollNumber: move.createIn.rollNumber,
              isCurrent: targetIsLive,
              joinedOn: now,
            },
          })
        }

        // Leaving is immediate whatever the session dates say; moving up only
        // closes the old placement once the new one is actually live.
        const leaving = move.decision === 'GRADUATE' || move.decision === 'TRANSFER_OUT'
        if (leaving || targetIsLive) {
          await tx.enrollment.update({
            where: { id: move.closeEnrollmentId },
            data: { isCurrent: false, leftOn: now },
          })
        }

        if (move.decision === 'GRADUATE') {
          await tx.student.update({ where: { id: move.studentId }, data: { status: 'ALUMNI' } })
        }
        if (move.decision === 'TRANSFER_OUT') {
          await tx.student.update({
            where: { id: move.studentId },
            data: { status: 'TRANSFERRED' },
          })
        }
      }
    },
    // A full class is a few hundred statements; the default 5s ceiling is not
    // generous enough on a cold connection.
    { timeout: 30_000, maxWait: 10_000 },
  )

  for (const move of moves) {
    if (move.decision === 'PROMOTE') result.promoted += 1
    if (move.decision === 'REPEAT') result.repeated += 1
    if (move.decision === 'GRADUATE') result.graduated += 1
    if (move.decision === 'TRANSFER_OUT') result.transferred += 1
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'student.promote',
    module: 'students',
    entityType: 'AcademicSession',
    entityId: toSession.id,
    summary:
      `${fromSession.name} → ${toSession.name}: ` +
      `${result.promoted} promoted, ${result.repeated} repeated, ` +
      `${result.graduated} graduated, ${result.transferred} transferred out` +
      (rejected.length ? `, ${rejected.length} rejected` : ''),
    after: {
      fromSessionId: fromSession.id,
      toSessionId: toSession.id,
      rollPolicy: input.rollPolicy,
      counts: {
        promoted: result.promoted,
        repeated: result.repeated,
        graduated: result.graduated,
        transferred: result.transferred,
        skipped: result.skipped,
      },
      rejected,
    } as Prisma.InputJsonValue,
  })

  return result
}

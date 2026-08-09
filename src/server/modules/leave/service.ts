import { z } from 'zod'
import { differenceInCalendarDays } from 'date-fns'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate, eachDateInRange, isSundayUTC, toDateInput } from '@/lib/dates'
import { accessibleStudentIds } from '@/server/scope'
import { notify } from '@/server/notifications'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')

export const leaveApplySchema = z
  .object({
    applicantType: z.enum(['STUDENT', 'STAFF']),
    /** Required for a student application; ignored for staff. */
    studentId: z.string().optional(),
    leaveTypeId: z.string().optional(),
    fromDate: isoDate,
    toDate: isoDate,
    reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(600),
    attachmentUrl: z.string().url().optional().or(z.literal('')),
  })
  .refine((v) => attendanceDate(v.toDate) >= attendanceDate(v.fromDate), {
    path: ['toDate'],
    message: 'The end date cannot be before the start date',
  })
  .refine((v) => v.applicantType !== 'STUDENT' || !!v.studentId, {
    path: ['studentId'],
    message: 'Select the student this leave is for',
  })

export type LeaveApplyInput = z.infer<typeof leaveApplySchema>

export const leaveDecisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  decisionNote: z.string().trim().max(400).optional(),
})

export const leaveListFilterSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  applicantType: z.enum(['STUDENT', 'STAFF']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
})

export const LEAVE_SORT_FIELDS = ['fromDate', 'createdAt', 'status'] as const

const MAX_LEAVE_DAYS = 90

/**
 * Files a leave request.
 *
 * Who may apply for whom is decided here, not by the form: a parent may apply
 * only for their own children, a student only for themselves, and staff only
 * for themselves unless they hold `leave.approve` (an office that files on
 * someone's behalf).
 */
export async function applyForLeave(ctx: AppContext, input: LeaveApplyInput) {
  ctx.require('leave.apply')

  const fromDate = attendanceDate(input.fromDate)
  const toDate = attendanceDate(input.toDate)

  const days = differenceInCalendarDays(toDate, fromDate) + 1
  if (days > MAX_LEAVE_DAYS) {
    throw new ApiException(
      400,
      'BAD_REQUEST',
      `Leave cannot exceed ${MAX_LEAVE_DAYS} days in a single request`,
    )
  }

  let studentId: string | null = null
  let staffId: string | null = null

  if (input.applicantType === 'STUDENT') {
    const allowed = await accessibleStudentIds(ctx)
    if (allowed !== null && !allowed.includes(input.studentId!)) {
      throw new ApiException(403, 'FORBIDDEN', 'You cannot apply for leave for this student')
    }
    const student = await ctx.db.student.findFirst({
      where: { id: input.studentId!, deletedAt: null },
      select: { id: true },
    })
    if (!student) throw notFound('Student')
    studentId = student.id
  } else {
    const staff = await ctx.db.staff.findFirst({
      where: { userId: ctx.user.userId, deletedAt: null },
      select: { id: true },
    })
    if (!staff) {
      throw new ApiException(
        409,
        'NO_STAFF_RECORD',
        'Your login is not linked to a staff record, so leave cannot be applied for.',
      )
    }
    staffId = staff.id
  }

  // Overlapping requests would make attendance ambiguous for the same day.
  const overlapping = await ctx.db.leaveRequest.findFirst({
    where: {
      status: { in: ['PENDING', 'APPROVED'] },
      ...(studentId ? { studentId } : { staffId }),
      fromDate: { lte: toDate },
      toDate: { gte: fromDate },
    },
    select: { id: true, fromDate: true, toDate: true, status: true },
  })
  if (overlapping) {
    throw conflict(
      `A ${overlapping.status.toLowerCase()} leave request already covers ${toDateInput(overlapping.fromDate)} to ${toDateInput(overlapping.toDate)}`,
    )
  }

  const created = await ctx.db.leaveRequest.create({
    data: {
      tenantId: ctx.tenant.id,
      applicantType: input.applicantType,
      studentId,
      staffId,
      leaveTypeId: input.leaveTypeId || null,
      fromDate,
      toDate,
      reason: input.reason,
      attachmentUrl: input.attachmentUrl || null,
      status: 'PENDING',
      appliedById: ctx.user.userId,
    },
    include: {
      student: { select: { firstName: true, lastName: true } },
      staff: { select: { firstName: true, lastName: true } },
    },
  })

  const applicant = created.student
    ? `${created.student.firstName} ${created.student.lastName}`
    : created.staff
      ? `${created.staff.firstName} ${created.staff.lastName}`
      : 'Someone'

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'leave.apply',
    module: 'leave',
    entityType: 'LeaveRequest',
    entityId: created.id,
    summary: `${applicant} applied for leave ${input.fromDate} to ${input.toDate} (${days} day${days === 1 ? '' : 's'})`,
    after: created,
  })

  await notifyApprovers(ctx, {
    title: 'New leave request',
    body: `${applicant} has applied for leave from ${input.fromDate} to ${input.toDate}.`,
    linkUrl: `/leave/${created.id}`,
  })

  return created
}

async function notifyApprovers(
  ctx: AppContext,
  message: { title: string; body: string; linkUrl: string },
) {
  const approvers = await ctx.db.user.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      roles: { some: { role: { permissions: { some: { permission: { key: 'leave.approve' } } } } } },
    },
    select: { id: true },
    take: 25,
  })

  await notify(ctx, {
    userIds: approvers.map((a) => a.id),
    eventKey: 'leave.requested',
    ...message,
  })
}

/**
 * Approves or rejects. On approval the covered school days are written to the
 * attendance register as LEAVE, so the register, the percentage and the
 * approval never disagree with each other.
 */
export async function decideLeave(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof leaveDecisionSchema>,
) {
  ctx.require('leave.approve')

  const request = await ctx.db.leaveRequest.findFirst({
    where: { id },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userId: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: { sectionId: true, sessionId: true },
          },
          guardians: { select: { parent: { select: { userId: true } } } },
        },
      },
      staff: { select: { id: true, firstName: true, lastName: true, userId: true } },
    },
  })
  if (!request) throw notFound('Leave request')

  if (request.status !== 'PENDING') {
    throw conflict(`This request was already ${request.status.toLowerCase()}`)
  }

  // Nobody signs off their own leave.
  if (request.appliedById === ctx.user.userId) {
    throw new ApiException(
      403,
      'SELF_APPROVAL',
      'You cannot approve a leave request you submitted yourself',
    )
  }

  const updated = await ctx.db.$transaction(async (tx) => {
    const decided = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: input.status,
        decidedById: ctx.user.userId,
        decidedAt: new Date(),
        decisionNote: input.decisionNote ?? null,
      },
    })

    if (input.status === 'APPROVED' && request.student) {
      const enrollment = request.student.enrollments[0]
      if (enrollment) {
        const days = eachDateInRange(request.fromDate, request.toDate).filter(
          (d) => !isSundayUTC(d),
        )
        for (const onDate of days) {
          await tx.studentAttendance.upsert({
            where: {
              tenantId_studentId_onDate: {
                tenantId: ctx.tenant.id,
                studentId: request.student!.id,
                onDate,
              },
            },
            create: {
              tenantId: ctx.tenant.id,
              studentId: request.student!.id,
              sectionId: enrollment.sectionId,
              sessionId: enrollment.sessionId,
              onDate,
              status: 'LEAVE',
              remarks: 'Approved leave',
            },
            // A day already marked HOLIDAY stays a holiday.
            update: { status: 'LEAVE', remarks: 'Approved leave' },
          })
        }
      }
    }

    if (input.status === 'APPROVED' && request.staff) {
      const days = eachDateInRange(request.fromDate, request.toDate).filter(
        (d) => !isSundayUTC(d),
      )
      for (const onDate of days) {
        await tx.staffAttendance.upsert({
          where: {
            tenantId_staffId_onDate: {
              tenantId: ctx.tenant.id,
              staffId: request.staff!.id,
              onDate,
            },
          },
          create: {
            tenantId: ctx.tenant.id,
            staffId: request.staff!.id,
            onDate,
            status: 'LEAVE',
            source: 'MANUAL',
            remarks: 'Approved leave',
          },
          update: { status: 'LEAVE', remarks: 'Approved leave' },
        })
      }
    }

    return decided
  })

  const applicant = request.student
    ? `${request.student.firstName} ${request.student.lastName}`
    : `${request.staff?.firstName} ${request.staff?.lastName}`

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: input.status === 'APPROVED' ? 'leave.approve' : 'leave.reject',
    module: 'leave',
    entityType: 'LeaveRequest',
    entityId: id,
    summary: `${input.status === 'APPROVED' ? 'Approved' : 'Rejected'} leave for ${applicant} (${toDateInput(request.fromDate)} to ${toDateInput(request.toDate)})`,
    before: { status: request.status },
    after: { status: input.status, note: input.decisionNote },
  })

  const recipients = [
    request.student?.userId,
    request.staff?.userId,
    ...(request.student?.guardians.map((g) => g.parent.userId) ?? []),
    request.appliedById,
  ].filter((v): v is string => !!v)

  await notify(ctx, {
    userIds: recipients,
    eventKey: input.status === 'APPROVED' ? 'leave.approved' : 'leave.rejected',
    title: `Leave ${input.status.toLowerCase()}`,
    body: `Leave for ${applicant} from ${toDateInput(request.fromDate)} to ${toDateInput(request.toDate)} was ${input.status.toLowerCase()}.${input.decisionNote ? ` Note: ${input.decisionNote}` : ''}`,
    linkUrl: `/leave/${id}`,
  })

  return updated
}

/** The applicant may withdraw while the request is still pending. */
export async function cancelLeave(ctx: AppContext, id: string) {
  const request = await ctx.db.leaveRequest.findFirst({ where: { id } })
  if (!request) throw notFound('Leave request')
  if (request.status !== 'PENDING') {
    throw conflict('Only a pending request can be cancelled')
  }
  if (request.appliedById !== ctx.user.userId && !ctx.can('leave.approve')) {
    throw new ApiException(403, 'FORBIDDEN', 'You can only cancel a request you submitted')
  }

  const updated = await ctx.db.leaveRequest.update({
    where: { id },
    data: { status: 'CANCELLED', decidedAt: new Date(), decidedById: ctx.user.userId },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'leave.cancel',
    module: 'leave',
    entityType: 'LeaveRequest',
    entityId: id,
    summary: 'Cancelled a pending leave request',
  })

  return updated
}

export type LeaveRow = {
  id: string
  applicantType: string
  applicantName: string
  applicantDetail: string | null
  leaveType: string | null
  fromDate: Date
  toDate: Date
  days: number
  reason: string
  status: string
  decidedAt: Date | null
  decisionNote: string | null
  createdAt: Date
  canDecide: boolean
}

/**
 * Lists leave requests. A user without `leave.approve` sees only requests they
 * submitted or that belong to their own children — the approval queue is not
 * a directory of who is off sick.
 */
export async function listLeave(
  ctx: AppContext,
  query: ListQuery,
  filter: z.infer<typeof leaveListFilterSchema>,
): Promise<{ rows: LeaveRow[]; total: number }> {
  ctx.require('leave.view')

  const canApprove = ctx.can('leave.approve')
  const ownStudentIds = canApprove ? null : await accessibleStudentIds(ctx)

  const where = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.applicantType ? { applicantType: filter.applicantType } : {}),
    ...(filter.from ? { toDate: { gte: attendanceDate(filter.from) } } : {}),
    ...(filter.to ? { fromDate: { lte: attendanceDate(filter.to) } } : {}),
    ...(canApprove
      ? {}
      : {
          OR: [
            { appliedById: ctx.user.userId },
            ...(ownStudentIds && ownStudentIds.length > 0
              ? [{ studentId: { in: ownStudentIds } }]
              : []),
            { staff: { userId: ctx.user.userId } },
          ],
        }),
  }

  const orderBy = orderByFrom(query.sort, query.dir, LEAVE_SORT_FIELDS, { createdAt: 'desc' })

  const [rows, total] = await Promise.all([
    ctx.db.leaveRequest.findMany({
      where,
      orderBy,
      ...skipTake(query),
      include: {
        leaveType: { select: { name: true } },
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNo: true,
            enrollments: {
              where: { isCurrent: true },
              take: 1,
              select: {
                classLevel: { select: { name: true } },
                section: { select: { name: true } },
              },
            },
          },
        },
        staff: { select: { firstName: true, lastName: true, designation: true } },
      },
    }),
    ctx.db.leaveRequest.count({ where }),
  ])

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      applicantType: r.applicantType,
      applicantName: r.student
        ? `${r.student.firstName} ${r.student.lastName}`
        : r.staff
          ? `${r.staff.firstName} ${r.staff.lastName}`
          : 'Unknown',
      applicantDetail: r.student
        ? [
            r.student.admissionNo,
            r.student.enrollments[0]
              ? `${r.student.enrollments[0].classLevel.name} ${r.student.enrollments[0].section.name}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : (r.staff?.designation ?? null),
      leaveType: r.leaveType?.name ?? null,
      fromDate: r.fromDate,
      toDate: r.toDate,
      days: differenceInCalendarDays(r.toDate, r.fromDate) + 1,
      reason: r.reason,
      status: r.status,
      decidedAt: r.decidedAt,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt,
      // Rendered as a hint; the server still refuses self-approval.
      canDecide: canApprove && r.status === 'PENDING' && r.appliedById !== ctx.user.userId,
    })),
  }
}

export async function leaveTypes(ctx: AppContext, appliesTo: 'STUDENT' | 'STAFF') {
  return ctx.db.leaveType.findMany({
    where: { appliesTo, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, isPaid: true },
  })
}

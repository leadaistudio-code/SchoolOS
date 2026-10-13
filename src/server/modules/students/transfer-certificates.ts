import { z } from 'zod'
import type { Prisma, StudentStatus } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { classInWords, dateToWords } from '@/lib/words'

/* ---------------------------------------------------------------- schemas */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
const text = (max = 200) => z.string().trim().max(max).optional().default('')

/** Every row printed on the certificate. Kept as text so the office can
 *  write "N.A." or a note where the register has no clean value. */
export const tcDetailsSchema = z.object({
  affiliationNo: text(60),
  schoolCode: text(60),
  renewedUpto: text(60),
  studentName: z.string().trim().min(2, 'Enter the student name').max(160),
  motherName: text(160),
  fatherName: text(160),
  nationality: text(60),
  belongsToReserved: text(60),
  dateOfBirth: text(20),
  dateOfBirthWords: text(160),
  admissionDate: text(20),
  admissionClass: text(60),
  lastClass: text(60),
  lastClassWords: text(120),
  examTaken: text(200),
  examResult: text(120),
  failedInSameClass: text(40),
  subjects: text(400),
  qualifiedForPromotion: text(40),
  promotedTo: text(60),
  promotedToWords: text(120),
  feesPaidUpto: text(60),
  feeConcession: text(120),
  workingDays: text(10),
  daysPresent: text(10),
  nccScoutGuide: text(120),
  gamesActivities: text(300),
  generalConduct: text(60),
  remarks: text(500),
})

export type TcDetails = z.infer<typeof tcDetailsSchema>

export const tcIssueSchema = z.object({
  studentId: z.string().min(1, 'Choose a student'),
  bookNo: z.string().trim().max(40).optional().transform((v) => v || null),
  applicationDate: isoDate.optional().or(z.literal('')).transform((v) => v || null),
  issuedOn: isoDate,
  reason: z.string().trim().max(300).optional().transform((v) => v || null),
  disableLogin: z.boolean().default(true),
  details: tcDetailsSchema,
})

export const tcCancelSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, 'Say why the certificate is being cancelled').max(300),
})

/* ---------------------------------------------------------------- helpers */

const actorLabel = (ctx: AppContext) => `${ctx.user.firstName} ${ctx.user.lastName}`.trim()
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')
const fullName = (p: { firstName: string; lastName: string } | null | undefined) =>
  p ? `${p.firstName} ${p.lastName}`.trim() : ''

const SETTINGS_NS = 'transfer_certificate'
const SETTINGS_KEY = 'defaults'

const headerDefaultsSchema = z.object({
  affiliationNo: z.string().default(''),
  schoolCode: z.string().default(''),
  renewedUpto: z.string().default(''),
})

async function headerDefaults(ctx: AppContext) {
  const row = await ctx.db.setting.findFirst({
    where: { namespace: SETTINGS_NS, key: SETTINGS_KEY },
    select: { value: true },
  })
  const parsed = headerDefaultsSchema.safeParse(row?.value ?? {})
  return parsed.success ? parsed.data : headerDefaultsSchema.parse({})
}

/* ---------------------------------------------------------------- prefill */

/**
 * Everything the register already knows about the student, laid out in TC
 * order. The office reviews and edits before issuing.
 */
export async function tcPrefill(ctx: AppContext, studentId: string) {
  ctx.require('students.tc')
  const student = await ctx.db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      status: true,
      userId: true,
      dateOfBirth: true,
      nationality: true,
      category: true,
      admissionDate: true,
      guardians: {
        select: { relation: true, isPrimary: true, parent: { select: { firstName: true, lastName: true } } },
      },
      enrollments: {
        orderBy: { session: { startsOn: 'asc' } },
        select: {
          isCurrent: true,
          sessionId: true,
          joinedOn: true,
          classLevelId: true,
          classLevel: { select: { name: true, numeric: true } },
          section: { select: { name: true } },
          session: { select: { name: true, startsOn: true, endsOn: true } },
        },
      },
    },
  })
  if (!student) throw notFound('Student')

  const current = student.enrollments.find((e) => e.isCurrent) ?? student.enrollments.at(-1) ?? null
  const first = student.enrollments[0] ?? null

  const [subjects, attendance, dues, lastPaid, activeTc, defaults] = await Promise.all([
    current
      ? ctx.db.classSubject.findMany({
          where: { classLevelId: current.classLevelId },
          orderBy: { subject: { name: 'asc' } },
          select: { subject: { select: { name: true } } },
        })
      : Promise.resolve([]),
    current
      ? ctx.db.studentAttendance.groupBy({
          by: ['status'],
          where: { studentId, sessionId: current.sessionId },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    ctx.db.feeInvoice.aggregate({
      where: { studentId, cancelledAt: null, status: { notIn: ['CANCELLED', 'DRAFT', 'PAID'] } },
      _sum: { balanceMinor: true },
    }),
    ctx.db.feeInvoice.findFirst({
      where: { studentId, cancelledAt: null, status: 'PAID' },
      orderBy: { dueOn: 'desc' },
      select: { dueOn: true },
    }),
    ctx.db.transferCertificate.findFirst({
      where: { studentId, status: 'ISSUED' },
      select: { id: true, number: true },
    }),
    headerDefaults(ctx),
  ])

  const count = (s: string) => attendance.find((a) => a.status === s)?._count._all ?? 0
  const workingDays = attendance.reduce((sum, a) => (a.status === 'HOLIDAY' ? sum : sum + a._count._all), 0)
  const present = count('PRESENT') + count('LATE') + count('HALF_DAY') * 0.5

  const guardianName = (relation: 'FATHER' | 'MOTHER') =>
    fullName(student.guardians.find((g) => g.relation === relation)?.parent)

  const nextClass = current ? nextClassName(current.classLevel.name, current.classLevel.numeric) : ''

  const details: TcDetails = {
    affiliationNo: defaults.affiliationNo,
    schoolCode: defaults.schoolCode,
    renewedUpto: defaults.renewedUpto,
    studentName: fullName(student),
    motherName: guardianName('MOTHER'),
    fatherName: guardianName('FATHER') || fullName(student.guardians.find((g) => g.isPrimary)?.parent),
    nationality: student.nationality || 'Indian',
    belongsToReserved: student.category && /^(sc|st|obc)/i.test(student.category) ? student.category : 'No',
    dateOfBirth: iso(student.dateOfBirth),
    dateOfBirthWords: dateToWords(student.dateOfBirth),
    admissionDate: iso(student.admissionDate ?? first?.joinedOn),
    admissionClass: first ? first.classLevel.name : '',
    lastClass: current ? current.classLevel.name : '',
    lastClassWords: current ? classInWords(current.classLevel.name, current.classLevel.numeric) : '',
    examTaken: current ? `Annual examination ${current.session.name}` : '',
    examResult: '',
    failedInSameClass: 'No',
    subjects: subjects.map((s) => s.subject.name).join(', '),
    qualifiedForPromotion: '',
    promotedTo: nextClass,
    promotedToWords: nextClass ? classInWords(nextClass) : '',
    feesPaidUpto: lastPaid ? lastPaid.dueOn.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '',
    feeConcession: 'No',
    workingDays: workingDays ? String(workingDays) : '',
    daysPresent: workingDays ? String(present) : '',
    nccScoutGuide: 'No',
    gamesActivities: '',
    generalConduct: 'Good',
    remarks: '',
  }

  return {
    student: {
      id: student.id,
      admissionNo: student.admissionNo,
      name: fullName(student),
      photoUrl: student.photoUrl,
      status: student.status,
      hasLogin: !!student.userId,
      className: current ? `${current.classLevel.name}${current.section ? ` - ${current.section.name}` : ''}` : null,
    },
    details,
    outstandingMinor: dues._sum.balanceMinor ?? 0,
    activeTc,
  }
}

/** "Class 5" -> "Class 6", "V" -> "VI", "10" -> "11". Pre-primary is left to the office. */
export function nextClassName(name: string, numeric?: number | null): string {
  const m = /^(.*?)(\d{1,2})(\D*)$/.exec(name)
  if (m) {
    const n = Number(m[2])
    return n >= 12 ? '' : `${m[1]}${n + 1}${m[3]}`
  }
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
  const r = /^(.*?\b)(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(\b.*)$/i.exec(name)
  if (r) {
    const idx = romans.indexOf(r[2]!.toUpperCase())
    if (idx >= 0 && idx < 11) return `${r[1]}${romans[idx + 1]}${r[3]}`
    return ''
  }
  if (numeric && numeric >= 1 && numeric < 12) return String(numeric + 1)
  return ''
}

/* ---------------------------------------------------------------- issue / cancel */

export async function issueTransferCertificate(ctx: AppContext, input: unknown) {
  ctx.require('students.tc')
  const data = tcIssueSchema.parse(input)

  const student = await ctx.db.student.findFirst({
    where: { id: data.studentId, deletedAt: null },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, status: true, userId: true },
  })
  if (!student) throw notFound('Student')

  const issuedOn = new Date(`${data.issuedOn}T00:00:00Z`)

  const tc = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    // Serialise per student so two clerks cannot both issue one.
    await tx.$queryRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS locked',
      `${ctx.tenant.id}:tc:${student.id}`,
    )
    const existing = await tx.transferCertificate.findFirst({
      where: { tenantId: ctx.tenant.id, studentId: student.id, status: 'ISSUED' },
      select: { number: true },
    })
    if (existing) throw conflict(`TC ${existing.number} is already issued for this student. Cancel it first to reissue.`)

    const number = await nextDocumentNumber(tx, {
      tenantId: ctx.tenant.id,
      kind: 'TC',
      sessionLabel: financialYearLabel(issuedOn),
    })

    const disable = data.disableLogin && !!student.userId
    const created = await tx.transferCertificate.create({
      data: {
        tenantId: ctx.tenant.id,
        studentId: student.id,
        number,
        bookNo: data.bookNo,
        applicationDate: data.applicationDate ? new Date(`${data.applicationDate}T00:00:00Z`) : null,
        issuedOn,
        reason: data.reason,
        details: data.details,
        previousStatus: student.status,
        loginDisabled: disable,
        issuedById: ctx.user.userId,
        issuedByLabel: actorLabel(ctx),
      },
    })

    await tx.student.update({ where: { id: student.id }, data: { status: 'TRANSFERRED' } })
    await tx.enrollment.updateMany({
      where: { tenantId: ctx.tenant.id, studentId: student.id, isCurrent: true },
      data: { leftOn: issuedOn },
    })

    if (disable) {
      await tx.user.update({ where: { id: student.userId! }, data: { status: 'DISABLED' } })
      await tx.session.updateMany({
        where: { userId: student.userId!, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }

    const header = {
      affiliationNo: data.details.affiliationNo,
      schoolCode: data.details.schoolCode,
      renewedUpto: data.details.renewedUpto,
    }
    await tx.setting.upsert({
      where: { tenantId_namespace_key: { tenantId: ctx.tenant.id, namespace: SETTINGS_NS, key: SETTINGS_KEY } },
      create: { tenantId: ctx.tenant.id, namespace: SETTINGS_NS, key: SETTINGS_KEY, value: header },
      update: { value: header },
    })

    return created
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'students.tc_issue',
    module: 'students',
    entityType: 'TransferCertificate',
    entityId: tc.id,
    summary: `Issued TC ${tc.number} to ${student.firstName} ${student.lastName} (${student.admissionNo})${tc.loginDisabled ? '; login disabled' : ''}`,
    before: { status: student.status },
    after: { status: 'TRANSFERRED', number: tc.number },
  })

  return tc
}

export async function cancelTransferCertificate(ctx: AppContext, input: unknown) {
  ctx.require('students.tc')
  const data = tcCancelSchema.parse(input)

  const tc = await ctx.db.transferCertificate.findFirst({
    where: { id: data.id },
    select: {
      id: true,
      number: true,
      status: true,
      previousStatus: true,
      loginDisabled: true,
      student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, status: true, userId: true } },
    },
  })
  if (!tc) throw notFound('Transfer certificate')
  if (tc.status === 'CANCELLED') throw conflict('This certificate is already cancelled')

  const restoreStatus: StudentStatus = tc.student.status === 'TRANSFERRED' ? tc.previousStatus : tc.student.status

  await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    await tx.transferCertificate.update({
      where: { id: tc.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: data.reason,
        cancelledById: ctx.user.userId,
      },
    })
    await tx.student.update({ where: { id: tc.student.id }, data: { status: restoreStatus } })
    await tx.enrollment.updateMany({
      where: { tenantId: ctx.tenant.id, studentId: tc.student.id, isCurrent: true },
      data: { leftOn: null },
    })
    if (tc.loginDisabled && tc.student.userId) {
      await tx.user.update({ where: { id: tc.student.userId }, data: { status: 'ACTIVE' } })
    }
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'students.tc_cancel',
    module: 'students',
    entityType: 'TransferCertificate',
    entityId: tc.id,
    summary: `Cancelled TC ${tc.number} for ${tc.student.firstName} ${tc.student.lastName}: ${data.reason}`,
    before: { status: 'TRANSFERRED' },
    after: { status: restoreStatus },
  })

  return { number: tc.number }
}

/* ---------------------------------------------------------------- read */

export async function listTransferCertificates(
  ctx: AppContext,
  params: { q?: string; status?: 'ISSUED' | 'CANCELLED' | ''; page?: number },
) {
  ctx.require('students.tc')
  const pageSize = 25
  const page = Math.max(1, params.page ?? 1)
  const q = params.q?.trim()
  const where: Prisma.TransferCertificateWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' } },
            { bookNo: { contains: q, mode: 'insensitive' } },
            { student: { admissionNo: { contains: q, mode: 'insensitive' } } },
            { student: { firstName: { contains: q, mode: 'insensitive' } } },
            { student: { lastName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
  const [rows, total, issued, cancelled, thisYear] = await Promise.all([
    ctx.db.transferCertificate.findMany({
      where,
      orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        bookNo: true,
        issuedOn: true,
        reason: true,
        status: true,
        loginDisabled: true,
        issuedByLabel: true,
        details: true,
        student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, photoUrl: true } },
      },
    }),
    ctx.db.transferCertificate.count({ where }),
    ctx.db.transferCertificate.count({ where: { status: 'ISSUED' } }),
    ctx.db.transferCertificate.count({ where: { status: 'CANCELLED' } }),
    ctx.db.transferCertificate.count({
      where: { status: 'ISSUED', issuedOn: { gte: fyStart(new Date()) } },
    }),
  ])
  return {
    rows: rows.map((r) => ({
      ...r,
      lastClass: (r.details as Partial<TcDetails> | null)?.lastClass ?? '',
    })),
    total,
    page,
    pageSize,
    stats: { issued, cancelled, thisYear },
  }
}

function fyStart(d: Date) {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
  return new Date(Date.UTC(y, 3, 1))
}

export async function getTransferCertificate(ctx: AppContext, id: string) {
  ctx.require('students.tc')
  const tc = await ctx.db.transferCertificate.findFirst({
    where: { id },
    include: {
      student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, photoUrl: true, status: true } },
    },
  })
  if (!tc) throw notFound('Transfer certificate')
  const school = await ctx.db.school.findFirst({
    where: { tenantId: ctx.tenant.id },
    select: {
      name: true,
      legalName: true,
      code: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      email: true,
      website: true,
      branding: { select: { logoUrl: true, signatureUrl: true } },
    },
  })
  const parsed = tcDetailsSchema.safeParse(tc.details)
  return {
    tc,
    details: parsed.success ? parsed.data : (tc.details as unknown as TcDetails),
    school,
  }
}

import QRCode from 'qrcode'
import { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { badRequest, notFound } from '@/server/api/response'
import { prisma } from '@/server/db/prisma'
import { randomToken } from '@/server/crypto'
import { resolveBrandingAssetUrl } from '@/server/branding-assets'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { env } from '@/lib/env'
import { assertLms, actorOf, auditLms } from './access'
import { requireLearner } from './learning'

/**
 * Course certificates. One per enrolment, issued the moment the course is
 * complete. A certificate is never taken back automatically (a course that
 * later gains a lesson stays certified); the school can revoke one by hand.
 */

export function lmsCertificateVerifyUrl(token: string) {
  return `${env().APP_URL.replace(/\/$/, '')}/verify/course/${token}`
}

/** Issues the certificate for a finished enrolment, once. Safe to call repeatedly. */
export async function issueCertificateFor(ctx: AppContext, enrollmentId: string) {
  const existing = await ctx.db.lmsCertificate.findFirst({ where: { enrollmentId } })
  if (existing) return existing
  const enrollment = await ctx.db.lmsEnrollment.findFirst({
    where: { id: enrollmentId, completedAt: { not: null } },
    select: { id: true, courseId: true, studentId: true, completedAt: true },
  })
  if (!enrollment) return null
  const [course, lessons, student, scores] = await Promise.all([
    ctx.db.lmsCourse.findFirst({ where: { id: enrollment.courseId }, select: { title: true, category: true, level: true } }),
    ctx.db.lmsLesson.findMany({ where: { courseId: enrollment.courseId }, select: { durationMinutes: true } }),
    ctx.db.student.findFirst({ where: { id: enrollment.studentId }, select: { firstName: true, lastName: true } }),
    ctx.db.lmsLessonProgress.findMany({
      where: { enrollmentId, completedAt: { not: null }, bestScorePercent: { not: null } },
      select: { bestScorePercent: true },
    }),
  ])
  if (!course || !student) return null

  const issuedAt = new Date()
  try {
    const certificate = await ctx.db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, {
        tenantId: ctx.tenant.id,
        kind: 'LMS_CERTIFICATE',
        sessionLabel: financialYearLabel(issuedAt),
      })
      return tx.lmsCertificate.create({
        data: {
          tenantId: ctx.tenant.id,
          enrollmentId,
          courseId: enrollment.courseId,
          studentId: enrollment.studentId,
          number,
          verifyToken: randomToken(24),
          studentName: `${student.firstName} ${student.lastName}`.trim(),
          courseTitle: course.title,
          courseCategory: course.category,
          courseLevel: course.level,
          lessons: lessons.length,
          minutes: lessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0),
          scorePercent: scores.length
            ? Math.round(scores.reduce((s, p) => s + p.bestScorePercent!, 0) / scores.length)
            : null,
          issuedAt,
        },
      })
    })
    await auditLms(ctx, 'lms.certificate.issue', 'LmsCertificate', certificate.id, `Issued ${certificate.number} for ${course.title}`)
    return certificate
  } catch (err) {
    // Two completions racing for the same enrolment: the other one won.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return ctx.db.lmsCertificate.findFirst({ where: { enrollmentId } })
    }
    throw err
  }
}

/** Courses finished before certificates existed, or whose issue failed, get one now. */
async function issueMissing(ctx: AppContext, studentId?: string) {
  const pending = await ctx.db.lmsEnrollment.findMany({
    where: { completedAt: { not: null }, certificate: { is: null }, ...(studentId ? { studentId } : {}) },
    select: { id: true },
    take: 200,
  })
  for (const e of pending) await issueCertificateFor(ctx, e.id)
}

export async function myCertificates(ctx: AppContext) {
  const learner = await requireLearner(ctx)
  await issueMissing(ctx, learner.id)
  return ctx.db.lmsCertificate.findMany({ where: { studentId: learner.id }, orderBy: { issuedAt: 'desc' } })
}

export async function myCertificate(ctx: AppContext, id: string) {
  const learner = await requireLearner(ctx)
  const row = await ctx.db.lmsCertificate.findFirst({ where: { id, studentId: learner.id } })
  if (!row) throw notFound('Certificate')
  return row
}

export async function listCertificates(ctx: AppContext, filter: { q?: string; status?: 'valid' | 'revoked' } = {}) {
  ctx.require('lms.view')
  await assertLms(ctx)
  await issueMissing(ctx)
  const q = filter.q?.trim()
  const rows = await ctx.db.lmsCertificate.findMany({
    where: {
      ...(filter.status === 'revoked' ? { revokedAt: { not: null } } : filter.status === 'valid' ? { revokedAt: null } : {}),
      ...(q
        ? {
            OR: [
              { studentName: { contains: q, mode: 'insensitive' as const } },
              { courseTitle: { contains: q, mode: 'insensitive' as const } },
              { number: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { issuedAt: 'desc' },
    take: 300,
  })
  const placements = await ctx.db.enrollment.findMany({
    where: { isCurrent: true, studentId: { in: [...new Set(rows.map((r) => r.studentId))] } },
    select: { studentId: true, classLevel: { select: { name: true } }, section: { select: { name: true } }, student: { select: { admissionNo: true } } },
  })
  const byStudent = new Map(placements.map((p) => [p.studentId, p]))
  return rows.map((r) => {
    const p = byStudent.get(r.studentId)
    return {
      ...r,
      admissionNo: p?.student.admissionNo ?? '',
      className: p ? `${p.classLevel.name}${p.section ? ` – ${p.section.name}` : ''}` : '',
    }
  })
}

export async function getCertificate(ctx: AppContext, id: string) {
  ctx.require('lms.view')
  await assertLms(ctx)
  const row = await ctx.db.lmsCertificate.findFirst({ where: { id } })
  if (!row) throw notFound('Certificate')
  return row
}

export async function revokeCertificate(ctx: AppContext, id: string, reason: string) {
  ctx.require('lms.manage')
  await assertLms(ctx)
  const why = reason.trim()
  if (why.length < 3) throw badRequest('Say why the certificate is being revoked')
  const row = await ctx.db.lmsCertificate.findFirst({ where: { id, revokedAt: null } })
  if (!row) throw notFound('Certificate')
  await ctx.db.lmsCertificate.update({
    where: { id },
    data: { revokedAt: new Date(), revokedReason: why.slice(0, 500), revokedByLabel: actorOf(ctx).label },
  })
  await auditLms(ctx, 'lms.certificate.revoke', 'LmsCertificate', id, `Revoked ${row.number}: ${why}`)
  return row
}

export async function restoreCertificate(ctx: AppContext, id: string) {
  ctx.require('lms.manage')
  await assertLms(ctx)
  const row = await ctx.db.lmsCertificate.findFirst({ where: { id, revokedAt: { not: null } } })
  if (!row) throw notFound('Certificate')
  await ctx.db.lmsCertificate.update({ where: { id }, data: { revokedAt: null, revokedReason: null, revokedByLabel: null } })
  await auditLms(ctx, 'lms.certificate.restore', 'LmsCertificate', id, `Restored ${row.number}`)
  return row
}

export type CertificateSchool = { name: string; logoUrl: string | null; signatureUrl: string | null; city: string | null }

async function schoolOf(tenantId: string): Promise<CertificateSchool> {
  const [tenant, school] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.school.findFirst({
      where: { tenantId },
      select: { name: true, city: true, branding: { select: { logoUrl: true, signatureUrl: true } } },
    }),
  ])
  return {
    name: school?.name ?? tenant?.name ?? 'School',
    city: school?.city ?? null,
    logoUrl: resolveBrandingAssetUrl(school?.branding?.logoUrl, 'logo'),
    signatureUrl: resolveBrandingAssetUrl(school?.branding?.signatureUrl, 'signature'),
  }
}

/** Everything the printable certificate needs. */
export async function certificateArtwork(tenantId: string, verifyToken: string) {
  const url = lmsCertificateVerifyUrl(verifyToken)
  const [school, qr] = await Promise.all([
    schoolOf(tenantId),
    QRCode.toDataURL(url, { margin: 0, width: 200, errorCorrectionLevel: 'M' }).catch(() => null),
  ])
  return { school, qr, url }
}

/** Public check from the QR code: no session. */
export async function verifyLmsCertificate(token: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return null
  const row = await prisma.lmsCertificate.findUnique({ where: { verifyToken: token } })
  if (!row) return null
  return { certificate: row, school: await schoolOf(row.tenantId) }
}

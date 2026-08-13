import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { prisma } from '@/server/db/prisma'
import { randomToken } from '@/server/crypto'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { env } from '@/lib/env'
import {
  certificateIssueSchema,
  certificateTemplateSchema,
  renderCertificateBody,
  type CertificateVariables,
} from '@/lib/certificates'
import {
  ensureDefaultCertificateTemplates as upsertCertificateTemplates,
  ensureExamDefaults,
} from '@/server/modules/exams/defaults'

export {
  CERTIFICATE_TEMPLATE_KEYS,
  certificateIssueSchema,
  certificateTemplateSchema,
  renderCertificateBody,
} from '@/lib/certificates'
export type { CertificateVariables } from '@/lib/certificates'

export function certificateVerifyUrl(token: string): string {
  const base = env().APP_URL.replace(/\/$/, '')
  return `${base}/verify/certificate/${token}`
}

/** Idempotent exam artefacts every tenant should have. */
export async function ensureTenantExamSetup(ctx: AppContext) {
  await ensureExamDefaults(ctx.db, ctx.tenant.id)
}

export async function ensureDefaultCertificateTemplates(ctx: AppContext) {
  await upsertCertificateTemplates(ctx.db, ctx.tenant.id)
}

export async function listCertificateTemplates(ctx: AppContext) {
  ctx.require('certificates.view')
  return ctx.db.certificateTemplate.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: { id: true, key: true, name: true, isActive: true, createdAt: true },
  })
}

export async function getCertificateTemplate(ctx: AppContext, id: string) {
  ctx.require('certificates.view')
  const template = await ctx.db.certificateTemplate.findFirst({ where: { id, tenantId: ctx.tenant.id } })
  if (!template) throw notFound('Certificate template')
  return template
}

export async function createCertificateTemplate(
  ctx: AppContext,
  input: z.infer<typeof certificateTemplateSchema>,
) {
  ctx.require('certificates.template')
  const existing = await ctx.db.certificateTemplate.findFirst({
    where: { tenantId: ctx.tenant.id, key: input.key },
  })
  if (existing) throw conflict(`A template with key ${input.key} already exists`)

  const template = await ctx.db.certificateTemplate.create({
    data: {
      tenantId: ctx.tenant.id,
      key: input.key,
      name: input.name,
      bodyHtml: input.bodyHtml,
      isActive: input.isActive,
      variables: ['student_name', 'admission_no', 'class', 'school_name', 'session', 'date', 'purpose'],
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'certificate.template.create',
    module: 'certificates',
    entityType: 'CertificateTemplate',
    entityId: template.id,
    summary: `Created certificate template ${template.name}`,
  })

  return template
}

export async function listCertificates(ctx: AppContext, studentId?: string) {
  ctx.require('certificates.view')
  return ctx.db.certificate.findMany({
    where: {
      tenantId: ctx.tenant.id,
      ...(studentId ? { studentId } : {}),
    },
    orderBy: { issuedOn: 'desc' },
    include: {
      template: { select: { name: true, key: true } },
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNo: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: { classLevel: { select: { name: true } } },
          },
        },
      },
    },
    take: 100,
  })
}

async function studentCertificateVariables(
  ctx: AppContext,
  studentId: string,
  purpose?: string,
): Promise<CertificateVariables> {
  const student = await ctx.db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    include: {
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        include: { classLevel: true, section: true, session: true },
      },
    },
  })
  if (!student) throw notFound('Student')

  const enrollment = student.enrollments[0]
  const classLabel = enrollment
    ? `${enrollment.classLevel.name}${enrollment.section ? ` · ${enrollment.section.name}` : ''}`
    : '—'

  const school = ctx.tenant.school

  return {
    student_name: `${student.firstName} ${student.lastName}`,
    admission_no: student.admissionNo,
    class: classLabel,
    school_name: school?.name ?? ctx.tenant.name,
    session: enrollment?.session.name ?? '—',
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    purpose: purpose?.trim() || 'official purposes',
  }
}

export async function issueCertificate(ctx: AppContext, input: z.infer<typeof certificateIssueSchema>) {
  ctx.require('certificates.issue')

  const template = await ctx.db.certificateTemplate.findFirst({
    where: { id: input.templateId, tenantId: ctx.tenant.id, isActive: true },
  })
  if (!template) throw notFound('Certificate template')

  const variables = await studentCertificateVariables(ctx, input.studentId, input.purpose)
  const renderedBody = renderCertificateBody(template.bodyHtml, variables)
  const verifyToken = randomToken(24)
  const issuedOn = new Date()

  const certificate = await ctx.db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, {
      tenantId: ctx.tenant.id,
      kind: 'CERTIFICATE',
      sessionLabel: financialYearLabel(issuedOn),
    })

    return tx.certificate.create({
      data: {
        tenantId: ctx.tenant.id,
        templateId: template.id,
        studentId: input.studentId,
        number,
        issuedOn,
        verifyToken,
        issuedById: ctx.user.userId,
        data: { variables, renderedBody, purpose: input.purpose ?? null },
      },
      include: {
        template: { select: { name: true, key: true } },
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
      },
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'certificate.issue',
    module: 'certificates',
    entityType: 'Certificate',
    entityId: certificate.id,
    summary: `Issued ${template.name} (${certificate.number}) for ${variables.student_name}`,
  })

  return certificate
}

export async function getCertificate(ctx: AppContext, id: string) {
  ctx.require('certificates.view')
  const certificate = await ctx.db.certificate.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      template: true,
      student: {
        include: {
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            include: { classLevel: true, section: true },
          },
        },
      },
    },
  })
  if (!certificate) throw notFound('Certificate')
  return certificate
}

export async function revokeCertificate(ctx: AppContext, id: string) {
  ctx.require('certificates.issue')
  const certificate = await ctx.db.certificate.findFirst({
    where: { id, tenantId: ctx.tenant.id, revokedAt: null },
  })
  if (!certificate) throw notFound('Certificate')

  const updated = await ctx.db.certificate.update({
    where: { id },
    data: { revokedAt: new Date() },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'certificate.revoke',
    module: 'certificates',
    entityType: 'Certificate',
    entityId: id,
    summary: `Revoked certificate ${certificate.number}`,
  })

  return updated
}

/** Public verification — no tenant session required. */
export async function verifyCertificate(token: string) {
  const certificate = await prisma.certificate.findUnique({
    where: { verifyToken: token },
    include: {
      template: { select: { name: true, key: true } },
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
    },
  })
  if (!certificate) return null

  const tenant = await prisma.tenant.findUnique({
    where: { id: certificate.tenantId },
    select: { name: true, slug: true, school: { select: { name: true } } },
  })

  return { certificate, schoolName: tenant?.school?.name ?? tenant?.name ?? 'School' }
}

export async function certificateIssueSetup(ctx: AppContext) {
  ctx.require('certificates.issue')
  const [templates, students] = await Promise.all([
    ctx.db.certificateTemplate.findMany({
      where: { tenantId: ctx.tenant.id, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, key: true },
    }),
    ctx.db.student.findMany({
      where: { deletedAt: null },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
        enrollments: {
          where: { isCurrent: true },
          take: 1,
          select: { classLevel: { select: { name: true } } },
        },
      },
    }),
  ])

  return {
    templates,
    students: students.map((student) => ({
      id: student.id,
      label: `${student.firstName} ${student.lastName} (${student.admissionNo})${
        student.enrollments[0] ? ` · ${student.enrollments[0].classLevel.name}` : ''
      }`,
    })),
  }
}

import type { PrismaClient } from '@prisma/client'
import { DEFAULT_CERTIFICATE_TEMPLATES } from '@/lib/certificates'

/**
 * Structural DB surface — deliberately not Pick<PrismaClient, …> so tenant
 * extension clients and transaction clients are accepted without casts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const GRADE_BANDS = [
  ['A+', 91, 100, 10, true],
  ['A', 81, 90.99, 9, true],
  ['B+', 71, 80.99, 8, true],
  ['B', 61, 70.99, 7, true],
  ['C', 51, 60.99, 6, true],
  ['D', 33, 50.99, 5, true],
  ['E', 0, 32.99, 0, false],
] as const

const TEMPLATE_VARIABLES = [
  'student_name',
  'admission_no',
  'class',
  'school_name',
  'session',
  'date',
  'purpose',
]

/** Default grading scale, certificate templates and report card layout for a tenant. */
export async function ensureExamDefaults(db: Db, tenantId: string) {
  await ensureDefaultGradingScale(db, tenantId)
  await ensureDefaultCertificateTemplates(db, tenantId)
  await ensureDefaultReportCardTemplate(db, tenantId)
}

export async function ensureDefaultGradingScale(db: Db, tenantId: string) {
  const existing = await db.gradingScale.findFirst({ where: { tenantId } })
  if (existing) return existing

  const scale = await db.gradingScale.create({
    data: { tenantId, name: 'Standard', isDefault: true },
  })

  for (const [grade, min, max, points, isPass] of GRADE_BANDS) {
    await db.gradeBand.create({
      data: {
        tenantId,
        scaleId: scale.id,
        grade,
        minPercent: min,
        maxPercent: max,
        points,
        isPass,
      },
    })
  }

  return scale
}

export async function ensureDefaultCertificateTemplates(db: Db, tenantId: string) {
  for (const template of DEFAULT_CERTIFICATE_TEMPLATES) {
    await db.certificateTemplate.upsert({
      where: { tenantId_key: { tenantId, key: template.key } },
      create: {
        tenantId,
        key: template.key,
        name: template.name,
        bodyHtml: template.bodyHtml,
        isActive: template.isActive,
        variables: TEMPLATE_VARIABLES,
      },
      update: {},
    })
  }
}

export async function ensureDefaultReportCardTemplate(db: Db, tenantId: string) {
  const existing = await db.reportCardTemplate.findFirst({ where: { tenantId } })
  if (existing) return existing

  return db.reportCardTemplate.create({
    data: {
      tenantId,
      name: 'Standard report card',
      isDefault: true,
      showAttendance: true,
      showRank: true,
      showRemarks: true,
      footerHtml: '<p class="text-xs text-ink-subtle">This is a computer-generated report card.</p>',
    },
  })
}

/** Backfill every tenant — run after deploy or from `npm run exam:defaults`. */
export async function ensureExamDefaultsForAllTenants(db: PrismaClient) {
  const tenants = await db.tenant.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: { id: true, slug: true },
  })

  for (const tenant of tenants) {
    await ensureExamDefaults(db, tenant.id)
  }

  return tenants.length
}

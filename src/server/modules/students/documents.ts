import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound } from '@/server/api/response'
import { uploadFile } from '@/server/files'
import { storageProvider } from '@/server/providers'
import { assertStudentAccess, studentScopeWhere } from '@/server/scope'
import { skipTake, type ListQuery } from '@/lib/query'
import { REQUIRED_DOCUMENT_KEYS, EXPIRY_WARNING_DAYS, PROFILE_PHOTO_CATEGORY } from '@/lib/student-documents'
import type { StudentDocumentCreateInput, StudentDocumentFilter } from './schema'

/**
 * Student documents.
 *
 * The file bytes and the record about them are deliberately separate concerns:
 * `server/files.ts` owns the allow-list, the magic-byte check and the storage
 * key, and this module owns what the paper IS — whose it is, what type, whether
 * anyone has checked it, when it stops being valid.
 *
 * Nothing here returns a URL to an object. Downloads go through
 * `/api/v1/files/{key}`, which re-proves the caller may have the file every
 * time, so a leaked key is worth nothing on its own.
 */

export type StudentDocumentRow = {
  id: string
  category: string
  title: string
  storageKey: string
  mimeType: string
  sizeBytes: number
  expiresOn: Date | null
  isVerified: boolean
  createdAt: Date
  uploadedBy: string | null
  student: {
    id: string
    admissionNo: string
    firstName: string
    lastName: string
    className: string | null
    sectionName: string | null
  }
}

function expiryWhere(filter: StudentDocumentFilter): Prisma.DocumentWhereInput {
  if (filter.expiry === 'expired') return { expiresOn: { lt: new Date() } }
  if (filter.expiry === 'soon') {
    const horizon = new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000)
    return { expiresOn: { gte: new Date(), lte: horizon } }
  }
  return {}
}

/**
 * One page of documents.
 *
 * The student filter runs through `studentScopeWhere` as well as the
 * permission check: `documents.view` says a role may read documents, not whose.
 * A parent holding it must still reach only their own child's papers.
 */
export async function listStudentDocuments(
  ctx: AppContext,
  query: ListQuery,
  filter: StudentDocumentFilter,
): Promise<{ rows: StudentDocumentRow[]; total: number }> {
  ctx.require('documents.view')

  const scope = await studentScopeWhere(ctx)

  const where: Prisma.DocumentWhereInput = {
    ownerType: 'STUDENT',
    deletedAt: null,
    studentId: { not: null },
    // The profile avatar is a Document too, but it is not part of the admission
    // file. Kept out of the register with a NOT clause rather than a category
    // equality so it never collides with the optional `filter.category` below.
    NOT: { category: PROFILE_PHOTO_CATEGORY },
    student: {
      deletedAt: null,
      ...scope,
      ...(filter.classLevelId || filter.sectionId
        ? {
            enrollments: {
              some: {
                isCurrent: true,
                ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
                ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
              },
            },
          }
        : {}),
    },
    ...(filter.studentId ? { studentId: filter.studentId } : {}),
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.verified === 'yes' ? { isVerified: true } : {}),
    ...(filter.verified === 'no' ? { isVerified: false } : {}),
    ...expiryWhere(filter),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { student: { firstName: { contains: query.q, mode: 'insensitive' } } },
            { student: { lastName: { contains: query.q, mode: 'insensitive' } } },
            { student: { admissionNo: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    ctx.db.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...skipTake(query),
      select: {
        id: true,
        category: true,
        title: true,
        storageKey: true,
        mimeType: true,
        sizeBytes: true,
        expiresOn: true,
        isVerified: true,
        createdAt: true,
        uploadedById: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
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
      },
    }),
    ctx.db.document.count({ where }),
  ])

  // One lookup for the whole page rather than a join per row: the uploader is
  // a display detail, not something to widen every document query for.
  const uploaderIds = [...new Set(rows.map((r) => r.uploadedById).filter(Boolean))] as string[]
  const uploaders = uploaderIds.length
    ? await ctx.db.user.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const uploaderBy = new Map(
    uploaders.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
  )

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      storageKey: r.storageKey,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      expiresOn: r.expiresOn,
      isVerified: r.isVerified,
      createdAt: r.createdAt,
      uploadedBy: r.uploadedById ? (uploaderBy.get(r.uploadedById) ?? null) : null,
      student: {
        id: r.student!.id,
        admissionNo: r.student!.admissionNo,
        firstName: r.student!.firstName,
        lastName: r.student!.lastName,
        className: r.student!.enrollments[0]?.classLevel.name ?? null,
        sectionName: r.student!.enrollments[0]?.section.name ?? null,
      },
    })),
  }
}

/** Every document held against one student, for the record page. */
export async function listDocumentsForStudent(ctx: AppContext, studentId: string) {
  ctx.require('documents.view')
  await assertStudentAccess(ctx, studentId)

  return ctx.db.document.findMany({
    where: { ownerType: 'STUDENT', studentId, deletedAt: null, NOT: { category: PROFILE_PHOTO_CATEGORY } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      category: true,
      title: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      expiresOn: true,
      isVerified: true,
      createdAt: true,
    },
  })
}

/**
 * Stores a file and the record of it in one step.
 *
 * The upload happens before the row is written, so a rejected file never
 * leaves a Document pointing at nothing. The reverse — a stored object with no
 * row — is the harmless direction: it is unreachable, because every read goes
 * through a row.
 */
export async function uploadStudentDocument(
  ctx: AppContext,
  input: StudentDocumentCreateInput,
  file: File,
) {
  ctx.require('documents.manage')
  await assertStudentAccess(ctx, input.studentId)

  const student = await ctx.db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!student) throw notFound('Student')

  const stored = await uploadFile(ctx, file, 'documents')

  const created = await ctx.db.document.create({
    data: {
      tenantId: ctx.tenant.id,
      ownerType: 'STUDENT',
      studentId: student.id,
      category: input.category,
      title: input.title,
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      expiresOn: input.expiresOn ?? null,
      uploadedById: ctx.user.userId,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'document.upload',
    module: 'documents',
    entityType: 'Document',
    entityId: created.id,
    summary: `Uploaded ${input.title} for ${student.firstName} ${student.lastName}`.trim(),
    after: created,
  })

  return created
}

/**
 * Marks a document as checked against the original.
 *
 * Recorded rather than assumed: "we have a birth certificate on file" and
 * "someone has looked at it next to the child's record" are different claims,
 * and only the second is worth anything at a board inspection.
 */
export async function setDocumentVerified(ctx: AppContext, id: string, isVerified: boolean) {
  ctx.require('documents.manage')

  const before = await ctx.db.document.findFirst({
    where: { id, ownerType: 'STUDENT', deletedAt: null },
    select: { id: true, title: true, studentId: true, isVerified: true },
  })
  if (!before) throw notFound('Document')
  if (before.studentId) await assertStudentAccess(ctx, before.studentId)

  const updated = await ctx.db.document.update({
    where: { id },
    data: { isVerified, verifiedById: isVerified ? ctx.user.userId : null },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: isVerified ? 'document.verify' : 'document.unverify',
    module: 'documents',
    entityType: 'Document',
    entityId: id,
    summary: `${isVerified ? 'Verified' : 'Unverified'} ${before.title}`,
    before,
    after: updated,
  })

  return updated
}

/**
 * Removes a document.
 *
 * The row is soft-deleted and the object is dropped from storage. Keeping the
 * row is what preserves the audit trail — that this document existed, who put
 * it there and who removed it — while the bytes themselves genuinely go, which
 * is what a deletion request under a privacy policy actually asks for.
 */
export async function deleteStudentDocument(ctx: AppContext, id: string) {
  ctx.require('documents.manage')

  const doc = await ctx.db.document.findFirst({
    where: { id, ownerType: 'STUDENT', deletedAt: null },
    select: { id: true, title: true, storageKey: true, studentId: true },
  })
  if (!doc) throw notFound('Document')
  if (doc.studentId) await assertStudentAccess(ctx, doc.studentId)

  await ctx.db.document.update({ where: { id }, data: { deletedAt: new Date() } })
  // Best effort: the record is already gone from every screen, and a storage
  // object nothing references is unreachable rather than exposed.
  await storageProvider().delete(doc.storageKey).catch(() => undefined)

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'document.delete',
    module: 'documents',
    entityType: 'Document',
    entityId: id,
    summary: `Deleted ${doc.title}`,
    before: doc,
  })
}

export type CoverageRow = {
  studentId: string
  admissionNo: string
  firstName: string
  lastName: string
  className: string | null
  sectionName: string | null
  /** Required categories with nothing on file. */
  missing: string[]
  /** Categories on file whose expiry has passed. */
  expired: string[]
  held: number
}

/**
 * The missing-document report.
 *
 * Answers the question a school is actually asked before an inspection —
 * "whose file is incomplete?" — rather than listing what is present. Scoped to
 * one class at a time because that is the unit a class teacher can act on; a
 * whole-school list of gaps is a number, not a task.
 */
export async function documentCoverage(
  ctx: AppContext,
  filter: { classLevelId?: string; sectionId?: string },
): Promise<CoverageRow[]> {
  ctx.require('documents.view')

  const scope = await studentScopeWhere(ctx)

  const students = await ctx.db.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ...scope,
      ...(filter.classLevelId || filter.sectionId
        ? {
            enrollments: {
              some: {
                isCurrent: true,
                ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
                ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
              },
            },
          }
        : {}),
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    // A guard, not a page: the report is meant to be run per class, and the
    // screen says so when it truncates.
    take: 400,
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        select: {
          classLevel: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
      documents: {
        where: { ownerType: 'STUDENT', deletedAt: null, NOT: { category: PROFILE_PHOTO_CATEGORY } },
        select: { category: true, expiresOn: true },
      },
    },
  })

  const now = new Date()

  return students.map((s) => {
    const held = new Set(s.documents.map((d) => d.category))
    return {
      studentId: s.id,
      admissionNo: s.admissionNo,
      firstName: s.firstName,
      lastName: s.lastName,
      className: s.enrollments[0]?.classLevel.name ?? null,
      sectionName: s.enrollments[0]?.section.name ?? null,
      missing: REQUIRED_DOCUMENT_KEYS.filter((k) => !held.has(k)),
      expired: [
        ...new Set(
          s.documents
            .filter((d) => d.expiresOn !== null && d.expiresOn < now)
            .map((d) => d.category),
        ),
      ],
      held: s.documents.length,
    }
  })
}

/** Students a document can be filed against, for the upload picker. */
export async function documentStudentOptions(
  ctx: AppContext,
  search: string | undefined,
): Promise<{ id: string; label: string }[]> {
  ctx.require('documents.view')
  const scope = await studentScopeWhere(ctx)

  const students = await ctx.db.student.findMany({
    where: {
      deletedAt: null,
      ...scope,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { admissionNo: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 50,
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        select: {
          classLevel: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
  })

  return students.map((s) => {
    const placement = s.enrollments[0]
    const where = placement ? ` — ${placement.classLevel.name} ${placement.section.name}` : ''
    return {
      id: s.id,
      label: `${s.firstName} ${s.lastName}`.trim() + ` (${s.admissionNo})${where}`,
    }
  })
}

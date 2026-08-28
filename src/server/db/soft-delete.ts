import { conflict } from '@/server/api/response'

/**
 * Helper for creating records on models that use soft-delete (`deletedAt`)
 * AND have a unique constraint that doesn't exclude soft-deleted rows.
 *
 * Problem:
 *   1. App checks `findFirst({ where: { ...uniqueFields, deletedAt: null } })`
 *   2. No active record found → proceeds to `create()`
 *   3. DB-level unique constraint rejects the INSERT because a soft-deleted
 *      row with the same unique fields still exists.
 *
 * Solution:
 *   This helper checks for ANY matching record (including soft-deleted),
 *   and either throws a conflict, restores the soft-deleted record, or
 *   creates a new one.
 *
 * Models affected (have both `deletedAt` and `@@unique`):
 *   ClassLevel, Section, Subject, Curriculum, Student, Staff, LeaveType,
 *   FeeHead, FeeStructure, FeedbackTemplate, Book, Asset, AdmissionLead,
 *   Bus, Route, User
 *
 * @example
 *   const created = await findOrRestore({
 *     model: ctx.db.classLevel,
 *     where: { tenantId: ctx.tenant.id, sessionId: session.id, name: input.name },
 *     createData: { tenantId: ctx.tenant.id, sessionId: session.id, ...input },
 *     restoreData: { numeric: input.numeric, stream: input.stream },
 *     conflictMsg: `${input.name} already exists in ${session.name}`,
 *   })
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPrismaDelegate = any

export async function findOrRestore({
  model,
  where,
  createData,
  restoreData,
  conflictMsg,
}: {
  /** Prisma delegate (e.g. ctx.db.classLevel) */
  model: AnyPrismaDelegate
  /** Unique constraint fields to search by (do NOT include deletedAt) */
  where: Record<string, unknown>
  /** Full data for creating a brand-new record */
  createData: Record<string, unknown>
  /** Partial data to apply when restoring a soft-deleted record (the fields that may have changed) */
  restoreData: Record<string, unknown>
  /** Human-readable message for the conflict error */
  conflictMsg: string
}) {
  const existing: { id: string; deletedAt: Date | null } | null = await model.findFirst({ where })

  // Active record → conflict
  if (existing && !existing.deletedAt) {
    throw conflict(conflictMsg)
  }

  // Soft-deleted record → restore it with fresh data
  if (existing) {
    return model.update({
      where: { id: existing.id },
      data: { ...restoreData, deletedAt: null },
    })
  }

  // No record at all → create
  return model.create({ data: createData })
}

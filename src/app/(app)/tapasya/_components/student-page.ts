import { redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import type { AppContext } from '@/server/context'
import type { CurrentStudent } from '@/server/modules/tapasya/people'

export async function findStudent(ctx: AppContext): Promise<CurrentStudent | null> {
  if (!ctx.can('tapasya.use')) return null
  const student = await ctx.db.student.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, userId: true, firstName: true, lastName: true },
  })
  return student?.userId ? { ...student, userId: student.userId } : null
}

/**
 * Resolves the signed-in student for a Tapasya student page. Anyone else is
 * sent to the Tapasya screen that fits their role instead of an error.
 */
export async function requireStudentPage(): Promise<{ ctx: AppContext; student: CurrentStudent }> {
  const ctx = await requireContext()
  const student = await findStudent(ctx)
  if (student) return { ctx, student }
  if (ctx.can('tapasya.guardian') && ctx.user.roleKeys.includes('PARENT')) redirect('/tapasya/guardian')
  if (ctx.can('tapasya.teach')) redirect('/tapasya/teach')
  if (ctx.can('tapasya.manage')) redirect('/tapasya/settings')
  redirect('/403')
}

import { prisma } from '@/server/db/prisma'
import { isAcademy } from './academy-tenant'

/** First N lessons are free on paid Academy courses; the rest unlock after payment. */
export const ACADEMY_FREE_LESSON_COUNT = 3
/** Default unlock price for freemium Academy courses (₹499). */
export const ACADEMY_UNLOCK_PRICE_MINOR = 49_900

export async function hasPaidAcademyCourse(tenantId: string, studentId: string, courseId: string) {
  const paid = await prisma.lmsAcademyOrder.findFirst({
    where: { tenantId, studentId, courseId, status: 'PAID' },
    select: { id: true },
  })
  return !!paid
}

/** Flat lesson index (0-based) across modules in order. */
export function academyLessonIndex(modules: { lessons: { id: string }[] }[], lessonId: string) {
  const order = modules.flatMap((m) => m.lessons.map((l) => l.id))
  return order.indexOf(lessonId)
}

export function academyLessonUnlocked(input: {
  priceMinor: number | null
  paid: boolean
  lessonIndex: number
  freeCount?: number
}) {
  const price = input.priceMinor ?? 0
  if (price <= 0 || input.paid) return true
  const free = input.freeCount ?? ACADEMY_FREE_LESSON_COUNT
  return input.lessonIndex >= 0 && input.lessonIndex < free
}

/** Server-side gate for Academy freemium lesson access. */
export async function assertAcademyLessonAccess(
  tenant: { id: string; slug: string },
  studentId: string,
  course: { id: string; academyPriceMinor: number | null; modules: { lessons: { id: string }[] }[] },
  lessonId: string,
) {
  if (!isAcademy(tenant)) return { paid: true, unlocked: true, lessonIndex: academyLessonIndex(course.modules, lessonId) }
  const price = course.academyPriceMinor ?? 0
  if (price <= 0) return { paid: true, unlocked: true, lessonIndex: academyLessonIndex(course.modules, lessonId) }
  const paid = await hasPaidAcademyCourse(tenant.id, studentId, course.id)
  const lessonIndex = academyLessonIndex(course.modules, lessonId)
  const unlocked = academyLessonUnlocked({ priceMinor: price, paid, lessonIndex })
  return { paid, unlocked, lessonIndex }
}

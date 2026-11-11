import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/prisma'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { CODE_LANGUAGES, LMS_CATEGORIES, LMS_LESSON_KINDS, type Quiz } from '@/lib/lms/options'
import { isHttpUrl, videoEmbedUrl, videoFileUrl } from '@/lib/lms/media'

/**
 * Course authoring, shared by the platform console (owner tenantId null: the
 * MyCampusView catalogue) and schools (owner tenantId: their own courses).
 *
 * Uses the unscoped client on purpose and pins every query to the owner, so a
 * school can read catalogue courses through its tenant client but can never
 * write one here.
 */

export type CourseOwner = { tenantId: string | null }
export type Actor = { id: string; label: string }

const text = (max: number) => z.string().trim().max(max)
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined))
const optionalInt = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).optional().or(z.literal('').transform(() => undefined))

export const courseSchema = z
  .object({
    title: text(140).min(3, 'Give the course a title'),
    subtitle: optionalText(200),
    description: optionalText(4000),
    category: z.enum(LMS_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
    level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
    gradeFrom: optionalInt(1, 12),
    gradeTo: optionalInt(1, 12),
    /** One outcome per line. */
    outcomes: z.string().max(3000).optional().default(''),
  })
  .superRefine((v, issue) => {
    if (v.gradeFrom && v.gradeTo && v.gradeFrom > v.gradeTo) {
      issue.addIssue({ code: 'custom', path: ['gradeTo'], message: 'The last class must be the same as or after the first' })
    }
  })

export type CourseInput = z.input<typeof courseSchema>

const quizSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        prompt: text(1000).min(1, 'Every question needs a question'),
        multiple: z.boolean().default(false),
        options: z
          .array(z.object({ id: z.string().min(1).max(40), text: text(300).min(1, 'Options cannot be blank'), correct: z.boolean() }))
          .min(2, 'Every question needs at least two options')
          .max(6),
        explanation: optionalText(1000),
      }),
    )
    .min(1, 'Add at least one question')
    .max(50),
})

export const lessonSchema = z
  .object({
    title: text(140).min(2, 'Give the lesson a title'),
    kind: z.enum(LMS_LESSON_KINDS.map((k) => k.value) as [string, ...string[]]),
    durationMinutes: optionalInt(1, 600),
    videoUrl: optionalText(500),
    body: optionalText(20000),
    documentUrl: optionalText(500),
    codeLanguage: z.enum(CODE_LANGUAGES).optional(),
    code: z.string().max(20000).optional().or(z.literal('').transform(() => undefined)),
    quiz: quizSchema.optional(),
    passPercent: z.coerce.number().int().min(0).max(100).default(60),
  })
  .superRefine((v, issue) => {
    if (v.kind === 'VIDEO' && !videoEmbedUrl(v.videoUrl) && !videoFileUrl(v.videoUrl)) {
      issue.addIssue({ code: 'custom', path: ['videoUrl'], message: 'Paste a YouTube or Vimeo link, or a link to an .mp4 file' })
    }
    if (v.kind === 'DOCUMENT' && !(v.documentUrl && isHttpUrl(v.documentUrl))) {
      issue.addIssue({ code: 'custom', path: ['documentUrl'], message: 'Paste a link to the PDF, Google Drive file or slides' })
    }
    if ((v.kind === 'TEXT' || v.kind === 'PROJECT') && !v.body) {
      issue.addIssue({ code: 'custom', path: ['body'], message: v.kind === 'PROJECT' ? 'Write the project brief' : 'Write the lesson' })
    }
    if (v.kind === 'CODE' && !v.code) issue.addIssue({ code: 'custom', path: ['code'], message: 'Paste the code' })
    if (v.kind === 'QUIZ') {
      if (!v.quiz) {
        issue.addIssue({ code: 'custom', path: ['quiz'], message: 'Add at least one question' })
        return
      }
      v.quiz.questions.forEach((q, i) => {
        const right = q.options.filter((o) => o.correct).length
        if (right === 0) issue.addIssue({ code: 'custom', path: ['quiz', 'questions', i], message: `Mark the correct answer for question ${i + 1}` })
        if (!q.multiple && right > 1) {
          issue.addIssue({ code: 'custom', path: ['quiz', 'questions', i], message: `Question ${i + 1} allows one answer but has ${right} marked correct` })
        }
      })
    }
  })

export type LessonInput = z.input<typeof lessonSchema>

function outcomeLines(raw: string) {
  return raw
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 12)
}

async function ownCourse(owner: CourseOwner, id: string) {
  const course = await prisma.lmsCourse.findFirst({ where: { id, tenantId: owner.tenantId, deletedAt: null } })
  if (!course) throw notFound('Course')
  return course
}

async function ownModule(owner: CourseOwner, id: string) {
  const module = await prisma.lmsModule.findFirst({
    where: { id, tenantId: owner.tenantId, course: { deletedAt: null } },
  })
  if (!module) throw notFound('Module')
  return module
}

async function ownLesson(owner: CourseOwner, id: string) {
  const lesson = await prisma.lmsLesson.findFirst({
    where: { id, tenantId: owner.tenantId, course: { deletedAt: null } },
  })
  if (!lesson) throw notFound('Lesson')
  return lesson
}

export async function listOwnCourses(owner: CourseOwner) {
  return prisma.lmsCourse.findMany({
    where: { tenantId: owner.tenantId, deletedAt: null },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    include: { _count: { select: { lessons: true, modules: true } } },
  })
}

export async function createCourse(owner: CourseOwner, actor: Actor, input: CourseInput) {
  const data = courseSchema.parse(input)
  return prisma.lmsCourse.create({
    data: {
      tenantId: owner.tenantId,
      title: data.title,
      subtitle: data.subtitle ?? null,
      description: data.description ?? null,
      category: data.category,
      level: data.level as Prisma.LmsCourseCreateInput['level'],
      gradeFrom: data.gradeFrom ?? null,
      gradeTo: data.gradeTo ?? null,
      outcomes: outcomeLines(data.outcomes),
      createdById: actor.id,
      createdByLabel: actor.label,
      modules: { create: { tenantId: owner.tenantId, title: 'Getting started', position: 1 } },
    },
    select: { id: true, title: true },
  })
}

export async function updateCourse(owner: CourseOwner, id: string, input: CourseInput) {
  await ownCourse(owner, id)
  const data = courseSchema.parse(input)
  return prisma.lmsCourse.update({
    where: { id },
    data: {
      title: data.title,
      subtitle: data.subtitle ?? null,
      description: data.description ?? null,
      category: data.category,
      level: data.level as Prisma.LmsCourseUpdateInput['level'],
      gradeFrom: data.gradeFrom ?? null,
      gradeTo: data.gradeTo ?? null,
      outcomes: outcomeLines(data.outcomes),
    },
    select: { id: true, title: true },
  })
}

export async function setCourseStatus(owner: CourseOwner, id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
  const course = await ownCourse(owner, id)
  if (status === 'PUBLISHED') {
    const lessons = await prisma.lmsLesson.count({ where: { courseId: id } })
    if (lessons === 0) throw badRequest('Add at least one lesson before publishing')
  }
  return prisma.lmsCourse.update({
    where: { id },
    data: { status, ...(status === 'PUBLISHED' && !course.publishedAt ? { publishedAt: new Date() } : {}) },
    select: { id: true, title: true, status: true },
  })
}

/** Soft delete: students' progress on it is kept. */
export async function deleteCourse(owner: CourseOwner, id: string) {
  const course = await ownCourse(owner, id)
  await prisma.lmsCourse.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } })
  return course
}

export async function getCourseForEditing(owner: CourseOwner, id: string) {
  const course = await prisma.lmsCourse.findFirst({
    where: { id, tenantId: owner.tenantId, deletedAt: null },
    include: {
      modules: {
        orderBy: { position: 'asc' },
        include: {
          lessons: {
            orderBy: { position: 'asc' },
            select: { id: true, title: true, kind: true, durationMinutes: true, position: true },
          },
        },
      },
    },
  })
  if (!course) throw notFound('Course')
  return course
}

export async function addModule(owner: CourseOwner, courseId: string, title: string) {
  await ownCourse(owner, courseId)
  const name = text(140).min(2, 'Give the module a name').parse(title)
  const last = await prisma.lmsModule.aggregate({ where: { courseId }, _max: { position: true } })
  return prisma.lmsModule.create({
    data: { tenantId: owner.tenantId, courseId, title: name, position: (last._max.position ?? 0) + 1 },
    select: { id: true, title: true },
  })
}

export async function renameModule(owner: CourseOwner, id: string, title: string, summary?: string) {
  await ownModule(owner, id)
  const name = text(140).min(2, 'Give the module a name').parse(title)
  return prisma.lmsModule.update({
    where: { id },
    data: { title: name, summary: optionalText(500).parse(summary ?? '') ?? null },
    select: { id: true, title: true },
  })
}

export async function deleteModule(owner: CourseOwner, id: string) {
  const module = await ownModule(owner, id)
  const modules = await prisma.lmsModule.count({ where: { courseId: module.courseId } })
  if (modules <= 1) throw conflict('A course needs at least one module. Rename this one instead.')
  await prisma.lmsModule.delete({ where: { id } })
  return module
}

async function swapPositions(
  rows: { id: string; position: number }[],
  id: string,
  direction: 'up' | 'down',
  update: (tx: Prisma.TransactionClient, id: string, position: number) => Promise<unknown>,
) {
  const index = rows.findIndex((r) => r.id === id)
  const other = rows[direction === 'up' ? index - 1 : index + 1]
  const self = rows[index]
  if (!self || !other) return false
  await prisma.$transaction(async (tx) => {
    await update(tx, self.id, other.position)
    await update(tx, other.id, self.position)
  })
  return true
}

export async function moveModule(owner: CourseOwner, id: string, direction: 'up' | 'down') {
  const module = await ownModule(owner, id)
  const rows = await prisma.lmsModule.findMany({
    where: { courseId: module.courseId },
    orderBy: { position: 'asc' },
    select: { id: true, position: true },
  })
  return swapPositions(rows, id, direction, (tx, rowId, position) =>
    tx.lmsModule.update({ where: { id: rowId }, data: { position } }),
  )
}

function lessonData(data: z.infer<typeof lessonSchema>) {
  const kind = data.kind
  return {
    title: data.title,
    kind: kind as Prisma.LmsLessonCreateInput['kind'],
    durationMinutes: data.durationMinutes ?? null,
    videoUrl: kind === 'VIDEO' ? data.videoUrl ?? null : null,
    body: data.body ?? null,
    documentUrl: kind === 'DOCUMENT' ? data.documentUrl ?? null : null,
    codeLanguage: kind === 'CODE' ? data.codeLanguage ?? 'python' : null,
    code: kind === 'CODE' ? data.code ?? null : null,
    quiz: kind === 'QUIZ' && data.quiz ? (data.quiz as Quiz as unknown as Prisma.InputJsonValue) : undefined,
    passPercent: data.passPercent,
  }
}

export async function createLesson(owner: CourseOwner, moduleId: string, input: LessonInput) {
  const module = await ownModule(owner, moduleId)
  const data = lessonSchema.parse(input)
  const last = await prisma.lmsLesson.aggregate({ where: { moduleId }, _max: { position: true } })
  return prisma.lmsLesson.create({
    data: {
      ...lessonData(data),
      tenantId: owner.tenantId,
      courseId: module.courseId,
      moduleId,
      position: (last._max.position ?? 0) + 1,
    },
    select: { id: true, title: true, courseId: true },
  })
}

export async function getLessonForEditing(owner: CourseOwner, id: string) {
  const lesson = await ownLesson(owner, id)
  const course = await prisma.lmsCourse.findUniqueOrThrow({ where: { id: lesson.courseId }, select: { id: true, title: true, status: true } })
  const module = await prisma.lmsModule.findUniqueOrThrow({ where: { id: lesson.moduleId }, select: { id: true, title: true } })
  return { lesson, course, module }
}

export async function updateLesson(owner: CourseOwner, id: string, input: LessonInput) {
  await ownLesson(owner, id)
  const data = lessonSchema.parse(input)
  const values = lessonData(data)
  return prisma.lmsLesson.update({
    where: { id },
    data: { ...values, quiz: values.quiz ?? Prisma.DbNull },
    select: { id: true, title: true, courseId: true },
  })
}

export async function moveLesson(owner: CourseOwner, id: string, direction: 'up' | 'down') {
  const lesson = await ownLesson(owner, id)
  const rows = await prisma.lmsLesson.findMany({
    where: { moduleId: lesson.moduleId },
    orderBy: { position: 'asc' },
    select: { id: true, position: true },
  })
  return swapPositions(rows, id, direction, (tx, rowId, position) =>
    tx.lmsLesson.update({ where: { id: rowId }, data: { position } }),
  )
}

export async function deleteLesson(owner: CourseOwner, id: string) {
  const lesson = await ownLesson(owner, id)
  await prisma.lmsLesson.delete({ where: { id } })
  return lesson
}

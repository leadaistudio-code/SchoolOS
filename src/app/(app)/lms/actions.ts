'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import { assertLms, actorOf } from '@/server/modules/lms/access'
import { authoring, lmsFail } from '@/server/modules/lms/authoring'
import { assignCourse, removeAssignment, visibleCourse } from '@/server/modules/lms/school'
import { completeLesson, quizAnswersSchema, saveLessonState, submitQuiz } from '@/server/modules/lms/learning'
import { submitProject, uploadProjectFile } from '@/server/modules/lms/projects'
import { lessonChat, type AiChatReply } from '@/server/modules/lms/ai-chat'
import { gradeQuiz, type Quiz } from '@/lib/lms/options'
import type { LmsResult, QuizActionResult } from '@/components/lms/types'

async function school() {
  const ctx = await requireContext('lms.manage')
  await assertLms(ctx)
  return { ctx, owner: { tenantId: ctx.tenant.id }, actor: actorOf(ctx) }
}

function done(result: LmsResult) {
  if (result.ok) revalidatePath('/lms', 'layout')
  return result
}

export async function createCourseAction(input: unknown) {
  const { owner, actor } = await school()
  return done(await authoring.createCourse(owner, actor, input))
}
export async function updateCourseAction(id: string, input: unknown) {
  const { owner } = await school()
  return done(await authoring.updateCourse(owner, id, input))
}
export async function setCourseStatusAction(id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
  const { owner } = await school()
  return done(await authoring.setCourseStatus(owner, id, status))
}
export async function deleteCourseAction(id: string) {
  const { owner } = await school()
  return done(await authoring.deleteCourse(owner, id))
}
export async function addModuleAction(courseId: string, title: string) {
  const { owner } = await school()
  return done(await authoring.addModule(owner, courseId, title))
}
export async function renameModuleAction(id: string, title: string) {
  const { owner } = await school()
  return done(await authoring.renameModule(owner, id, title))
}
export async function moveModuleAction(id: string, direction: 'up' | 'down') {
  const { owner } = await school()
  return done(await authoring.moveModule(owner, id, direction))
}
export async function deleteModuleAction(id: string) {
  const { owner } = await school()
  return done(await authoring.deleteModule(owner, id))
}
export async function createLessonAction(moduleId: string, input: unknown) {
  const { owner } = await school()
  return done(await authoring.createLesson(owner, moduleId, input))
}
export async function updateLessonAction(id: string, input: unknown) {
  const { owner } = await school()
  return done(await authoring.updateLesson(owner, id, input))
}
export async function moveLessonAction(id: string, direction: 'up' | 'down') {
  const { owner } = await school()
  return done(await authoring.moveLesson(owner, id, direction))
}
export async function deleteLessonAction(id: string) {
  const { owner } = await school()
  return done(await authoring.deleteLesson(owner, id))
}

export async function assignCourseAction(courseId: string, input: { classLevelId?: string; sectionId?: string }): Promise<LmsResult> {
  const ctx = await requireContext('lms.manage')
  try {
    await assignCourse(ctx, courseId, input)
    revalidatePath('/lms', 'layout')
    revalidatePath('/my/learning', 'layout')
    return { ok: true, message: 'Students can now start this course.' }
  } catch (err) {
    return lmsFail(err, 'The course could not be opened')
  }
}

export async function removeAssignmentAction(id: string): Promise<LmsResult> {
  const ctx = await requireContext('lms.manage')
  try {
    await removeAssignment(ctx, id)
    revalidatePath('/lms', 'layout')
    revalidatePath('/my/learning', 'layout')
    return { ok: true, message: 'Closed. Students who already started keep their progress.' }
  } catch (err) {
    return lmsFail(err, 'The course could not be closed')
  }
}

export async function completeLessonAction(courseId: string, lessonId: string): Promise<LmsResult & { courseComplete?: boolean }> {
  const ctx = await requireContext('lms.learn')
  try {
    const result = await completeLesson(ctx, courseId, lessonId)
    revalidatePath(`/my/learning/${courseId}`, 'layout')
    revalidatePath('/my/learning')
    return {
      ok: true,
      courseComplete: result.complete,
      message: result.complete ? 'Course complete. Well done!' : `Lesson done · ${result.done} of ${result.total}`,
    }
  } catch (err) {
    return lmsFail(err, 'Could not save your progress')
  }
}

export async function submitQuizAction(courseId: string, lessonId: string, answers: unknown): Promise<QuizActionResult> {
  const ctx = await requireContext('lms.learn')
  try {
    const { courseComplete, ...result } = await submitQuiz(ctx, courseId, lessonId, answers)
    revalidatePath(`/my/learning/${courseId}`, 'layout')
    revalidatePath('/my/learning')
    return { ok: true, result, courseComplete }
  } catch (err) {
    return lmsFail(err, 'Your answers could not be checked') as { ok: false; message: string }
  }
}

export async function submitProjectAction(courseId: string, lessonId: string, input: unknown): Promise<LmsResult> {
  const ctx = await requireContext('lms.learn')
  try {
    const saved = await submitProject(ctx, courseId, lessonId, input as never)
    revalidatePath(`/my/learning/${courseId}`, 'layout')
    revalidatePath('/lms/reviews')
    return { ok: true, message: saved.version > 1 ? 'Sent again for review.' : 'Sent to your teacher for review.' }
  } catch (err) {
    return lmsFail(err, 'Your project could not be sent')
  }
}

export async function uploadProjectFileAction(
  courseId: string,
  lessonId: string,
  form: FormData,
): Promise<{ ok: true; key: string; name: string } | { ok: false; message: string }> {
  const ctx = await requireContext('lms.learn')
  try {
    const file = form.get('file')
    if (!(file instanceof File)) return { ok: false, message: 'Choose a file to upload' }
    const saved = await uploadProjectFile(ctx, courseId, lessonId, file)
    return { ok: true, key: saved.key, name: saved.name }
  } catch (err) {
    return lmsFail(err, 'The file could not be uploaded') as { ok: false; message: string }
  }
}

/** Notes, activity results, saved code and video position. Called often, so no revalidation. */
export async function saveLessonStateAction(
  courseId: string,
  lessonId: string,
  input: { patch?: Record<string, unknown>; videoSeconds?: number | null },
): Promise<{ ok: boolean }> {
  const ctx = await requireContext('lms.learn')
  try {
    return await saveLessonState(ctx, courseId, lessonId, input)
  } catch {
    return { ok: false }
  }
}

async function chat(mode: 'learner' | 'preview', courseId: string, lessonId: string, input: unknown): Promise<AiChatReply> {
  const ctx = await requireContext(mode === 'learner' ? 'lms.learn' : 'lms.view')
  try {
    return await lessonChat(ctx, courseId, lessonId, mode, input)
  } catch (err) {
    return { ok: false, reason: 'error', message: lmsFail(err, 'The study helper could not answer').message ?? 'The study helper could not answer' }
  }
}

export async function lessonChatAction(courseId: string, lessonId: string, input: unknown): Promise<AiChatReply> {
  return chat('learner', courseId, lessonId, input)
}

export async function previewLessonChatAction(courseId: string, lessonId: string, input: unknown): Promise<AiChatReply> {
  return chat('preview', courseId, lessonId, input)
}

/** Staff trying a quiz in preview: graded, never saved. */
export async function previewQuizAction(courseId: string, lessonId: string, answers: unknown): Promise<QuizActionResult> {
  const ctx = await requireContext('lms.view')
  try {
    await assertLms(ctx)
    const course = await visibleCourse(ctx, courseId)
    const lesson = await ctx.db.lmsLesson.findFirst({ where: { id: lessonId, courseId: course.id, archivedAt: null } })
    if (!lesson?.quiz) return { ok: false, message: 'Quiz not found' }
    const result = gradeQuiz(lesson.quiz as unknown as Quiz, quizAnswersSchema.parse(answers), lesson.passPercent)
    return { ok: true, result, courseComplete: false }
  } catch (err) {
    return lmsFail(err, 'Could not check the answers') as { ok: false; message: string }
  }
}

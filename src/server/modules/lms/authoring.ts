import { ZodError } from 'zod'
import type { LmsResult } from '@/components/lms/types'
import * as content from './content'
import type { Actor, CourseInput, CourseOwner, LessonInput } from './content'

/**
 * The course-builder operations behind both the console's and a school's
 * server actions. Each returns a toast-ready result instead of throwing.
 */

export function lmsFail(err: unknown, fallback: string): LmsResult {
  if (err instanceof ZodError) return { ok: false, message: err.issues[0]?.message ?? fallback }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

async function run(fallback: string, fn: () => Promise<LmsResult>): Promise<LmsResult> {
  try {
    return await fn()
  } catch (err) {
    return lmsFail(err, fallback)
  }
}

export const authoring = {
  createCourse: (owner: CourseOwner, actor: Actor, input: unknown) =>
    run('The course could not be created', async () => {
      const c = await content.createCourse(owner, actor, input as CourseInput)
      return { ok: true, id: c.id, message: `${c.title} created. Add lessons next.` }
    }),
  updateCourse: (owner: CourseOwner, id: string, input: unknown) =>
    run('The course could not be saved', async () => {
      const c = await content.updateCourse(owner, id, input as CourseInput)
      return { ok: true, id: c.id, message: 'Course details saved.' }
    }),
  setCourseStatus: (owner: CourseOwner, id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') =>
    run('The course could not be changed', async () => {
      const c = await content.setCourseStatus(owner, id, status)
      const said = status === 'PUBLISHED' ? 'published' : status === 'ARCHIVED' ? 'archived' : 'moved back to draft'
      return { ok: true, id: c.id, message: `${c.title} ${said}.` }
    }),
  deleteCourse: (owner: CourseOwner, id: string) =>
    run('The course could not be deleted', async () => {
      const c = await content.deleteCourse(owner, id)
      return { ok: true, message: `${c.title} deleted.` }
    }),
  addModule: (owner: CourseOwner, courseId: string, title: string) =>
    run('The module could not be added', async () => {
      const m = await content.addModule(owner, courseId, title)
      return { ok: true, id: m.id, message: `${m.title} added.` }
    }),
  renameModule: (owner: CourseOwner, id: string, title: string) =>
    run('The module could not be renamed', async () => {
      await content.renameModule(owner, id, title)
      return { ok: true, message: 'Module renamed.' }
    }),
  moveModule: (owner: CourseOwner, id: string, direction: 'up' | 'down') =>
    run('The module could not be moved', async () => {
      await content.moveModule(owner, id, direction)
      return { ok: true, message: 'Moved.' }
    }),
  deleteModule: (owner: CourseOwner, id: string) =>
    run('The module could not be deleted', async () => {
      const m = await content.deleteModule(owner, id)
      return { ok: true, message: `${m.title} and its lessons deleted.` }
    }),
  createLesson: (owner: CourseOwner, moduleId: string, input: unknown) =>
    run('The lesson could not be saved', async () => {
      const l = await content.createLesson(owner, moduleId, input as LessonInput)
      return { ok: true, id: l.id, message: `${l.title} added.` }
    }),
  updateLesson: (owner: CourseOwner, id: string, input: unknown) =>
    run('The lesson could not be saved', async () => {
      const l = await content.updateLesson(owner, id, input as LessonInput)
      return { ok: true, id: l.id, message: `${l.title} saved.` }
    }),
  moveLesson: (owner: CourseOwner, id: string, direction: 'up' | 'down') =>
    run('The lesson could not be moved', async () => {
      await content.moveLesson(owner, id, direction)
      return { ok: true, message: 'Moved.' }
    }),
  deleteLesson: (owner: CourseOwner, id: string) =>
    run('The lesson could not be deleted', async () => {
      const l = await content.deleteLesson(owner, id)
      return { ok: true, message: `${l.title} deleted.` }
    }),
}

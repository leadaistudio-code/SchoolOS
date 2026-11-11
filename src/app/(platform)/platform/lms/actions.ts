'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformContext } from '@/server/context'
import { authoring } from '@/server/modules/lms/authoring'
import type { LmsResult } from '@/components/lms/types'

const CATALOGUE = { tenantId: null }

async function platform() {
  const ctx = await requirePlatformContext('platform.lms')
  return { id: ctx.user.userId, label: `${ctx.user.firstName} ${ctx.user.lastName}`.trim() }
}

function done(result: LmsResult) {
  if (result.ok) revalidatePath('/platform/lms', 'layout')
  return result
}

export async function createCourseAction(input: unknown) {
  const actor = await platform()
  return done(await authoring.createCourse(CATALOGUE, actor, input))
}
export async function updateCourseAction(id: string, input: unknown) {
  await platform()
  return done(await authoring.updateCourse(CATALOGUE, id, input))
}
export async function setCourseStatusAction(id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
  await platform()
  return done(await authoring.setCourseStatus(CATALOGUE, id, status))
}
export async function deleteCourseAction(id: string) {
  await platform()
  return done(await authoring.deleteCourse(CATALOGUE, id))
}
export async function addModuleAction(courseId: string, title: string) {
  await platform()
  return done(await authoring.addModule(CATALOGUE, courseId, title))
}
export async function renameModuleAction(id: string, title: string) {
  await platform()
  return done(await authoring.renameModule(CATALOGUE, id, title))
}
export async function moveModuleAction(id: string, direction: 'up' | 'down') {
  await platform()
  return done(await authoring.moveModule(CATALOGUE, id, direction))
}
export async function deleteModuleAction(id: string) {
  await platform()
  return done(await authoring.deleteModule(CATALOGUE, id))
}
export async function createLessonAction(moduleId: string, input: unknown) {
  await platform()
  return done(await authoring.createLesson(CATALOGUE, moduleId, input))
}
export async function updateLessonAction(id: string, input: unknown) {
  await platform()
  return done(await authoring.updateLesson(CATALOGUE, id, input))
}
export async function moveLessonAction(id: string, direction: 'up' | 'down') {
  await platform()
  return done(await authoring.moveLesson(CATALOGUE, id, direction))
}
export async function deleteLessonAction(id: string) {
  await platform()
  return done(await authoring.deleteLesson(CATALOGUE, id))
}

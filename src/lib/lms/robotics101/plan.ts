import * as plan from '@/lib/lms/curriculum/plan'
import { ROBOTICS_101, type LessonDef } from './index'

export { canonical, lessonFields, type ExistingLesson, type ExistingModule, type LessonPlan, type MediaManifest, type VerifiedMedia } from '@/lib/lms/curriculum/plan'

export const MEDIA_URL = plan.videoUrl(ROBOTICS_101)

export const lessonVideo = (def: LessonDef, manifest: plan.MediaManifest) => plan.lessonVideo(ROBOTICS_101, def, manifest)

export const lessonContent = (def: LessonDef, manifest: plan.MediaManifest) => plan.lessonContent(ROBOTICS_101, def, manifest)

export const planSync = (modules: plan.ExistingModule[], lessons: plan.ExistingLesson[], manifest: plan.MediaManifest) =>
  plan.planSync(ROBOTICS_101, modules, lessons, manifest)

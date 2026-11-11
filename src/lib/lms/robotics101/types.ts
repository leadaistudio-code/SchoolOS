import type { RichContentInput } from '@/lib/lms/rich'
import type { Quiz } from '@/lib/lms/options'

export type LessonDef = {
  /** Stable key, stored in LmsLesson.slug. Never rename one that has shipped. */
  slug: string
  title: string
  kind: 'INTERACTIVE' | 'QUIZ' | 'PROJECT'
  minutes: number
  /** Titles of earlier lessons this one replaces, so their rows (and progress) are reused. */
  replaces?: string[]
  /** Which video in videos.ts belongs to this lesson. */
  videoId?: string
  content: Omit<RichContentInput, 'video'>
  /** Graded knowledge check, marked on the server. */
  quiz?: Quiz
  passPercent?: number
  /** PROJECT lessons: the brief shown above the hand-in form. */
  body?: string
}

export type ModuleDef = {
  key: string
  title: string
  summary: string
  /** Title of the existing module to rename into this one. */
  replaces?: string
  lessons: LessonDef[]
}

export const PASS_MARK = 80

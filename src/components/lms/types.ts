import type { PublicQuizQuestion, QuizResult } from '@/lib/lms/options'

export type LmsResult = { ok: true; message: string; id?: string } | { ok: false; message: string }

export type QuizActionResult = { ok: true; result: QuizResult; courseComplete: boolean } | { ok: false; message: string }

/** A lesson as sent to the player: the quiz has no answers in it. */
export type PlayerLesson = {
  id: string
  title: string
  kind: string
  durationMinutes: number | null
  videoUrl: string | null
  body: string | null
  documentUrl: string | null
  codeLanguage: string | null
  code: string | null
  passPercent: number
  quiz: PublicQuizQuestion[]
}

/** Server actions a course builder calls; the console and schools each bind their own owner. */
export type AuthoringActions = {
  createCourse: (input: unknown) => Promise<LmsResult>
  updateCourse: (id: string, input: unknown) => Promise<LmsResult>
  setCourseStatus: (id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') => Promise<LmsResult>
  deleteCourse: (id: string) => Promise<LmsResult>
  addModule: (courseId: string, title: string) => Promise<LmsResult>
  renameModule: (id: string, title: string) => Promise<LmsResult>
  moveModule: (id: string, direction: 'up' | 'down') => Promise<LmsResult>
  deleteModule: (id: string) => Promise<LmsResult>
  createLesson: (moduleId: string, input: unknown) => Promise<LmsResult>
  updateLesson: (id: string, input: unknown) => Promise<LmsResult>
  moveLesson: (id: string, direction: 'up' | 'down') => Promise<LmsResult>
  deleteLesson: (id: string) => Promise<LmsResult>
}

export type CourseDetails = {
  id: string
  title: string
  subtitle: string | null
  description: string | null
  category: string
  level: string
  gradeFrom: number | null
  gradeTo: number | null
  outcomes: string[]
  status: string
}

export type BuilderModule = {
  id: string
  title: string
  lessons: { id: string; title: string; kind: string; durationMinutes: number | null }[]
}

export type EditableLesson = {
  id?: string
  title: string
  kind: string
  durationMinutes: number | null
  videoUrl: string | null
  body: string | null
  documentUrl: string | null
  codeLanguage: string | null
  code: string | null
  quiz: unknown
  passPercent: number
}

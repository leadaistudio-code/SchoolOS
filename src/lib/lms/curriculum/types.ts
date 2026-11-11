import type { RichContentInput } from '@/lib/lms/rich'
import type { Quiz } from '@/lib/lms/options'
import type { VideoDef } from '@/lib/lms/video/engine'

export type LessonDef = {
  /** Stable key, stored in LmsLesson.slug. Never rename one that has shipped. */
  slug: string
  title: string
  kind: 'INTERACTIVE' | 'QUIZ' | 'PROJECT'
  minutes: number
  /** Titles of earlier lessons this one replaces, so their rows (and progress) are reused. */
  replaces?: string[]
  /** Which course video belongs to this lesson. */
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

export type Resource = { id: string; title: string; file: string; note: string; audience: 'student' | 'teacher' }

export type Badge = { id: string; name: string; description: string; lessons: string[] }

export type LessonResource = { title: string; href: string; note: string }

/** Catalogue row the sync creates when the course does not exist yet. Never applied to an existing course. */
export type CourseRow = {
  subtitle: string
  description: string
  category: 'ROBOTICS' | 'AI' | 'CODING' | 'ELECTRONICS' | 'IOT' | 'DRONES' | 'OTHER'
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  gradeFrom: number
  gradeTo: number
  outcomes: string[]
  /** Paise on the public Academy; 0 is free. */
  academyPriceMinor: number
}

export type Curriculum = {
  key: string
  /** The catalogue course this curriculum belongs to (matched by title). */
  courseTitle: string
  course?: CourseRow
  modules: ModuleDef[]
  videos: VideoDef[]
  videoById: (id: string | undefined) => VideoDef | undefined
  /** Public folder for this course's media, e.g. /lms-media/robotics-101. */
  mediaBase: string
  resources: Resource[]
  resourcesFor: (slug: string | null | undefined, opts?: { teacher?: boolean }) => LessonResource[]
  badges: Badge[]
  /** How the lesson player adapts to this course. */
  player: PlayerOptions
}

export type PlayerOptions = {
  /** The project lesson offers the Robotics pathway choice (robot, teacher-verified run or simulator). */
  capstone?: boolean
  /** Outside the capstone: invite screenshots on the project under this heading. */
  projectUploads?: string
  notesHint: string
}

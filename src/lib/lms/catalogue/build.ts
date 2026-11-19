import { lessonResources, type Badge, type CourseRow, type Curriculum, type LessonDef, type ModuleDef, type Resource } from '@/lib/lms/curriculum'
import type { Quiz, QuizQuestion } from '@/lib/lms/options'
import type { RichContentInput } from '@/lib/lms/rich'
import type { VideoDef } from '@/lib/lms/video/engine'

/** A short multiple-choice question for catalogue curricula. */
export function q(
  id: string,
  prompt: string,
  correct: string,
  wrong: [string, string],
  explanation: string,
): QuizQuestion {
  return {
    id,
    prompt,
    multiple: false,
    options: [
      { id: 'a', text: correct, correct: true, feedback: 'Correct.' },
      { id: 'b', text: wrong[0], correct: false, feedback: 'Not quite — try again.' },
      { id: 'c', text: wrong[1], correct: false, feedback: 'Not quite — try again.' },
    ],
    explanation,
  }
}

export function quiz(...questions: QuizQuestion[]): Quiz {
  return { questions }
}

type LessonInput = {
  slug: string
  title: string
  minutes: number
  kind?: LessonDef['kind']
  intro: string
  objectives: string[]
  blocks: NonNullable<RichContentInput['blocks']>
  summary: string[]
  next: string
  questions?: QuizQuestion[]
  body?: string
}

/** Interactive lesson with a short knowledge check (or a project brief). */
export function lesson(input: LessonInput): LessonDef {
  const kind = input.kind ?? 'INTERACTIVE'
  return {
    slug: input.slug,
    title: input.title,
    kind,
    minutes: input.minutes,
    ...(input.body ? { body: input.body } : {}),
    content: {
      version: 1,
      stage: 'watch',
      intro: input.intro,
      objectives: input.objectives,
      blocks: input.blocks,
      summary: input.summary,
      next: input.next,
    },
    ...(input.questions?.length
      ? { quiz: quiz(...input.questions), passPercent: kind === 'QUIZ' ? 70 : 80 }
      : {}),
  }
}

export function module(key: string, title: string, summary: string, lessons: LessonDef[]): ModuleDef {
  return { key, title, summary, lessons }
}

export function catalogueCurriculum(opts: {
  key: string
  courseTitle: string
  course: CourseRow
  modules: ModuleDef[]
  mediaBase: string
  badges?: Badge[]
  notesHint?: string
}): Curriculum {
  const resources: Resource[] = []
  return {
    key: opts.key,
    courseTitle: opts.courseTitle,
    course: opts.course,
    modules: opts.modules,
    videos: [] as VideoDef[],
    videoById: () => undefined,
    mediaBase: opts.mediaBase,
    resources,
    resourcesFor: lessonResources(opts.mediaBase, resources, {}),
    badges: opts.badges ?? [],
    player: {
      notesHint: opts.notesHint ?? 'Write what you learned or a question to ask.',
      projectUploads: 'Screenshots or photos of your work (optional)',
    },
  }
}

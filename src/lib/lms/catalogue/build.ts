import { lessonResources, type Badge, type CourseRow, type Curriculum, type LessonDef, type ModuleDef, type Resource } from '@/lib/lms/curriculum'
import type { Quiz, QuizQuestion } from '@/lib/lms/options'
import type { RichContentInput } from '@/lib/lms/rich'
import { type VideoDef } from '@/lib/lms/video/engine'
import type { NarrationTiming, VideoSeries } from '@/lib/lms/video/narration'

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

/** Shared MyCampusView Academy pronunciation + empty timing until narration runs. */
export function academySeries(name: string, extraSay: [RegExp, string][] = [], timing?: NarrationTiming): VideoSeries {
  return {
    name,
    say: [
      [/\bMyCampusView\b/g, 'My Campus View'],
      [/\bAI\b/g, 'A I'],
      [/\bLED\b/g, 'L E D'],
      [/\bLEDs\b/g, 'L E Ds'],
      [/\bPython\b/g, 'Python'],
      ...extraSay,
    ],
    timing: timing ?? { voice: null, videos: {} },
    pronounce: 'MyCampusView (My Campus View), AI (A-I), LED (L-E-D)',
  }
}

export function withSeries(series: VideoSeries, raw: Omit<VideoDef, 'series'>[]): VideoDef[] {
  return raw.map((v) => ({ ...v, series }))
}

export function catalogueCurriculum(opts: {
  key: string
  courseTitle: string
  course: CourseRow
  modules: ModuleDef[]
  mediaBase: string
  videos?: VideoDef[]
  badges?: Badge[]
  notesHint?: string
}): Curriculum {
  const resources: Resource[] = []
  const videos = opts.videos ?? []
  const bySlug = new Map(videos.map((v) => [v.lessonSlug, v.id]))
  const modules = opts.modules.map((m) => ({
    ...m,
    lessons: m.lessons.map((l) => {
      const videoId = bySlug.get(l.slug)
      return videoId ? { ...l, videoId } : l
    }),
  }))
  return {
    key: opts.key,
    courseTitle: opts.courseTitle,
    course: opts.course,
    modules,
    videos,
    videoById: (id) => (id ? videos.find((v) => v.id === id) : undefined),
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

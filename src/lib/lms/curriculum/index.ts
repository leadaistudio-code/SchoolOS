import type { Badge, Curriculum, LessonResource, Resource } from './types'

export * from './types'

/** Lesson resources: `id` names a resource, `code:key` a code file. Teacher-only files are hidden from students. */
export function lessonResources(
  mediaBase: string,
  resources: Resource[],
  byLesson: Record<string, string[]>,
  codeFiles: Record<string, { title: string; file: string; note: string }> = {},
) {
  return (slug: string | null | undefined, opts: { teacher?: boolean } = {}): LessonResource[] => {
    if (!slug) return []
    return (byLesson[slug] ?? []).flatMap((id) => {
      if (id.startsWith('code:')) {
        const c = codeFiles[id.slice(5)]
        return c ? [{ title: `Code: ${c.title}`, href: `${mediaBase}/${c.file}`, note: c.note }] : []
      }
      const r = resources.find((x) => x.id === id)
      if (!r || (r.audience === 'teacher' && !opts.teacher && r.id !== 'rubric')) return []
      return [{ title: r.title, href: `${mediaBase}/${r.file}`, note: r.note }]
    })
  }
}

/** Awarded only when every listed lesson is complete (projects: approved; quizzes: passed). */
export function earnedBadges(badges: Badge[], completedSlugs: Set<string>) {
  return badges.map((b) => ({ ...b, earned: b.lessons.every((s) => completedSlugs.has(s)), done: b.lessons.filter((s) => completedSlugs.has(s)).length }))
}

export function curriculumLessons(c: Curriculum) {
  return c.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, module: m.key }))).map((l, i) => ({ ...l, number: i + 1 }))
}

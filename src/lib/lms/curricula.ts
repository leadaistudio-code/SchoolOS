import { AI_101 } from '@/lib/lms/ai101'
import type { Curriculum, PlayerOptions } from '@/lib/lms/curriculum'
import { ROBOTICS_101 } from '@/lib/lms/robotics101'

/** Every built-in interactive curriculum. Video ids and lesson slugs are unique across all of them. */
export const CURRICULA: Curriculum[] = [ROBOTICS_101, AI_101]

export function curriculumByKey(key: string) {
  return CURRICULA.find((c) => c.key === key)
}

/** The curriculum a course's lessons come from, if any (badges and resources apply). */
export function curriculumFor(slugs: (string | null | undefined)[]) {
  return CURRICULA.find((c) => c.modules.some((m) => m.lessons.some((l) => slugs.includes(l.slug))))
}

export function playerOptionsFor(slug: string | null | undefined): PlayerOptions {
  return curriculumFor([slug])?.player ?? { notesHint: 'Write what you learned or questions to ask.' }
}

export function lessonResourcesFor(slug: string | null | undefined, opts: { teacher?: boolean } = {}) {
  if (!slug) return []
  const c = CURRICULA.find((x) => x.modules.some((m) => m.lessons.some((l) => l.slug === slug)))
  return c ? c.resourcesFor(slug, opts) : []
}

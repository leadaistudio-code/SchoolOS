import { richContentSchema, type RichContent } from '@/lib/lms/rich'
import { MODULES, type LessonDef } from './index'
import { timeline, videoById } from './videos'
import { PASS_MARK } from './types'

/**
 * Plans the Robotics 101 content upgrade against what is in the database.
 * Pure, so the mapping can be tested: existing rows are reused (by slug, then
 * by the titles a lesson `replaces`), so their ids and every learner's progress
 * stay attached. Nothing is deleted; lessons the new curriculum does not use
 * are archived.
 */

export type ExistingModule = { id: string; title: string; position: number }
export type ExistingLesson = { id: string; title: string; slug: string | null; moduleId: string; archivedAt: Date | null; content: unknown; contentVersion: number }

export type VerifiedMedia = { src: string; poster: string; captions: string; durationSeconds: number; verified: true }
export type MediaManifest = { videos: Record<string, VerifiedMedia | undefined> }

export const MEDIA_URL = '/lms-media/robotics-101/video'

export function lessonVideo(def: LessonDef, manifest: MediaManifest): RichContent['video'] {
  const video = videoById(def.videoId)
  if (!video) return undefined
  const tl = timeline(video)
  const media = manifest.videos[video.id]
  const ready = media?.verified === true
  return {
    id: video.id,
    title: video.title,
    status: ready ? 'ready' : 'draft',
    ...(ready ? { src: media.src, poster: media.poster, durationSeconds: media.durationSeconds } : {}),
    captions: `${MEDIA_URL}/${video.id}.en.vtt`,
    chapters: tl.chapters.map((c) => ({ at: c.at, label: c.title })),
    checkpoints: tl.checkpoints.map((c) => ({ id: c.id, at: c.at, prompt: c.prompt, options: c.options, explanation: c.explanation })),
    transcript: video.scenes.map((s) => s.say).join('\n\n'),
  }
}

export function lessonContent(def: LessonDef, manifest: MediaManifest): RichContent {
  return richContentSchema.parse({ ...def.content, version: 1, video: lessonVideo(def, manifest) })
}

export type LessonPlan = {
  def: LessonDef
  existingId: string | null
  moduleKey: string
  position: number
  content: RichContent
  contentChanged: boolean
}

export function planSync(modules: ExistingModule[], lessons: ExistingLesson[], manifest: MediaManifest) {
  const claimedModules = new Set<string>()
  const moduleOps = MODULES.map((m, i) => {
    const existing =
      modules.find((x) => !claimedModules.has(x.id) && x.title === m.title) ?? modules.find((x) => !claimedModules.has(x.id) && m.replaces && x.title === m.replaces)
    if (existing) claimedModules.add(existing.id)
    return { key: m.key, existingId: existing?.id ?? null, title: m.title, summary: m.summary, position: i + 1 }
  })

  const claimed = new Set<string>()
  const lessonOps: LessonPlan[] = []
  for (const m of MODULES) {
    m.lessons.forEach((def, i) => {
      const existing =
        lessons.find((l) => !claimed.has(l.id) && l.slug === def.slug) ??
        lessons.find((l) => !claimed.has(l.id) && !l.slug && (def.replaces ?? []).includes(l.title))
      if (existing) claimed.add(existing.id)
      const content = lessonContent(def, manifest)
      lessonOps.push({
        def,
        existingId: existing?.id ?? null,
        moduleKey: m.key,
        position: i + 1,
        content,
        contentChanged: !existing || JSON.stringify(existing.content ?? null) !== JSON.stringify(content),
      })
    })
  }

  const archive = lessons.filter((l) => !claimed.has(l.id) && !l.archivedAt).map((l) => l.id)
  const unusedModules = modules.filter((m) => !claimedModules.has(m.id)).map((m) => m.id)
  return { moduleOps, lessonOps, archive, unusedModules }
}

export function lessonFields(def: LessonDef) {
  return {
    title: def.title,
    kind: def.kind,
    durationMinutes: def.minutes,
    slug: def.slug,
    passPercent: def.passPercent ?? PASS_MARK,
    body: def.body ?? null,
  }
}

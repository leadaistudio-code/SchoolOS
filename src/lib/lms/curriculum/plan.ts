import { richContentSchema, type RichContent } from '@/lib/lms/rich'
import { timeline } from '@/lib/lms/video/engine'
import { PASS_MARK, type Curriculum, type LessonDef } from './types'

/**
 * Plans a curriculum content sync against what is in the database.
 * Pure, so the mapping can be tested: existing rows are reused (by slug, then
 * by the titles a lesson `replaces`), so their ids and every learner's progress
 * stay attached. Nothing is deleted; lessons the curriculum does not use are
 * archived.
 */

export type ExistingModule = { id: string; title: string; position: number }
export type ExistingLesson = { id: string; title: string; slug: string | null; moduleId: string; archivedAt: Date | null; content: unknown; contentVersion: number }

export type VerifiedMedia = { src: string; poster: string; captions: string; durationSeconds: number; verified: true }
export type MediaManifest = { videos: Record<string, VerifiedMedia | undefined> }

export const videoUrl = (c: Curriculum) => `${c.mediaBase}/video`

export function lessonVideo(c: Curriculum, def: LessonDef, manifest: MediaManifest): RichContent['video'] {
  const video = c.videoById(def.videoId)
  if (!video) return undefined
  const tl = timeline(video)
  const media = manifest.videos[video.id]
  const ready = media?.verified === true
  return {
    id: video.id,
    title: video.title,
    status: ready ? 'ready' : 'draft',
    ...(ready ? { src: media.src, poster: media.poster, durationSeconds: media.durationSeconds } : {}),
    captions: `${videoUrl(c)}/${video.id}.en.vtt`,
    chapters: tl.chapters.map((ch) => ({ at: ch.at, label: ch.title })),
    checkpoints: tl.checkpoints.map((cp) => ({ id: cp.id, at: cp.at, prompt: cp.prompt, options: cp.options, explanation: cp.explanation })),
    transcript: video.scenes.map((s) => s.say).join('\n\n'),
  }
}

export function lessonContent(c: Curriculum, def: LessonDef, manifest: MediaManifest): RichContent {
  return richContentSchema.parse({ ...def.content, version: 1, video: lessonVideo(c, def, manifest) })
}

export type LessonPlan = {
  def: LessonDef
  existingId: string | null
  moduleKey: string
  position: number
  content: RichContent
  contentChanged: boolean
}

export function planSync(c: Curriculum, modules: ExistingModule[], lessons: ExistingLesson[], manifest: MediaManifest) {
  const claimedModules = new Set<string>()
  const moduleOps = c.modules.map((m, i) => {
    const existing =
      modules.find((x) => !claimedModules.has(x.id) && x.title === m.title) ?? modules.find((x) => !claimedModules.has(x.id) && m.replaces && x.title === m.replaces)
    if (existing) claimedModules.add(existing.id)
    return { key: m.key, existingId: existing?.id ?? null, title: m.title, summary: m.summary, position: i + 1 }
  })

  const claimed = new Set<string>()
  const lessonOps: LessonPlan[] = []
  for (const m of c.modules) {
    m.lessons.forEach((def, i) => {
      const existing =
        lessons.find((l) => !claimed.has(l.id) && l.slug === def.slug) ??
        lessons.find((l) => !claimed.has(l.id) && !l.slug && (def.replaces ?? []).includes(l.title))
      if (existing) claimed.add(existing.id)
      const content = lessonContent(c, def, manifest)
      lessonOps.push({
        def,
        existingId: existing?.id ?? null,
        moduleKey: m.key,
        position: i + 1,
        content,
        contentChanged: !existing || canonical(existing.content ?? null) !== canonical(content),
      })
    })
  }

  const archive = lessons.filter((l) => !claimed.has(l.id) && !l.archivedAt).map((l) => l.id)
  const unusedModules = modules.filter((m) => !claimedModules.has(m.id)).map((m) => m.id)
  return { moduleOps, lessonOps, archive, unusedModules }
}

/** JSON with sorted keys: Postgres JSONB does not keep key order, so plain stringify always differs. */
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v
  return JSON.stringify(sort(JSON.parse(JSON.stringify(value))))
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

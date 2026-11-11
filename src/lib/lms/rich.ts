import { z } from 'zod'

/**
 * Structured lesson content (LmsLesson.content). The learner renderer, the
 * admin editor and the curriculum sync all validate against this one schema.
 *
 * Activities here are formative: they give instant feedback in the browser and
 * save their result to the learner's lesson state. The graded knowledge check
 * stays in LmsLesson.quiz and is marked on the server.
 */

const id = z.string().min(1).max(60)
const short = (max = 300) => z.string().trim().min(1).max(max)
const body = z.string().trim().min(1).max(6000)

const option = z.object({ id, text: short(400), correct: z.boolean(), feedback: z.string().max(600).optional() })

export const checkpointSchema = z.object({
  id,
  /** Seconds into the video. */
  at: z.number().min(0).max(4 * 3600),
  prompt: short(400),
  options: z.array(option).min(2).max(5),
  explanation: short(800),
})

export const videoSchema = z.object({
  id,
  title: short(160),
  /** Rendered MP4. Absent until a render has been produced and checked. */
  src: z.string().max(500).optional(),
  poster: z.string().max(500).optional(),
  captions: z.string().max(500).optional(),
  durationSeconds: z.number().int().min(1).max(4 * 3600).optional(),
  /** `ready` media is shown to learners; `draft` is visible to staff previews only. */
  status: z.enum(['ready', 'draft']).default('draft'),
  chapters: z.array(z.object({ at: z.number().min(0), label: short(80) })).max(30).default([]),
  checkpoints: z.array(checkpointSchema).max(10).default([]),
  /** Plain-text narration script, shown as the transcript. */
  transcript: z.string().max(20000).optional(),
})

const codeTask = z.object({
  id,
  kind: z.enum(['fill', 'pins', 'condition', 'predict', 'complete']),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: short(120),
  prompt: body,
  /** Sketch with blanks written as {{blankId}}. */
  code: z.string().max(12000),
  blanks: z
    .array(z.object({ id, answers: z.array(z.string().max(80)).min(1).max(8), hint: z.string().max(400).optional(), width: z.number().int().min(2).max(40).optional() }))
    .max(12)
    .default([]),
  /** For `predict` tasks: the choices and which is right. */
  choices: z.array(option).max(5).optional(),
  explanation: body,
  /** What the Serial Monitor or robot would show when this is correct. */
  expected: z.string().max(2000).optional(),
})

const checklistItem = z.object({ id, text: short(300), detail: z.string().max(600).optional() })

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), heading: z.string().max(140).optional(), body }),
  z.object({
    type: z.literal('callout'),
    tone: z.enum(['tip', 'safety', 'word', 'life', 'teacher', 'mistake']),
    title: short(120),
    body,
  }),
  z.object({ type: z.literal('figure'), src: short(500), alt: short(400), caption: z.string().max(300).optional() }),
  z.object({
    type: z.literal('diagram'),
    name: z.enum(['sense-think-act', 'ir-reflect', 'differential', 'pin-map', 'wiring', 'h-bridge', 'chassis', 'pwm', 'flowchart', 'loop']),
    caption: z.string().max(300).optional(),
  }),
  z.object({ type: z.literal('check'), id, prompt: short(500), options: z.array(option).min(2).max(5), hint: z.string().max(400).optional(), explanation: short(800) }),
  z.object({
    type: z.literal('sort'),
    id,
    title: short(120),
    prompt: short(400),
    bins: z.array(z.object({ id, label: short(60) })).min(2).max(4),
    items: z.array(z.object({ id, text: short(120), bin: id, why: short(300) })).min(2).max(14),
  }),
  z.object({
    type: z.literal('sequence'),
    id,
    title: short(120),
    prompt: short(400),
    /** In the correct order. Shown shuffled. */
    steps: z.array(z.object({ id, text: short(200) })).min(3).max(10),
    explanation: short(600),
  }),
  z.object({
    type: z.literal('match'),
    id,
    title: short(120),
    prompt: short(400),
    pairs: z.array(z.object({ id, left: short(120), right: short(200) })).min(2).max(10),
    explanation: short(600),
  }),
  z.object({ type: z.literal('kit'), id, title: short(120), prompt: short(400), quiz: z.boolean().default(true) }),
  z.object({ type: z.literal('ir-sim'), id }),
  z.object({ type: z.literal('motor-lab'), id }),
  z.object({
    type: z.literal('line-sim'),
    id,
    mode: z.enum(['explore', 'experiments', 'challenge']),
    tutorial: z.boolean().default(false),
  }),
  z.object({ type: z.literal('truth-table'), id }),
  z.object({ type: z.literal('wiring'), id }),
  z.object({ type: z.literal('code-lab'), id, title: short(120), tasks: z.array(codeTask).min(1).max(12) }),
  z.object({
    type: z.literal('code'),
    language: z.enum(['arduino', 'cpp', 'python', 'text']),
    code: z.string().max(20000),
    caption: z.string().max(300).optional(),
    /** Offer a download with this file name, e.g. line_follower.ino. */
    download: z.string().max(80).optional(),
  }),
  z.object({
    type: z.literal('checklist'),
    id,
    title: short(120),
    items: z.array(checklistItem).min(1).max(30),
    /** Ticks for an adult to confirm, e.g. wiring before power. */
    teacher: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('steps'),
    title: short(120),
    steps: z.array(z.object({ title: short(120), body: short(1200), tip: z.string().max(400).optional() })).min(1).max(20),
  }),
  z.object({
    type: z.literal('missions'),
    id,
    title: short(120),
    missions: z
      .array(
        z.object({
          id,
          symptom: short(300),
          options: z.array(option).min(2).max(5),
          fix: short(800),
        }),
      )
      .min(1)
      .max(12),
  }),
  z.object({
    type: z.literal('resources'),
    items: z.array(z.object({ title: short(140), href: short(500), note: z.string().max(200).optional() })).min(1).max(20),
  }),
])

export const richContentSchema = z.object({
  version: z.literal(1),
  intro: body,
  objectives: z.array(short(200)).min(1).max(8),
  /** One of the Watch → Demonstrate stages, shown as the lesson's focus. */
  stage: z.enum(['watch', 'understand', 'experiment', 'practise', 'build', 'test', 'improve', 'demonstrate']).optional(),
  video: videoSchema.optional(),
  blocks: z.array(blockSchema).max(40),
  summary: z.array(short(300)).min(1).max(8),
  next: z.string().max(400).optional(),
})

export type RichContent = z.infer<typeof richContentSchema>
/** As authored: fields with defaults may be left out. */
export type RichContentInput = z.input<typeof richContentSchema>
export type RichBlock = z.infer<typeof blockSchema>
export type RichVideo = z.infer<typeof videoSchema>
export type CodeTask = z.infer<typeof codeTask>
export type Checkpoint = z.infer<typeof checkpointSchema>

/** Parses stored content. Bad content is reported, never thrown at a learner. */
export function readRichContent(raw: unknown): { content: RichContent | null; error: string | null } {
  if (raw == null) return { content: null, error: null }
  const parsed = richContentSchema.safeParse(raw)
  if (parsed.success) return { content: parsed.data, error: null }
  const issue = parsed.error.issues[0]
  return { content: null, error: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid lesson content' }
}

/** Learners never see draft media. Staff previews do, labelled. */
export function videoForViewer(video: RichVideo | undefined, staff: boolean): RichVideo | null {
  if (!video) return null
  if (video.status === 'ready' && video.src) return video
  return staff ? video : null
}

/** Blank answers are compared without case, spaces or a trailing semicolon. */
export function normaliseAnswer(v: string) {
  return v.trim().replace(/;$/, '').replace(/\s+/g, '').toLowerCase()
}

export function blankIsRight(answers: string[], given: string) {
  const g = normaliseAnswer(given)
  return g.length > 0 && answers.some((a) => normaliseAnswer(a) === g)
}

/** Ids of activities that report a result into lesson state. */
export function activityIds(content: RichContent): string[] {
  return content.blocks.flatMap((b) => ('id' in b && b.type !== 'checklist' ? [b.id] : []))
}

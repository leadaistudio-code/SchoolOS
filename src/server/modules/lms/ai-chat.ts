import OpenAI from 'openai'
import { z } from 'zod'
import { env } from '@/lib/env'
import { readRichContent } from '@/lib/lms/rich'
import type { AppContext } from '@/server/context'
import { badRequest, notFound } from '@/server/api/response'
import { assistantConfigured, assistantModel } from '@/server/assistant/providers'
import { rateLimit } from '@/server/rate-limit'
import { assertLms } from './access'
import { openCourseFor, requireLearner } from './learning'
import { visibleCourse } from './school'

/**
 * The study helper in AI for Young Builders: a short, supervised chat for
 * children. It only runs inside a lesson that contains an `ai-chat` block, for
 * a learner on that course or school staff previewing it. Every message is
 * screened before and after the model, conversations are not stored, and use
 * is counted so a school can see it.
 */

export const STUDENT_DAILY_LIMIT = 30
export const SCHOOL_DAILY_LIMIT = 1500
const DAY = 86_400
const MAX_CHARS = 400
const MAX_TURNS = 8

export const aiChatInputSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(1200) }))
    .min(1)
    .max(MAX_TURNS * 2),
})

export type AiChatReply =
  | { ok: true; reply: string; remaining: number }
  | { ok: false; reason: 'personal' | 'unsafe' | 'limit' | 'off' | 'error'; message: string }

const SYSTEM = `You are "Study Helper", a friendly AI tutor inside a school course for children aged 10 to 14 in India.

Rules you always follow:
- Keep every answer short: at most 80 words, simple words, short sentences. Use a tiny example when it helps.
- Help with learning: school subjects, how AI and computers work, study tips, and creative ideas such as quiz questions or story starters.
- Never ask for or repeat personal details (names, addresses, phone numbers, schools, photos, passwords). If the child shares one, tell them kindly not to share personal details online.
- Do not discuss violence, weapons, drugs, alcohol, self-harm, sexual content, dating, gambling, hate, scary content or anything not suitable for a child. Politely say it is not something you can help with and suggest talking to a parent or teacher.
- If a child seems upset, worried or unsafe, be kind, say you are an AI and cannot help with that, and encourage them to talk to a trusted adult right away.
- Do not give medical, legal or money advice.
- Do not do whole homework for them. Explain the idea and give a hint so they can do it themselves.
- Be honest: you are an AI, you can make mistakes, and they should check important facts with a teacher or a book.
- Do not pretend to be a person, a friend or a celebrity, and do not role-play as one.
- Answer in English unless the child writes in another language; then reply in that language, keeping the same rules.`

/** Personal details a child might type. Blocked before anything leaves the server. */
const PERSONAL: [RegExp, string][] = [
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/, 'an email address'],
  [/(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/, 'a phone number'],
  [/\b(?:pin\s?code|postal\s+code)\b\D{0,12}\d{3}\s?\d{3}\b/i, 'a pincode'],
  [/\b\d{4}\s?\d{4}\s?\d{4}\b/, 'an ID number'],
  [/\b(?:my|our)\s+(?:home\s+)?address\b|\bi\s+live\s+(?:at|in|on|near)\b|\bhouse\s+(?:no|number)\b/i, 'where you live'],
  [/\b(?:my\s+)?(?:password|passcode|otp|pin)\s+(?:is|:)/i, 'a password'],
  [/\bmy\s+(?:full\s+)?name\s+is\b|\bi\s+study\s+(?:at|in)\b|\bmy\s+school\s+is\b/i, 'your name or school'],
]

/** Topics the helper refuses outright, whatever the model would say. A backstop, not the main filter. */
const UNSAFE = /\b(?:kill|suicide|self[-\s]?harm|cut myself|bomb|gun|weapon|knife attack|drugs?|cocaine|weed|alcohol|beer|porn|sex|nude|naked|gambl\w*|betting)\b/i

export function personalDetail(text: string): string | null {
  for (const [re, what] of PERSONAL) if (re.test(text)) return what
  return null
}

export function unsafeTopic(text: string) {
  return UNSAFE.test(text)
}

/** OpenAI's moderation endpoint, when the platform runs on OpenAI. Fails closed: no verdict, no answer. */
async function flagged(text: string): Promise<boolean> {
  const { AI_DRIVER, AI_API_KEY, AI_BASE_URL } = env()
  if (AI_DRIVER !== 'openai' || !AI_API_KEY) return false
  const client = new OpenAI({ apiKey: AI_API_KEY, ...(AI_BASE_URL ? { baseURL: AI_BASE_URL } : {}) })
  const result = await client.moderations.create({ model: 'omni-moderation-latest', input: text })
  return result.results.some((r) => r.flagged)
}

async function lessonHasChat(ctx: AppContext, courseId: string, lessonId: string) {
  const lesson = await ctx.db.lmsLesson.findFirst({ where: { id: lessonId, courseId, archivedAt: null }, select: { content: true } })
  if (!lesson) throw notFound('Lesson')
  const { content } = readRichContent(lesson.content)
  if (!content?.blocks.some((b) => b.type === 'ai-chat')) throw badRequest('This lesson has no study helper')
}

/** A learner on the course, or staff previewing it: both see the lesson, so both may use its helper. */
async function allowed(ctx: AppContext, courseId: string, mode: 'learner' | 'preview') {
  if (mode === 'learner') {
    const learner = await requireLearner(ctx)
    await openCourseFor(ctx, learner, courseId)
    return
  }
  ctx.require('lms.view')
  await assertLms(ctx)
  await visibleCourse(ctx, courseId)
}

export async function lessonChat(ctx: AppContext, courseId: string, lessonId: string, mode: 'learner' | 'preview', input: unknown): Promise<AiChatReply> {
  await allowed(ctx, courseId, mode)
  await lessonHasChat(ctx, courseId, lessonId)
  if (!assistantConfigured()) return { ok: false, reason: 'off', message: 'The study helper is not switched on for this school yet. Ask your teacher.' }

  const { messages } = aiChatInputSchema.parse(input)
  const last = messages.at(-1)!
  if (last.role !== 'user') throw badRequest('The last message must be yours')
  if (last.text.length > MAX_CHARS) return { ok: false, reason: 'error', message: `Please keep your message under ${MAX_CHARS} characters.` }

  const personal = personalDetail(last.text)
  if (personal) {
    return { ok: false, reason: 'personal', message: `Your message looks like it contains ${personal}. Never share personal details with an AI or online. Remove it and try again.` }
  }
  if (unsafeTopic(last.text)) {
    return { ok: false, reason: 'unsafe', message: 'That is not something the study helper can talk about. If something is worrying you, please talk to a parent or teacher.' }
  }

  const student = await rateLimit(`lms-ai-chat:${ctx.tenant.id}:${ctx.user.userId}`, STUDENT_DAILY_LIMIT, DAY)
  const school = await rateLimit(`lms-ai-chat:${ctx.tenant.id}`, SCHOOL_DAILY_LIMIT, DAY)
  if (!student.ok || !school.ok) {
    return { ok: false, reason: 'limit', message: 'You have used all your study-helper messages for today. Come back tomorrow!' }
  }

  try {
    if (await flagged(last.text)) {
      return { ok: false, reason: 'unsafe', message: 'That is not something the study helper can talk about. If something is worrying you, please talk to a parent or teacher.' }
    }
    const model = assistantModel()
    const turns = messages.slice(-MAX_TURNS * 2).map((m) =>
      m.role === 'user' ? { role: 'user' as const, text: m.text.slice(0, MAX_CHARS) } : { role: 'assistant' as const, text: m.text, toolCalls: [] },
    )
    const result = await model.turn({ system: SYSTEM, turns, tools: [], onText: () => undefined, stream: false, maxOutputTokens: 260 })
    const reply = result.text.trim()
    await ctx.db.aiUsageEvent.create({
      data: { tenantId: ctx.tenant.id, kind: 'lms.ai-chat', units: 1, model: model.model, createdById: ctx.user.userId, meta: { courseId, lessonId, mode } },
    })
    if (result.refused || !reply || unsafeTopic(reply) || (await flagged(reply))) {
      return { ok: false, reason: 'unsafe', message: 'The study helper could not answer that safely. Try asking about something you are learning.' }
    }
    return { ok: true, reply, remaining: student.remaining }
  } catch (err) {
    console.error('[lms-ai-chat] failed', err)
    return { ok: false, reason: 'error', message: 'The study helper is not available right now. Try again in a minute.' }
  }
}

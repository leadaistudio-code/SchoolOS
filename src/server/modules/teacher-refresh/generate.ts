import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { TeacherRefreshType } from '@prisma/client'
import { ApiException, notFound } from '@/server/api/response'
import { assertClassSubjectAccess } from '@/server/scope'
import { publishedTopics } from '@/server/modules/curriculum/service'
import { screenGenerated } from '@/server/modules/questions/generate'
import { fingerprintOf, similarity, SIMILARITY_THRESHOLD } from '@/server/modules/questions/service'
import { assistantConfigured, assistantModel } from '@/server/assistant/providers'
import { zodToJsonSchema } from '@/server/assistant/json-schema'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'

/**
 * Building a refresher.
 *
 * The source of truth is the school's own curriculum: a teacher is only ever
 * refreshed on topics inside subjects they actually teach. Questions come from
 * two places, in order of preference:
 *
 *   1. Approved questions already in the bank for those topics — vetted, free,
 *      and instant.
 *   2. Fresh AI-generated questions, but only when the school has the AI module
 *      and the caller allows it (on-demand flows do; the bulk scheduler does
 *      not, to keep automated runs cheap and dependency-free).
 *
 * AI questions are written for a *teacher* audience — conceptual, applied, and
 * built around the misconceptions students actually bring — and land as DRAFT
 * in the bank exactly like `generateQuestions`, so nothing generated is trusted
 * blindly. When neither source yields anything, composition fails loudly for an
 * on-demand caller and is skipped-with-a-reason by the scheduler.
 */

const OBJECTIVE_REFRESH_TYPES = ['MCQ', 'TRUE_FALSE'] as const

export type ComposeOptions = {
  teacherId: string
  classSubjectId: string
  type: TeacherRefreshType
  count: number
  completionWindowHours: number
  /** Restrict to these topics; empty means every published topic in the subject. */
  topicIds?: string[]
  /** Allow spending AI to top up a thin bank. Off for the bulk scheduler. */
  allowAi?: boolean
  /** Skip the per-request teaching-scope check (the scheduler resolves scope itself). */
  trustedScope?: boolean
}

export type ComposeResult = {
  assessmentId: string
  questionCount: number
  fromBank: number
  fromAi: number
}

/**
 * Assembles and persists one refresher. Returns null when there was nothing to
 * ask about (no bank questions and no usable AI), so callers can decide whether
 * that is an error (on-demand) or a skip (scheduler).
 */
export async function composeRefresher(
  ctx: AppContext,
  opts: ComposeOptions,
): Promise<ComposeResult | null> {
  if (!opts.trustedScope) {
    await assertClassSubjectAccess(ctx, opts.classSubjectId)
  }

  const topicIds = opts.topicIds ?? []
  const count = Math.max(1, opts.count)

  // 1. Approved bank questions for the requested topics.
  const bank = await ctx.db.question.findMany({
    where: {
      classSubjectId: opts.classSubjectId,
      status: 'APPROVED',
      deletedAt: null,
      type: { in: [...OBJECTIVE_REFRESH_TYPES] },
      ...(topicIds.length > 0 ? { topics: { some: { topicId: { in: topicIds } } } } : {}),
    },
    select: { id: true },
    take: 200,
  })

  const chosen = shuffle(bank.map((q) => q.id)).slice(0, count)
  const fromBank = chosen.length

  // 2. Top up with AI when allowed and available.
  let fromAi = 0
  if (chosen.length < count && opts.allowAi) {
    const shortfall = count - chosen.length
    const generated = await generateRefresherDraftQuestions(ctx, {
      classSubjectId: opts.classSubjectId,
      topicIds,
      count: Math.min(shortfall, 15),
    }).catch(() => [] as string[])
    fromAi = generated.length
    chosen.push(...generated)
  }

  if (chosen.length === 0) {
    if (opts.allowAi) {
      throw new ApiException(
        409,
        'NO_REFRESH_CONTENT',
        'There are no approved questions for these topics yet, and none could be generated. Add or approve some questions for this subject first.',
      )
    }
    return null
  }

  const now = new Date()
  const dueAt = new Date(now.getTime() + opts.completionWindowHours * 60 * 60 * 1000)

  const assessment = await ctx.db.teacherRefreshAssessment.create({
    data: {
      tenantId: ctx.tenant.id,
      teacherId: opts.teacherId,
      classSubjectId: opts.classSubjectId,
      type: opts.type,
      status: 'PENDING',
      scheduledAt: now,
      dueAt,
      questionCount: chosen.length,
      questions: {
        create: chosen.map((questionId, position) => ({
          tenantId: ctx.tenant.id,
          questionId,
          position,
        })),
      },
    },
    select: { id: true, questionCount: true },
  })

  return {
    assessmentId: assessment.id,
    questionCount: assessment.questionCount,
    fromBank,
    fromAi,
  }
}

/* -------------------------------------------------------------------------- */
/* AI generation, teacher-oriented                                            */
/* -------------------------------------------------------------------------- */

const refresherQuestion = z.object({
  topicId: z.string().describe('The id of the topic this question comes from. Must be one listed.'),
  text: z.string().describe('The question, written for a teacher refreshing their own knowledge.'),
  type: z.enum(OBJECTIVE_REFRESH_TYPES).describe('MCQ or TRUE_FALSE only.'),
  options: z
    .array(z.object({ text: z.string(), isCorrect: z.boolean() }))
    .describe('For MCQ: four options, exactly one correct. For TRUE_FALSE: the two options.'),
  solution: z.string().describe('The correct answer.'),
  explanation: z
    .string()
    .optional()
    .describe('Why it is correct, and the misconception it guards against.'),
})

const refresherEmitSchema = z.object({
  questions: z.array(refresherQuestion),
})

/**
 * Generates teacher-facing DRAFT questions grounded in the school's own
 * syllabus. Mirrors the guarantees of `generateQuestions` — scope from the
 * database, output screened and de-duplicated, persisted as DRAFT — but with a
 * prompt pitched at a teacher's understanding rather than a student's recall.
 * Returns the ids of the questions created.
 */
async function generateRefresherDraftQuestions(
  ctx: AppContext,
  input: { classSubjectId: string; topicIds: string[]; count: number },
): Promise<string[]> {
  if (!assistantConfigured()) return []
  if (!(await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST))) return []

  const topics = await publishedTopics(ctx, input.classSubjectId)
  const scoped = input.topicIds.length > 0 ? topics.filter((t) => input.topicIds.includes(t.id)) : topics
  if (scoped.length === 0) return []

  const classSubject = await ctx.db.classSubject.findFirst({
    where: { id: input.classSubjectId },
    select: {
      classLevel: { select: { name: true } },
      subject: { select: { name: true } },
    },
  })
  if (!classSubject) throw notFound('Class subject')

  const allowedTopicIds = new Set(scoped.map((t) => t.id))

  const topicBlock = scoped
    .map((t) => {
      const outcomes = t.outcomes.length > 0 ? `\n  Learning outcomes: ${t.outcomes.map((o) => o.statement).join('; ')}` : ''
      const summary = t.summary ? `\n  Covers: ${t.summary}` : ''
      return `- id: ${t.id}\n  Chapter: ${t.chapter.name}\n  Topic: ${t.name}${summary}${outcomes}`
    })
    .join('\n')

  const system = `You are preparing a short knowledge refresher for a *teacher* of ${classSubject.classLevel.name} ${classSubject.subject.name}. This is professional development: it helps the teacher walk into the lesson confident, not a test that judges them.

# The syllabus in scope
Every question must come from exactly one of these topics, and you must return its id.

${topicBlock}

# What makes a good refresher question
- Pitch at the teacher's own understanding, one level above what students are asked: probe *why*, not just *what*.
- Favour conceptual understanding, real application, and the common misconceptions students bring to this topic — the things a teacher most needs to have straight before they teach it.
- Aim at Bloom's Understand, Apply and Analyze levels. Avoid trivial recall.
- Stay strictly inside the topics above and their summaries. Introduce no concept that is not part of one of them.
- Use only MCQ (four options, exactly one correct) and TRUE_FALSE (two options).
- For every question, give the correct answer and a one-line explanation naming the misconception it guards against.
- Do not number the questions. Do not repeat a question.

# What is being asked for
${input.count} questions.

Call emit_questions exactly once with all of the questions. Write nothing else.`

  const model = assistantModel()
  const result = await model.turn({
    system,
    turns: [{ role: 'user', text: 'Generate the refresher questions now.' }],
    tools: [
      {
        name: 'emit_questions',
        description: 'Return the generated questions. Call this exactly once.',
        parameters: zodToJsonSchema(refresherEmitSchema),
      },
    ],
    onText: () => {},
  })

  if (result.refused) return []
  const call = result.toolCalls.find((c) => c.name === 'emit_questions')
  if (!call) return []

  let parsed: z.infer<typeof refresherEmitSchema>
  try {
    parsed = refresherEmitSchema.parse(JSON.parse(call.argumentsJson))
  } catch {
    return []
  }

  const { kept } = screenGenerated(
    parsed.questions.map((q) => ({
      topicId: q.topicId,
      text: q.text,
      type: q.type,
      difficulty: 'MEDIUM' as const,
      marks: 1,
      options: q.options,
      solution: q.solution,
      explanation: q.explanation,
    })),
    { allowedTopicIds, allowedTypes: OBJECTIVE_REFRESH_TYPES },
  )
  if (kept.length === 0) return []

  // De-duplicate against the existing bank and within this batch.
  const existing = await ctx.db.question.findMany({
    where: { classSubjectId: input.classSubjectId, deletedAt: null, status: { not: 'ARCHIVED' } },
    select: { fingerprint: true, text: true },
    take: 1000,
  })
  const seen = new Map<string, string>(existing.map((r) => [r.fingerprint, r.text]))

  const created: string[] = []
  for (const q of kept) {
    const fingerprint = fingerprintOf(q.text)
    if (seen.has(fingerprint)) continue
    if ([...seen.values()].some((text) => similarity(text, q.text) >= SIMILARITY_THRESHOLD)) continue
    seen.set(fingerprint, q.text)

    const row = await ctx.db.question.create({
      data: {
        tenantId: ctx.tenant.id,
        classSubjectId: input.classSubjectId,
        text: q.text.trim(),
        type: q.type,
        difficulty: 'MEDIUM',
        marks: 1,
        bloomLevel: 'UNDERSTAND',
        solution: q.solution?.trim() || null,
        explanation: q.explanation?.trim() || null,
        origin: 'AI',
        status: 'DRAFT',
        fingerprint,
        createdById: ctx.user.userId,
        options: {
          create: (q.options ?? []).map((option, position) => ({
            tenantId: ctx.tenant.id,
            text: option.text,
            isCorrect: option.isCorrect,
            position,
          })),
        },
        topics: { create: [{ tenantId: ctx.tenant.id, topicId: q.topicId }] },
      },
      select: { id: true },
    })
    created.push(row.id)
  }

  return created
}

function shuffle<T>(items: T[]): T[] {
  // Deterministic-free shuffle is fine here — selection variety, not security.
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = out[i]!
    const b = out[j]!
    out[i] = b
    out[j] = a
  }
  return out
}

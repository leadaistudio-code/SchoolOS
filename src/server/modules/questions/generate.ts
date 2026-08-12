import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, notFound } from '@/server/api/response'
import { assertClassSubjectAccess } from '@/server/scope'
import { publishedTopics } from '@/server/modules/curriculum/service'
import { assistantConfigured, assistantModel } from '@/server/assistant/providers'
import { zodToJsonSchema } from '@/server/assistant/json-schema'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { fingerprintOf, similarity, SIMILARITY_THRESHOLD } from './service'
import { BLOOM_LEVELS, DIFFICULTIES, QUESTION_TYPES, QUESTION_TYPE_LABEL } from '@/lib/questions'

/**
 * Question generation.
 *
 * Three rules make this safe enough to put in front of a teacher, and all three
 * are enforced here rather than asked for in the prompt:
 *
 *   1. Scope comes from the database. The model is given the topics the school
 *      actually recorded, with their summaries; it never receives a class name
 *      and a free hand. A question tagged with a topic outside the requested
 *      set is discarded after generation, so the rule survives the model
 *      ignoring it.
 *   2. Output lands as DRAFT. Nothing generated can reach a paper until a
 *      teacher approves it, and approval is a separate endpoint.
 *   3. Nothing is trusted from the client. The caller sends ids; class,
 *      subject, syllabus and authorisation are all resolved server-side.
 *
 * The model is asked for structured output through the same tool mechanism the
 * assistant uses, so there is one adapter, one JSON-schema converter, and
 * `AI_DRIVER` keeps switching provider for both.
 */

export const generateSchema = z.object({
  classSubjectId: z.string().min(1),
  chapterIds: z.array(z.string().min(1)).max(50).default([]),
  topicIds: z.array(z.string().min(1)).max(100).default([]),
  count: z.coerce.number().int().min(1).max(15),
  types: z.array(z.enum(QUESTION_TYPES)).min(1).max(6),
  difficulty: z.enum(DIFFICULTIES).default('MEDIUM'),
  marks: z.coerce.number().min(0.5).max(20).default(1),
  bloomLevels: z.array(z.enum(BLOOM_LEVELS)).max(6).default([]),
  /** Free-text steer from the teacher: "focus on numericals", "board style". */
  note: z.string().trim().max(500).optional(),
})

export type GenerateInput = z.infer<typeof generateSchema>

/** What the model must return. Converted to JSON Schema for the tool call. */
const generatedQuestion = z.object({
  topicId: z
    .string()
    .describe('The id of the topic this question comes from. Must be one of the ids listed.'),
  text: z.string().describe('The question exactly as a student should read it.'),
  type: z.enum(QUESTION_TYPES).describe('The question format.'),
  difficulty: z.enum(DIFFICULTIES),
  marks: z.number().min(0.5).max(20),
  bloomLevel: z.enum(BLOOM_LEVELS).optional(),
  options: z
    .array(
      z.object({
        text: z.string(),
        isCorrect: z.boolean(),
      }),
    )
    .optional()
    .describe('Required for multiple choice, true/false and assertion-reason. Omit otherwise.'),
  solution: z
    .string()
    .describe('The answer, or the points an answer must make to earn full marks.'),
  explanation: z.string().optional().describe('Why the answer is the answer.'),
})

const emitSchema = z.object({
  questions: z.array(generatedQuestion).describe('The generated questions.'),
})

type GeneratedQuestion = z.infer<typeof generatedQuestion>

function systemPrompt(params: {
  schoolName: string
  className: string
  subjectName: string
  topics: { id: string; name: string; summary: string | null; chapter: string; outcomes: string[] }[]
  input: GenerateInput
}): string {
  const { className, subjectName, topics, input } = params

  const topicBlock = topics
    .map((topic) => {
      const outcomes =
        topic.outcomes.length > 0 ? `\n  Learning outcomes: ${topic.outcomes.join('; ')}` : ''
      const summary = topic.summary ? `\n  Covers: ${topic.summary}` : ''
      return `- id: ${topic.id}\n  Chapter: ${topic.chapter}\n  Topic: ${topic.name}${summary}${outcomes}`
    })
    .join('\n')

  const typeList = input.types.map((type) => `${type} (${QUESTION_TYPE_LABEL[type]})`).join(', ')

  return `You are setting examination questions for ${className} ${subjectName}.

# The syllabus you may draw on
These are the only topics in scope. Every question must come from exactly one of them, and you must return its id.

${topicBlock}

# Hard rules
- Do not introduce any concept, term, formula or example that is not part of one of the topics above. A question a student has not been taught is worse than no question: it is marked wrong and the teacher is blamed for it.
- Where a topic has a "Covers" summary, that summary is the boundary of what has been taught. Do not assume the standard textbook treatment goes further.
- Write at the level of ${className}. Vocabulary, sentence length and expected answer length must all suit that age.
- Every question must be answerable from the syllabus alone, without outside reading.
- Return the answer for every question. For anything descriptive, return the points an answer must make rather than pretending there is one exact wording.
- Do not number the questions. Do not write "Q1." or "Question 1". The paper numbers them.
- Do not repeat a question, or ask the same thing twice in different words.

# What is being asked for
- ${input.count} questions.
- Formats allowed: ${typeList}. Use only these.
- Difficulty: ${input.difficulty.toLowerCase()}.
- Marks per question: ${input.marks}.
${input.bloomLevels.length > 0 ? `- Aim for these Bloom's levels: ${input.bloomLevels.join(', ')}.` : ''}
${input.note ? `- The teacher adds: ${input.note}` : ''}

For multiple choice, give four options with exactly one correct. For true/false, give the two options. For every other format, omit options entirely.

Call the emit_questions tool exactly once with all of the questions. Do not write anything else.`
}

/**
 * The guarantee behind the prompt.
 *
 * Everything in the system prompt is a request the model may ignore; this is
 * the part that holds. A question tagged with a topic the teacher did not
 * select, or written in a format they did not ask for, is discarded rather
 * than shown — because "mostly on syllabus" is not a property anyone can act
 * on when the paper reaches a child.
 */
export function screenGenerated(
  questions: GeneratedQuestion[],
  rules: { allowedTopicIds: Set<string>; allowedTypes: readonly string[] },
): { kept: GeneratedQuestion[]; rejected: string[] } {
  const kept: GeneratedQuestion[] = []
  const rejected: string[] = []

  for (const question of questions) {
    if (!rules.allowedTopicIds.has(question.topicId)) {
      rejected.push('outside the selected syllabus')
      continue
    }
    if (!rules.allowedTypes.includes(question.type)) {
      rejected.push('wrong format')
      continue
    }
    if (question.text.trim().length < 5) {
      rejected.push('empty')
      continue
    }
    if (['MCQ', 'TRUE_FALSE', 'ASSERTION_REASON'].includes(question.type)) {
      const options = question.options ?? []
      if (options.length < 2 || !options.some((option) => option.isCorrect)) {
        rejected.push('no correct option')
        continue
      }
    }
    kept.push(question)
  }

  return { kept, rejected }
}

export async function generateQuestions(ctx: AppContext, input: GenerateInput) {
  await assertClassSubjectAccess(ctx, input.classSubjectId)

  if (!assistantConfigured()) {
    throw new ApiException(
      409,
      'AI_NOT_CONFIGURED',
      'Question generation is switched off. An administrator sets AI_DRIVER and AI_API_KEY on the deployment.',
    )
  }
  if (!(await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST))) {
    throw new ApiException(
      402,
      'FEATURE_LOCKED',
      'Question generation is not part of this school’s plan.',
    )
  }

  const topics = await publishedTopics(
    ctx,
    input.classSubjectId,
    input.chapterIds.length > 0 ? input.chapterIds : undefined,
  )

  const scoped =
    input.topicIds.length > 0
      ? topics.filter((topic) => input.topicIds.includes(topic.id))
      : topics

  if (scoped.length === 0) {
    throw new ApiException(
      409,
      'NO_SYLLABUS',
      'There are no published topics in that scope. Publish the syllabus first — questions are generated from it, not from the subject name.',
    )
  }

  const classSubject = await ctx.db.classSubject.findFirst({
    where: { id: input.classSubjectId },
    select: {
      classLevel: { select: { name: true } },
      subject: { select: { name: true } },
    },
  })
  if (!classSubject) throw notFound('Class subject')

  const allowedTopicIds = new Set(scoped.map((topic) => topic.id))

  const system = systemPrompt({
    schoolName: ctx.tenant.school?.name ?? ctx.tenant.name,
    className: classSubject.classLevel.name,
    subjectName: classSubject.subject.name,
    topics: scoped.map((topic) => ({
      id: topic.id,
      name: topic.name,
      summary: topic.summary,
      chapter: topic.chapter.name,
      outcomes: topic.outcomes.map((outcome) => outcome.statement),
    })),
    input,
  })

  const model = assistantModel()
  const result = await model.turn({
    system,
    turns: [{ role: 'user', text: 'Generate the questions now.' }],
    tools: [
      {
        name: 'emit_questions',
        description: 'Return the generated questions. Call this exactly once.',
        parameters: zodToJsonSchema(emitSchema),
      },
    ],
    onText: () => {},
  })

  if (result.refused) {
    throw new ApiException(
      502,
      'AI_REFUSED',
      'The model declined to generate these questions. Try narrowing the topics or rewording the note.',
    )
  }

  const call = result.toolCalls.find((toolCall) => toolCall.name === 'emit_questions')
  if (!call) {
    throw new ApiException(
      502,
      'AI_NO_OUTPUT',
      'The model did not return any questions. Please try again.',
    )
  }

  let parsed: z.infer<typeof emitSchema>
  try {
    parsed = emitSchema.parse(JSON.parse(call.argumentsJson))
  } catch {
    throw new ApiException(
      502,
      'AI_BAD_OUTPUT',
      'The generated questions could not be read. Please try again.',
    )
  }

  const { kept: candidates, rejected } = screenGenerated(parsed.questions, {
    allowedTopicIds,
    allowedTypes: input.types,
  })

  // Against the existing bank, and against each other within this batch.
  const existing = await ctx.db.question.findMany({
    where: {
      classSubjectId: input.classSubjectId,
      deletedAt: null,
      status: { not: 'ARCHIVED' },
    },
    select: { text: true, fingerprint: true },
    take: 1000,
  })

  const seen = new Map<string, string>(existing.map((row) => [row.fingerprint, row.text]))
  const accepted: GeneratedQuestion[] = []
  let duplicates = 0

  for (const question of candidates) {
    const fingerprint = fingerprintOf(question.text)
    if (seen.has(fingerprint)) {
      duplicates += 1
      continue
    }
    const tooClose = [...seen.values()].some(
      (text) => similarity(text, question.text) >= SIMILARITY_THRESHOLD,
    )
    if (tooClose) {
      duplicates += 1
      continue
    }
    seen.set(fingerprint, question.text)
    accepted.push(question)
  }

  if (accepted.length === 0) {
    throw new ApiException(
      409,
      'NOTHING_USABLE',
      duplicates > 0
        ? 'Everything generated was already in the bank. Try a different chapter or a different format.'
        : 'Nothing generated was usable against the selected syllabus. Try again, or narrow the topics.',
    )
  }

  const created = await ctx.db.$transaction(
    accepted.map((question) =>
      ctx.db.question.create({
        data: {
          tenantId: ctx.tenant.id,
          classSubjectId: input.classSubjectId,
          text: question.text.trim(),
          type: question.type,
          difficulty: question.difficulty,
          marks: question.marks,
          bloomLevel: question.bloomLevel ?? null,
          solution: question.solution?.trim() || null,
          explanation: question.explanation?.trim() || null,
          origin: 'AI',
          // Never APPROVED. A teacher reads it first; that is the whole point.
          status: 'DRAFT',
          fingerprint: fingerprintOf(question.text),
          createdById: ctx.user.userId,
          options: {
            create: (question.options ?? []).map((option, position) => ({
              tenantId: ctx.tenant.id,
              text: option.text,
              isCorrect: option.isCorrect,
              position,
            })),
          },
          topics: { create: [{ tenantId: ctx.tenant.id, topicId: question.topicId }] },
        },
        select: { id: true },
      }),
    ),
  )

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'question.generate',
    module: 'questionbank',
    entityType: 'ClassSubject',
    entityId: input.classSubjectId,
    summary: `Generated ${created.length} draft questions (${duplicates} duplicates and ${rejected.length} off-syllabus discarded)`,
  })

  return {
    created: created.length,
    ids: created.map((row) => row.id),
    duplicates,
    rejected: rejected.length,
    asked: input.count,
  }
}

/* -------------------------------------------------------------------------- */

export const TRANSFORMS = {
  EASIER: 'Rewrite it so a weaker student can attempt it, without changing what it tests.',
  HARDER: 'Rewrite it to demand more, staying inside the same topic.',
  SIMPLIFY: 'Rewrite the wording in plainer language. Do not change the difficulty of the task.',
  TO_MCQ: 'Rewrite it as a multiple choice question with four options, exactly one correct.',
  TO_DESCRIPTIVE: 'Rewrite it as a descriptive question with no options.',
  SIMILAR: 'Write a different question testing the same thing, on the same topic.',
} as const

export type TransformKey = keyof typeof TRANSFORMS

export const transformSchema = z.object({
  action: z.enum(Object.keys(TRANSFORMS) as [TransformKey, ...TransformKey[]]),
})

/**
 * One question in, one draft variant out.
 *
 * Always a new DRAFT row rather than an edit in place. The teacher asked for an
 * alternative, not a replacement — and if the variant is worse, the original is
 * still there, which is not true of a destructive rewrite.
 */
export async function transformQuestion(ctx: AppContext, id: string, action: TransformKey) {
  if (!assistantConfigured()) {
    throw new ApiException(409, 'AI_NOT_CONFIGURED', 'Question generation is switched off.')
  }
  if (!(await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST))) {
    throw new ApiException(402, 'FEATURE_LOCKED', 'This is not part of the school’s plan.')
  }

  const source = await ctx.db.question.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      classSubjectId: true,
      text: true,
      type: true,
      difficulty: true,
      marks: true,
      bloomLevel: true,
      solution: true,
      topics: {
        select: {
          topicId: true,
          topic: {
            select: {
              name: true,
              summary: true,
              chapter: { select: { name: true } },
            },
          },
        },
      },
      classSubject: {
        select: {
          classLevel: { select: { name: true } },
          subject: { select: { name: true } },
        },
      },
    },
  })
  if (!source) throw notFound('Question')
  await assertClassSubjectAccess(ctx, source.classSubjectId)

  if (source.topics.length === 0) {
    throw new ApiException(
      409,
      'NOT_TAGGED',
      'Tag this question with a topic first, so the rewrite stays inside the syllabus.',
    )
  }

  const topic = source.topics[0]!
  const targetType =
    action === 'TO_MCQ' ? 'MCQ' : action === 'TO_DESCRIPTIVE' ? 'DESCRIPTIVE' : source.type

  const system = `You are rewriting one examination question for ${source.classSubject.classLevel.name} ${source.classSubject.subject.name}.

# The topic it must stay inside
Chapter: ${topic.topic.chapter.name}
Topic: ${topic.topic.name}${topic.topic.summary ? `\nCovers: ${topic.topic.summary}` : ''}

# The question
${source.text}
${source.solution ? `\nCurrent answer: ${source.solution}` : ''}

# What to do
${TRANSFORMS[action]}

# Hard rules
- Stay inside the topic above. Introduce nothing that is not part of it.
- Return exactly one question, with its answer.
- Return the topic id ${topic.topicId}.
- Use the format ${targetType}.
- Do not number the question.

Call emit_questions once with a single question.`

  const model = assistantModel()
  const result = await model.turn({
    system,
    turns: [{ role: 'user', text: 'Rewrite it now.' }],
    tools: [
      {
        name: 'emit_questions',
        description: 'Return the rewritten question. Call this exactly once.',
        parameters: zodToJsonSchema(emitSchema),
      },
    ],
    onText: () => {},
  })

  const call = result.toolCalls.find((toolCall) => toolCall.name === 'emit_questions')
  if (!call) {
    throw new ApiException(502, 'AI_NO_OUTPUT', 'The model returned nothing. Please try again.')
  }

  let variant: GeneratedQuestion | undefined
  try {
    variant = emitSchema.parse(JSON.parse(call.argumentsJson)).questions[0]
  } catch {
    throw new ApiException(502, 'AI_BAD_OUTPUT', 'The rewrite could not be read. Please try again.')
  }
  if (!variant) {
    throw new ApiException(502, 'AI_NO_OUTPUT', 'The model returned nothing. Please try again.')
  }

  const created = await ctx.db.question.create({
    data: {
      tenantId: ctx.tenant.id,
      classSubjectId: source.classSubjectId,
      text: variant.text.trim(),
      type: targetType,
      difficulty: variant.difficulty,
      marks: variant.marks || source.marks,
      bloomLevel: variant.bloomLevel ?? source.bloomLevel,
      solution: variant.solution?.trim() || null,
      explanation: variant.explanation?.trim() || null,
      origin: 'AI',
      status: 'DRAFT',
      fingerprint: fingerprintOf(variant.text),
      createdById: ctx.user.userId,
      options: {
        create: (variant.options ?? []).map((option, position) => ({
          tenantId: ctx.tenant.id,
          text: option.text,
          isCorrect: option.isCorrect,
          position,
        })),
      },
      topics: { create: [{ tenantId: ctx.tenant.id, topicId: topic.topicId }] },
    },
    select: { id: true },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'question.transform',
    module: 'questionbank',
    entityType: 'Question',
    entityId: created.id,
    summary: `Created a ${action.toLowerCase().replace('_', ' ')} variant of an existing question`,
  })

  return { id: created.id }
}

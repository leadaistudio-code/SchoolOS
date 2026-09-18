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
import {
  allocateDifficultyCounts,
} from '@/server/modules/ai-assessment/allocate'

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

const difficultyMixSchema = z
  .object({
    easy: z.coerce.number().min(0).max(100),
    medium: z.coerce.number().min(0).max(100),
    hard: z.coerce.number().min(0).max(100),
  })
  .superRefine((mix, ctx) => {
    const sum = mix.easy + mix.medium + mix.hard
    if (sum !== 100) {
      ctx.addIssue({
        code: 'custom',
        message: `Difficulty mix must add up to 100% (got ${sum}%)`,
      })
    }
  })

export const generateSchema = z.object({
  classSubjectId: z.string().min(1),
  sourceMode: z.enum(['SYLLABUS', 'TEXTBOOK']).default('SYLLABUS'),
  textbookId: z.string().optional(),
  pageStart: z.coerce.number().int().min(1).optional(),
  pageEnd: z.coerce.number().int().min(1).optional(),
  chapterIds: z.array(z.string().min(1)).max(50).default([]),
  topicIds: z.array(z.string().min(1)).max(100).default([]),
  /** Optional chapter weightage (%). When set, generation biases toward heavier chapters. */
  chapterWeights: z
    .array(
      z.object({
        chapterId: z.string().min(1),
        percent: z.coerce.number().min(1).max(100),
      }),
    )
    .max(30)
    .default([]),
  count: z.coerce.number().int().min(1).max(15),
  types: z.array(z.enum(QUESTION_TYPES)).min(1).max(6),
  difficulty: z.enum(DIFFICULTIES).default('MEDIUM'),
  /** When set, runs difficulty-targeted passes instead of a single difficulty. */
  difficultyMix: difficultyMixSchema.optional(),
  marks: z.coerce.number().min(0.5).max(20).default(1),
  bloomLevels: z.array(z.enum(BLOOM_LEVELS)).max(6).default([]),
  createPaper: z.coerce.boolean().default(false),
  assessmentTypeId: z.string().optional(),
  paperTitle: z.string().trim().max(160).optional(),
  /** Declared paper total (may differ from sum of generated marks until teacher balances). */
  paperTotalMarks: z.coerce.number().min(1).max(500).optional(),
  durationMinutes: z.coerce.number().int().min(5).max(360).optional(),
  paperInstructions: z.string().trim().max(4000).optional(),
  /** Free-text steer from the teacher: "focus on numericals", "board style". */
  note: z.string().trim().max(500).optional(),
}).superRefine((input, ctx) => {
  if (input.sourceMode === 'TEXTBOOK') {
    if (!input.textbookId) {
      ctx.addIssue({ code: 'custom', path: ['textbookId'], message: 'Choose a textbook' })
    }
    if (!input.pageStart || !input.pageEnd) {
      ctx.addIssue({ code: 'custom', path: ['pageStart'], message: 'Choose a page range' })
    } else if (input.pageEnd < input.pageStart) {
      ctx.addIssue({ code: 'custom', path: ['pageEnd'], message: 'End page must follow start page' })
    } else if (input.pageEnd - input.pageStart > 29) {
      ctx.addIssue({ code: 'custom', path: ['pageEnd'], message: 'Select at most 30 pages at a time' })
    }
  }
  if (input.chapterWeights.length > 0) {
    const sum = input.chapterWeights.reduce((s, w) => s + w.percent, 0)
    if (sum !== 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['chapterWeights'],
        message: `Chapter weightage must add up to 100% (got ${sum}%)`,
      })
    }
  }
  if (input.createPaper) {
    if (!input.assessmentTypeId) {
      ctx.addIssue({ code: 'custom', path: ['assessmentTypeId'], message: 'Choose the kind of test' })
    }
    if (!input.paperTitle || input.paperTitle.length < 3) {
      ctx.addIssue({ code: 'custom', path: ['paperTitle'], message: 'Give the paper a title' })
    }
    if (!input.durationMinutes) {
      ctx.addIssue({ code: 'custom', path: ['durationMinutes'], message: 'Enter the time allowed' })
    }
  }
})

export type GenerateInput = z.infer<typeof generateSchema>

/** What the model must return. Converted to JSON Schema for the tool call. */
const generatedQuestion = z.object({
  topicId: z
    .string()
    .optional()
    .describe('The id of the topic this question comes from. Must be one of the ids listed.'),
  sourcePageNumber: z.number().int().positive().optional(),
  evidence: z
    .string()
    .optional()
    .describe('An exact supporting quote copied from the selected textbook page.'),
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

const TYPE_ALIASES: Record<string, (typeof QUESTION_TYPES)[number]> = Object.fromEntries([
  ...QUESTION_TYPES.map((type) => [type.toLowerCase(), type] as const),
  ...Object.entries(QUESTION_TYPE_LABEL).map(
    ([key, label]) => [label.toLowerCase(), key as (typeof QUESTION_TYPES)[number]] as const,
  ),
  ['multiple choice', 'MCQ'],
  ['mcqs', 'MCQ'],
  ['true/false', 'TRUE_FALSE'],
  ['true false', 'TRUE_FALSE'],
  ['higher order thinking', 'HOTS'],
  ['hot', 'HOTS'],
  ['fill blanks', 'FILL_BLANK'],
  ['fill in the blanks', 'FILL_BLANK'],
]) as Record<string, (typeof QUESTION_TYPES)[number]>

const DIFFICULTY_ALIASES: Record<string, (typeof DIFFICULTIES)[number]> = {
  easy: 'EASY',
  medium: 'MEDIUM',
  hard: 'HARD',
  moderate: 'MEDIUM',
  difficult: 'HARD',
}

function stripNulls(value: unknown): unknown {
  if (value === null) return undefined
  if (Array.isArray(value)) return value.map(stripNulls)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        stripNulls(nested),
      ]),
    )
  }
  return value
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', 'yes', '1', 'correct'].includes(normalized)) return true
    if (['false', 'no', '0', 'incorrect'].includes(normalized)) return false
  }
  return undefined
}

function normalizeQuestionDraft(raw: unknown, fallbackMarks: number): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const row = { ...(raw as Record<string, unknown>) }

  if (typeof row.type === 'string') {
    const mapped = TYPE_ALIASES[row.type.trim().toLowerCase()]
    if (mapped) row.type = mapped
  }
  if (typeof row.difficulty === 'string') {
    const mapped = DIFFICULTY_ALIASES[row.difficulty.trim().toLowerCase()]
    if (mapped) row.difficulty = mapped
    else row.difficulty = row.difficulty.trim().toUpperCase()
  }
  if (typeof row.bloomLevel === 'string') {
    row.bloomLevel = row.bloomLevel.trim().toUpperCase()
  }
  if (typeof row.sourcePageNumber === 'string' && row.sourcePageNumber.trim()) {
    row.sourcePageNumber = Number(row.sourcePageNumber)
  }
  if (typeof row.marks === 'string' && row.marks.trim()) {
    row.marks = Number(row.marks)
  }
  if (row.marks === undefined || row.marks === null || row.marks === '' || Number.isNaN(row.marks)) {
    row.marks = fallbackMarks
  }
  if (typeof row.text === 'string') row.text = row.text.trim()
  if (typeof row.solution !== 'string' || !row.solution.trim()) {
    row.solution = 'See marking points with the teacher.'
  }
  if (typeof row.evidence === 'string') row.evidence = row.evidence.trim()
  if (typeof row.topicId === 'string' && !row.topicId.trim()) {
    delete row.topicId
  }

  // Models sometimes return options as plain strings or use alternate keys.
  if (Array.isArray(row.options)) {
    row.options = row.options
      .map((option, index) => {
        if (typeof option === 'string') {
          return { text: option.trim(), isCorrect: index === 0 }
        }
        if (!option || typeof option !== 'object') return null
        const item = { ...(option as Record<string, unknown>) }
        const correct =
          coerceBoolean(item.isCorrect) ??
          coerceBoolean(item.correct) ??
          coerceBoolean(item.is_correct)
        if (correct !== undefined) item.isCorrect = correct
        else if (item.isCorrect === undefined) item.isCorrect = false
        if (typeof item.text !== 'string') {
          item.text = String(item.label ?? item.option ?? item.text ?? '').trim()
        } else {
          item.text = item.text.trim()
        }
        if (!item.text) return null
        return { text: item.text, isCorrect: Boolean(item.isCorrect) }
      })
      .filter(Boolean)
  }

  // MCQ/TF without options → drop options so the screener can reject cleanly.
  if (
    Array.isArray(row.options) &&
    row.options.length === 0 &&
    ['MCQ', 'TRUE_FALSE', 'ASSERTION_REASON'].includes(String(row.type))
  ) {
    delete row.options
  }

  return row
}

/** Best-effort parse of tool JSON — OpenAI strict mode sends nulls; streams can truncate. */
export function parseEmitQuestions(
  argumentsJson: string,
  fallbackMarks = 1,
): z.infer<typeof emitSchema> {
  let raw: unknown
  try {
    raw = JSON.parse(argumentsJson)
  } catch {
    const trimmed = argumentsJson.trim().replace(/,\s*$/, '')
    const lastBrace = trimmed.lastIndexOf('}')
    if (lastBrace < 0) throw new Error('unparseable tool arguments')
    let candidate = trimmed.slice(0, lastBrace + 1)
    const openBrackets = (candidate.match(/\[/g) ?? []).length
    const closeBrackets = (candidate.match(/\]/g) ?? []).length
    candidate += ']'.repeat(Math.max(0, openBrackets - closeBrackets))
    const openBraces = (candidate.match(/\{/g) ?? []).length
    const closeBraces = (candidate.match(/\}/g) ?? []).length
    candidate += '}'.repeat(Math.max(0, openBraces - closeBraces))
    raw = JSON.parse(candidate)
  }

  const cleaned = stripNulls(raw)
  const root =
    cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned)
      ? (cleaned as Record<string, unknown>)
      : { questions: cleaned }
  const list = Array.isArray(root.questions)
    ? root.questions
    : Array.isArray(cleaned)
      ? cleaned
      : []

  const questions: GeneratedQuestion[] = []
  for (const item of list) {
    const normalized = normalizeQuestionDraft(stripNulls(item), fallbackMarks)
    const parsed = generatedQuestion.safeParse(normalized)
    if (parsed.success) questions.push(parsed.data)
  }

  if (questions.length === 0) {
    return emitSchema.parse(stripNulls(raw))
  }
  return { questions }
}

/** Keep textbook prompts small enough that generation finishes before proxies give up. */
const MAX_PROMPT_SOURCE_CHARS = 24_000

function truncatePagesForPrompt(
  pages: { pageNumber: number; text: string }[],
): { pageNumber: number; text: string }[] {
  const total = pages.reduce((sum, page) => sum + page.text.length, 0)
  if (total <= MAX_PROMPT_SOURCE_CHARS) return pages
  const budget = Math.max(600, Math.floor(MAX_PROMPT_SOURCE_CHARS / Math.max(1, pages.length)))
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    text:
      page.text.length <= budget
        ? page.text
        : `${page.text.slice(0, budget)}\n[…truncated for generation…]`,
  }))
}

/** OCR and model quotes often differ on spaces/punctuation — accept near matches. */
function pageSupportsEvidence(pageText: string, evidence: string): boolean {
  const page = pageText.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
  const ev = evidence.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
  if (ev.length < 12) return false
  if (page.includes(ev)) return true
  const compactPage = page.replace(/[^a-z0-9]/g, '')
  const compactEv = ev.replace(/[^a-z0-9]/g, '')
  if (compactEv.length >= 16 && compactPage.includes(compactEv)) return true
  if (ev.length > 40) {
    const head = ev.slice(0, Math.min(64, ev.length))
    if (page.includes(head)) return true
  }
  // Token overlap for short paraphrased quotes from the page.
  const tokens = ev.split(' ').filter((t) => t.length > 3)
  if (tokens.length >= 4) {
    const hits = tokens.filter((t) => page.includes(t)).length
    if (hits / tokens.length >= 0.7) return true
  }
  return false
}

function findSupportingPage(
  evidence: string,
  preferredPage: number | undefined,
  sourceTextByPage: Map<number, string>,
): number | undefined {
  if (preferredPage) {
    const preferred = sourceTextByPage.get(preferredPage)
    if (preferred && pageSupportsEvidence(preferred, evidence)) return preferredPage
  }
  for (const [pageNumber, text] of sourceTextByPage) {
    if (pageSupportsEvidence(text, evidence)) return pageNumber
  }
  return undefined
}

function chapterWeightPromptBlock(
  topics: { chapter: string }[],
  weights: { chapterId: string; percent: number }[],
  chapterNames: Map<string, string>,
): string {
  if (weights.length === 0) return ''
  const lines = weights
    .map((w) => {
      const name = chapterNames.get(w.chapterId) ?? w.chapterId
      return `- ${name}: about ${w.percent}% of the questions`
    })
    .join('\n')
  const chaptersInTopics = new Set(topics.map((t) => t.chapter))
  return `- Chapter weightage (approximate — stay inside these chapters only):\n${lines}\n- Chapters available in the syllabus list: ${[...chaptersInTopics].join(', ') || 'as listed'}.\n`
}

function systemPrompt(params: {
  schoolName: string
  className: string
  subjectName: string
  topics: { id: string; name: string; summary: string | null; chapter: string; outcomes: string[] }[]
  textbook?: { title: string; board: string; pages: { pageNumber: number; text: string }[] }
  input: GenerateInput
  /** How many questions to ask the model for this pass (may exceed the teacher target). */
  askCount: number
  avoidTexts?: string[]
  chapterNames?: Map<string, string>
}): string {
  const { className, subjectName, topics, textbook, input, askCount, avoidTexts, chapterNames } =
    params

  const topicBlock = topics
    .map((topic) => {
      const outcomes =
        topic.outcomes.length > 0 ? `\n  Learning outcomes: ${topic.outcomes.join('; ')}` : ''
      const summary = topic.summary ? `\n  Covers: ${topic.summary}` : ''
      return `- id: ${topic.id}\n  Chapter: ${topic.chapter}\n  Topic: ${topic.name}${summary}${outcomes}`
    })
    .join('\n')

  const typeList = input.types.map((type) => `${type} (${QUESTION_TYPE_LABEL[type]})`).join(', ')
  const promptPages = textbook ? truncatePagesForPrompt(textbook.pages) : []
  const sourceBlock = textbook
    ? `# The only source you may use
Textbook: ${textbook.title}
Board/module: ${textbook.board}

${promptPages.map((page) => `[PAGE ${page.pageNumber}]\n${page.text}`).join('\n\n')}

For every question, return sourcePageNumber and copy one exact supporting sentence or phrase from that page into evidence. Do not use memory or outside knowledge. If the pages do not support enough questions, return fewer questions.`
    : `# The syllabus you may draw on
These are the only topics in scope. Every question must come from exactly one of them, and you must return its id.

${topicBlock}`

  const avoidBlock =
    avoidTexts && avoidTexts.length > 0
      ? `\n# Do not repeat these questions (already accepted)\n${avoidTexts
          .slice(0, 20)
          .map((text, i) => `${i + 1}. ${text}`)
          .join('\n')}\n`
      : ''

  const chapterWeightBlock = chapterWeightPromptBlock(
    topics,
    input.chapterWeights,
    chapterNames ?? new Map(),
  )

  return `You are setting examination questions for ${className} ${subjectName}.

${sourceBlock}
${avoidBlock}
# Hard rules
- Do not introduce any concept, term, formula or example that is not present in the source above. A question a student has not been taught is worse than no question.
- Where a topic has a "Covers" summary, that summary is the boundary of what has been taught. Do not assume the standard textbook treatment goes further.
- Write at the level of ${className}. Vocabulary, sentence length and expected answer length must all suit that age.
- Every question must be answerable from the supplied source alone, without outside reading.
- Return the answer for every question. For anything descriptive, return the points an answer must make rather than pretending there is one exact wording.
- Do not number the questions. Do not write "Q1." or "Question 1". The paper numbers them.
- Do not repeat a question, or ask the same thing twice in different words.

# What is being asked for
- Return ${askCount} questions if the source supports that many. Never invent content outside the source to pad the count.
- Formats allowed: ${typeList}. Use only these.
- Difficulty for this batch: ${input.difficulty.toLowerCase()}. Every question in this batch must be ${input.difficulty.toLowerCase()}.
- Marks per question: ${input.marks}.
${chapterWeightBlock}${input.bloomLevels.length > 0 ? `- Aim for these Bloom's levels: ${input.bloomLevels.join(', ')}.` : ''}
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
  rules: {
    allowedTopicIds: Set<string>
    allowedTypes: readonly string[]
    sourceTextByPage?: Map<number, string>
    /** When set, retarget mismatched difficulty to the batch target. */
    requiredDifficulty?: (typeof DIFFICULTIES)[number]
  },
): { kept: GeneratedQuestion[]; rejected: string[] } {
  const kept: GeneratedQuestion[] = []
  const rejected: string[] = []

  for (let question of questions) {
    if (!rules.sourceTextByPage && (!question.topicId || !rules.allowedTopicIds.has(question.topicId))) {
      rejected.push('outside the selected syllabus')
      continue
    }
    if (rules.sourceTextByPage) {
      const evidence = question.evidence?.trim() ?? ''
      const matchedPage = findSupportingPage(
        evidence,
        question.sourcePageNumber,
        rules.sourceTextByPage,
      )
      if (!matchedPage) {
        rejected.push('not supported by the selected textbook pages')
        continue
      }
      question = { ...question, topicId: undefined, sourcePageNumber: matchedPage }
    }
    if (!rules.allowedTypes.includes(question.type)) {
      rejected.push('wrong format')
      continue
    }
    if (rules.requiredDifficulty && question.difficulty !== rules.requiredDifficulty) {
      question = { ...question, difficulty: rules.requiredDifficulty }
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

  const { assertAiGenerateQuota, AI_USAGE_KIND } = await import(
    '@/server/modules/ai-assessment/usage'
  )
  await assertAiGenerateQuota(ctx.tenant.id, input.count)

  let scoped: Awaited<ReturnType<typeof publishedTopics>> = []
  let textbookSource:
    | {
        id: string
        title: string
        board: string
        pages: { pageNumber: number; text: string }[]
      }
    | undefined

  if (input.sourceMode === 'TEXTBOOK') {
    const textbook = await ctx.db.textbook.findFirst({
      where: {
        id: input.textbookId,
        classSubjectId: input.classSubjectId,
        status: 'READY',
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        board: true,
        pages: {
          where: { pageNumber: { gte: input.pageStart!, lte: input.pageEnd! } },
          orderBy: { pageNumber: 'asc' },
          select: { pageNumber: true, text: true },
        },
      },
    })
    if (!textbook) throw notFound('Ready textbook')
    const pages = textbook.pages.filter((page) => page.text.trim().length > 0)
    if (pages.length === 0) {
      throw new ApiException(409, 'EMPTY_PAGE_RANGE', 'The selected pages contain no readable text')
    }
    if (pages.reduce((sum, page) => sum + page.text.length, 0) > 100_000) {
      throw new ApiException(
        413,
        'SOURCE_TOO_LARGE',
        'These pages contain too much text. Choose a smaller page range.',
      )
    }
    textbookSource = { id: textbook.id, title: textbook.title, board: textbook.board, pages }
  } else {
    const chapterScope =
      input.chapterIds.length > 0
        ? input.chapterIds
        : input.chapterWeights.length > 0
          ? input.chapterWeights.map((w) => w.chapterId)
          : undefined
    const topics = await publishedTopics(ctx, input.classSubjectId, chapterScope)
    scoped =
      input.topicIds.length > 0
        ? topics.filter((topic) => input.topicIds.includes(topic.id))
        : topics

    if (scoped.length === 0) {
      throw new ApiException(
        409,
        'NO_SYLLABUS',
        'There are no published topics in that scope. Publish the syllabus first or choose an uploaded textbook.',
      )
    }
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
  const sourceTextByPage = textbookSource
    ? new Map(textbookSource.pages.map((page) => [page.pageNumber, page.text]))
    : undefined

  const topicPayload = scoped.map((topic) => ({
    id: topic.id,
    name: topic.name,
    summary: topic.summary,
    chapter: topic.chapter.name,
    outcomes: topic.outcomes.map((outcome) => outcome.statement),
  }))

  const chapterNames = new Map<string, string>()
  for (const topic of scoped) {
    chapterNames.set(topic.chapter.id, topic.chapter.name)
  }

  // When weightage is set, prefer topics from heavier chapters first in the prompt list.
  if (input.chapterWeights.length > 0) {
    const order = new Map(input.chapterWeights.map((w, i) => [w.chapterId, i]))
    topicPayload.sort((a, b) => {
      const topicA = scoped.find((t) => t.id === a.id)
      const topicB = scoped.find((t) => t.id === b.id)
      const wa = order.get(topicA?.chapter.id ?? '') ?? 999
      const wb = order.get(topicB?.chapter.id ?? '') ?? 999
      return wa - wb
    })
  }

  const model = assistantModel()
  const emitTool = {
    name: 'emit_questions',
    description: 'Return the generated questions. Call this exactly once.',
    parameters: zodToJsonSchema(emitSchema),
  }

  async function runGenerationPass(options: {
    askCount: number
    avoidTexts?: string[]
    difficulty?: (typeof DIFFICULTIES)[number]
  }): Promise<{ parsed: GeneratedQuestion[]; rejected: string[] }> {
    const passDifficulty = options.difficulty ?? input.difficulty
    const passInput = { ...input, difficulty: passDifficulty }
    const system = systemPrompt({
      schoolName: ctx.tenant.name,
      className: classSubject!.classLevel.name,
      subjectName: classSubject!.subject.name,
      topics: topicPayload,
      textbook: textbookSource,
      input: passInput,
      askCount: options.askCount,
      avoidTexts: options.avoidTexts,
      chapterNames,
    })

    let result
    try {
      result = await model.turn({
        system,
        turns: [
          {
            role: 'user',
            text:
              options.avoidTexts && options.avoidTexts.length > 0
                ? `Generate ${options.askCount} additional ${passDifficulty.toLowerCase()} questions now. Do not repeat any already-accepted question.`
                : `Generate ${options.askCount} ${passDifficulty.toLowerCase()} questions now.`,
          },
        ],
        tools: [emitTool],
        onText: () => {},
        stream: false,
        toolChoice: 'emit_questions',
        maxOutputTokens: 8192,
      })
    } catch (err) {
      console.error('[questions.generate] model turn failed', err)
      throw new ApiException(
        503,
        'AI_PROVIDER_ERROR',
        'Question generation timed out or the AI provider failed. Try fewer pages or fewer questions.',
      )
    }

    if (result.refused) {
      throw new ApiException(
        422,
        'AI_REFUSED',
        'The model declined to generate these questions. Try narrowing the topics or rewording the note.',
      )
    }

    let call = result.toolCalls.find((toolCall) => toolCall.name === 'emit_questions')
    if (!call) {
      try {
        result = await model.turn({
          system,
          turns: [
            { role: 'user', text: `Generate ${passDifficulty.toLowerCase()} questions now.` },
            {
              role: 'user',
              text: 'You must call emit_questions exactly once with the questions array. Do not write any other text.',
            },
          ],
          tools: [emitTool],
          onText: () => {},
          stream: false,
          toolChoice: 'emit_questions',
          maxOutputTokens: 8192,
        })
        call = result.toolCalls.find((toolCall) => toolCall.name === 'emit_questions')
      } catch (err) {
        console.error('[questions.generate] retry turn failed', err)
      }
    }

    if (!call) {
      return { parsed: [], rejected: [] }
    }

    let parsed: z.infer<typeof emitSchema>
    try {
      parsed = parseEmitQuestions(call.argumentsJson, input.marks)
    } catch (err) {
      console.error(
        '[questions.generate] bad tool JSON',
        err,
        call.argumentsJson.slice(0, 800),
      )
      return { parsed: [], rejected: [] }
    }

    const screened = screenGenerated(parsed.questions, {
      allowedTopicIds,
      allowedTypes: input.types,
      sourceTextByPage,
      requiredDifficulty: passDifficulty,
    })
    return { parsed: screened.kept, rejected: screened.rejected }
  }

  const difficultyTargets = allocateDifficultyCounts(
    input.count,
    input.difficultyMix,
    input.difficulty,
  )
  const difficultyPasses = DIFFICULTIES.filter((d) => difficultyTargets[d] > 0)

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
  let rejected: string[] = []

  const takeUsable = (questions: GeneratedQuestion[], limit?: number) => {
    const cap = limit ?? input.count
    let taken = 0
    for (const question of questions) {
      if (accepted.length >= input.count || taken >= cap) break
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
      taken += 1
    }
  }

  for (const difficulty of difficultyPasses) {
    if (accepted.length >= input.count) break
    const need = Math.min(difficultyTargets[difficulty], input.count - accepted.length)
    if (need <= 0) continue
    const askCount = Math.min(15, need + Math.ceil(need * 0.4))
    try {
      const pass = await runGenerationPass({
        askCount,
        difficulty,
        avoidTexts: accepted.map((q) => q.text),
      })
      rejected = rejected.concat(pass.rejected)
      takeUsable(pass.parsed, need)
    } catch (err) {
      if (accepted.length === 0 && difficulty === difficultyPasses[difficultyPasses.length - 1]) {
        throw err
      }
      console.error(`[questions.generate] ${difficulty} pass failed`, err)
    }
  }

  // Top-up pass when short after mix passes.
  if (accepted.length < input.count) {
    const need = input.count - accepted.length
    try {
      const topUp = await runGenerationPass({
        askCount: Math.min(15, need + 2),
        difficulty: input.difficulty,
        avoidTexts: accepted.map((q) => q.text),
      })
      rejected = rejected.concat(topUp.rejected)
      takeUsable(topUp.parsed)
    } catch (err) {
      if (accepted.length === 0) throw err
      console.error('[questions.generate] top-up pass failed', err)
    }
  }

  if (accepted.length === 0) {
    if (rejected.length === 0) {
      throw new ApiException(
        422,
        'AI_NO_OUTPUT',
        'The model did not return any questions. Please try again with fewer pages or fewer questions.',
      )
    }
    throw new ApiException(
      409,
      'NOTHING_USABLE',
      duplicates > 0
        ? 'Everything generated was already in the bank. Try a different chapter or a different format.'
        : textbookSource
          ? 'Nothing generated matched the selected textbook pages closely enough. Try a wider page range, or generate again.'
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
          source: textbookSource
            ? `${textbookSource.title} (${textbookSource.board}), page ${question.sourcePageNumber}`
            : null,
          textbookId: textbookSource?.id ?? null,
          sourcePageStart: question.sourcePageNumber ?? null,
          sourcePageEnd: question.sourcePageNumber ?? null,
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
          // Textbook mode has an empty topic set — ignore invented topic ids from the model.
          ...(question.topicId && allowedTopicIds.has(question.topicId)
            ? { topics: { create: [{ tenantId: ctx.tenant.id, topicId: question.topicId }] } }
            : {}),
        },
        select: { id: true },
      }),
    ),
  )

  let paperId: string | undefined
  if (input.createPaper) {
    ctx.require('assessments.create')
    const [session, assessmentType, template] = await Promise.all([
      ctx.db.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true } }),
      ctx.db.assessmentType.findFirst({
        where: { id: input.assessmentTypeId, isActive: true },
        select: { id: true },
      }),
      ctx.db.paperTemplate.findFirst({
        where: { isDefault: true, deletedAt: null },
        select: { id: true },
      }),
    ])
    if (!session) {
      throw new ApiException(409, 'NO_ACTIVE_SESSION', 'Create an active academic session first')
    }
    if (!assessmentType) throw notFound('Assessment type')

    const sumMarks = accepted.reduce((sum, question) => sum + question.marks, 0)
    const totalMarks = input.paperTotalMarks ?? sumMarks
    const paper = await ctx.db.$transaction(async (tx) => {
      const generatedPaper = await tx.assessment.create({
        data: {
          tenantId: ctx.tenant.id,
          sessionId: session.id,
          classSubjectId: input.classSubjectId,
          assessmentTypeId: assessmentType.id,
          templateId: template?.id ?? null,
          title: input.paperTitle!,
          totalMarks,
          durationMinutes: input.durationMinutes!,
          instructions:
            input.paperInstructions?.trim() ||
            'Answer all questions. Read each question carefully.',
          createdById: ctx.user.userId,
          status: 'DRAFT',
          sections: {
            create: [{ tenantId: ctx.tenant.id, title: 'Section A', position: 0 }],
          },
        },
        select: { id: true, sections: { select: { id: true }, take: 1 } },
      })
      const sectionId = generatedPaper.sections[0]?.id
      if (!sectionId) {
        throw new ApiException(500, 'PAPER_SECTION_MISSING', 'Paper section was not created')
      }

      for (const [position, question] of accepted.entries()) {
        await tx.assessmentQuestion.create({
          data: {
            tenantId: ctx.tenant.id,
            assessmentId: generatedPaper.id,
            sectionId,
            questionId: created[position]!.id,
            position,
            marks: question.marks,
            textSnapshot: question.text.trim(),
            optionsSnapshot: question.options?.map((option) => ({
              text: option.text,
              isCorrect: option.isCorrect,
              matchWith: null,
            })),
            answerSnapshot: question.solution?.trim() || null,
            typeSnapshot: question.type,
            difficultySnapshot: question.difficulty,
          },
        })
      }
      return generatedPaper
    })
    paperId = paper.id

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'assessment.generate',
      module: 'assessments',
      entityType: 'Assessment',
      entityId: paper.id,
      summary: `Generated draft paper ${input.paperTitle} with ${created.length} source-grounded questions`,
    })
  }

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

  if (created.length > 0) {
    await ctx.db.aiUsageEvent.create({
      data: {
        tenantId: ctx.tenant.id,
        kind: AI_USAGE_KIND.GENERATE,
        units: created.length,
        meta: {
          classSubjectId: input.classSubjectId,
          asked: input.count,
          duplicates,
          rejected: rejected.length,
          paperId: paperId ?? null,
        },
      },
    })
  }

  return {
    created: created.length,
    ids: created.map((row) => row.id),
    duplicates,
    rejected: rejected.length,
    asked: input.count,
    paperId,
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
    throw new ApiException(422, 'AI_NO_OUTPUT', 'The model returned nothing. Please try again.')
  }

  let variant: GeneratedQuestion | undefined
  try {
    variant = emitSchema.parse(JSON.parse(call.argumentsJson)).questions[0]
  } catch {
    throw new ApiException(422, 'AI_BAD_OUTPUT', 'The rewrite could not be read. Please try again.')
  }
  if (!variant) {
    throw new ApiException(422, 'AI_NO_OUTPUT', 'The model returned nothing. Please try again.')
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

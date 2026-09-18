import { z } from 'zod'
import { ApiException } from '@/server/api/response'
import { assistantConfigured, assistantModel } from '@/server/assistant/providers'
import type { ModelContentPart } from '@/server/assistant/providers/types'
import { zodToJsonSchema } from '@/server/assistant/json-schema'
import { OBJECTIVE_TYPES } from '@/lib/questions'
import { storageProvider } from '@/server/providers'

/** Below this confidence, the answer is flagged for teacher review. */
export const CONFIDENCE_REVIEW_THRESHOLD = 70

const evaluatedItemSchema = z.object({
  questionNumber: z.number().int().positive(),
  assessmentQuestionId: z.string().optional(),
  extractedText: z.string().nullable().optional(),
  ocrConfidence: z.number().min(0).max(100).nullable().optional(),
  evaluationConfidence: z.number().min(0).max(100).nullable().optional(),
  suggestedMarks: z.number().min(0).nullable().optional(),
  feedback: z.string().nullable().optional(),
  reasoning: z.string().nullable().optional(),
  conceptsCovered: z.array(z.string()).optional(),
  conceptsMissing: z.array(z.string()).optional(),
})

export const emitEvaluationSchema = z.object({
  answers: z.array(evaluatedItemSchema).min(1),
  overallNotes: z.string().optional(),
})

export type VisionEvalItem = z.infer<typeof evaluatedItemSchema>
export type VisionEvalResult = z.infer<typeof emitEvaluationSchema>

export type PaperQuestionForVision = {
  id: string
  position: number
  marks: number
  textSnapshot: string
  answerSnapshot: string | null
  typeSnapshot: string
}

export type VisionSheetInput = {
  storageKey: string
  mimeType: string
  fileName: string
  pageCount: number
  className: string
  subjectName: string
  paperTitle: string
  questions: PaperQuestionForVision[]
}

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null) continue
      out[k] = stripNulls(v)
    }
    return out
  }
  return value
}

export function parseEmitEvaluation(argumentsJson: string): VisionEvalResult {
  let raw: unknown
  try {
    raw = JSON.parse(argumentsJson)
  } catch {
    throw new ApiException(422, 'AI_BAD_OUTPUT', 'The evaluation response was not valid JSON')
  }
  const parsed = emitEvaluationSchema.safeParse(stripNulls(raw))
  if (!parsed.success) {
    throw new ApiException(422, 'AI_BAD_OUTPUT', 'The evaluation response did not match the schema')
  }
  return parsed.data
}

export function needsTeacherReview(item: {
  ocrConfidence: number | null
  evaluationConfidence: number | null
}): boolean {
  if (item.ocrConfidence == null || item.evaluationConfidence == null) return true
  return (
    item.ocrConfidence < CONFIDENCE_REVIEW_THRESHOLD ||
    item.evaluationConfidence < CONFIDENCE_REVIEW_THRESHOLD
  )
}

/** Cap base64 payload size (~4MB binary) so providers do not reject the request. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

async function loadSheetParts(
  sheet: Pick<VisionSheetInput, 'storageKey' | 'mimeType' | 'fileName'>,
): Promise<{ parts: ModelContentPart[]; mode: 'image' | 'pdf_text' | 'unavailable'; pdfText?: string }> {
  const buffer = await storageProvider().get(sheet.storageKey)

  if (sheet.mimeType.startsWith('image/')) {
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new ApiException(
        413,
        'SHEET_TOO_LARGE',
        'Answer sheet image is too large for AI evaluation. Compress it or upload fewer pages.',
      )
    }
    return {
      mode: 'image',
      parts: [
        {
          type: 'image',
          mimeType: sheet.mimeType,
          base64: Buffer.from(buffer).toString('base64'),
        },
      ],
    }
  }

  if (sheet.mimeType === 'application/pdf') {
    try {
      const { getDocumentProxy, extractText } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(buffer), {
        maxImageSize: 16_777_216,
        useSystemFonts: true,
      })
      const extracted = await extractText(pdf)
      const pdfText = (extracted.text ?? []).map((t) => t.trim()).filter(Boolean).join('\n\n')
      if (pdfText.length >= 40) {
        return {
          mode: 'pdf_text',
          pdfText: pdfText.slice(0, 60_000),
          parts: [],
        }
      }
    } catch {
      // fall through
    }
    return { mode: 'unavailable', parts: [] }
  }

  return { mode: 'unavailable', parts: [] }
}

function buildSystemPrompt(input: VisionSheetInput): string {
  const questionBlock = input.questions
    .map((q, i) => {
      const objective = OBJECTIVE_TYPES.includes(q.typeSnapshot as never)
      return `Q${i + 1} (id=${q.id}, type=${q.typeSnapshot}, maxMarks=${q.marks}${objective ? ', OBJECTIVE' : ''}):
Stem: ${q.textSnapshot}
Expected / marking points: ${q.answerSnapshot?.trim() || '(none provided — award for reasonable correct responses)'}
`
    })
    .join('\n')

  return `You are an experienced ${input.className} ${input.subjectName} examiner evaluating a student's handwritten or typed answer sheet for "${input.paperTitle}".

# Rubric rules
- Extract what the student wrote for each question (OCR). Crossed-out work should be ignored when a clearer final answer is visible.
- Award partial credit for descriptive answers using expected concepts, keywords, reasoning and working steps — not exact string match alone.
- For OBJECTIVE items (MCQ / true-false / assertion-reason), score against the expected answer key; if the sheet is ambiguous, lower confidence and suggest marks cautiously.
- suggestedMarks must be between 0 and that question's maxMarks.
- ocrConfidence and evaluationConfidence are 0–100 integers reflecting your uncertainty.
- If a question is blank or illegible, suggestedMarks=0 and explain that in feedback.
- Do not invent syllabus content the student did not write.
- Return one entry per question in the list below, using the assessmentQuestionId given.

# Questions
${questionBlock}

Call emit_evaluation exactly once with every question covered.`
}

/**
 * Provider-agnostic vision / OCR evaluation via the shared AI_DRIVER adapters.
 */
export async function evaluateAnswerSheetWithVision(
  input: VisionSheetInput,
): Promise<{
  result: VisionEvalResult
  mode: 'image' | 'pdf_text' | 'unavailable'
  model: string
}> {
  if (!assistantConfigured()) {
    throw new ApiException(
      409,
      'AI_NOT_CONFIGURED',
      'AI evaluation needs AI_DRIVER and AI_API_KEY on the deployment.',
    )
  }

  const loaded = await loadSheetParts(input)
  if (loaded.mode === 'unavailable') {
    throw new ApiException(
      409,
      'SHEET_NOT_READABLE',
      'This PDF looks scanned or empty of text. Upload a JPG/PNG of each page, or a searchable PDF, then retry.',
    )
  }

  const model = assistantModel()
  const emitTool = {
    name: 'emit_evaluation',
    description: 'Return OCR extracts and rubric-based marks for every question.',
    parameters: zodToJsonSchema(emitEvaluationSchema),
  }

  const userText =
    loaded.mode === 'pdf_text'
      ? `Evaluate this student answer sheet (text extracted from PDF "${input.fileName}"):\n\n${loaded.pdfText}`
      : `Evaluate the attached answer sheet image(s) for "${input.fileName}". Page count (approx): ${input.pageCount}.`

  const parts: ModelContentPart[] = [
    { type: 'text', text: userText },
    ...loaded.parts,
  ]

  const turn = await model.turn({
    system: buildSystemPrompt(input),
    turns: [{ role: 'user', text: userText, parts }],
    tools: [emitTool],
    onText: () => {},
    stream: false,
    toolChoice: 'emit_evaluation',
    maxOutputTokens: 8192,
  })

  if (turn.refused) {
    throw new ApiException(422, 'AI_REFUSED', 'The model declined to evaluate this sheet.')
  }

  const call = turn.toolCalls.find((c) => c.name === 'emit_evaluation')
  if (!call) {
    throw new ApiException(422, 'AI_NO_OUTPUT', 'The model did not return an evaluation.')
  }

  const result = parseEmitEvaluation(call.argumentsJson)
  return { result, mode: loaded.mode, model: model.model }
}

/**
 * Align model answers to paper questions; fill gaps with low-confidence stubs.
 */
export function alignVisionAnswers(
  questions: PaperQuestionForVision[],
  result: VisionEvalResult,
): Array<{
  assessmentQuestionId: string
  questionNumber: number
  extractedText: string | null
  ocrConfidence: number | null
  evaluationConfidence: number | null
  suggestedMarks: number | null
  maxMarks: number
  feedback: string | null
  needsReview: boolean
  rubricNotes: Record<string, unknown>
}> {
  const byId = new Map(
    result.answers.filter((a) => a.assessmentQuestionId).map((a) => [a.assessmentQuestionId!, a]),
  )
  const byNumber = new Map(result.answers.map((a) => [a.questionNumber, a]))

  return questions.map((q, index) => {
    const n = index + 1
    const item = byId.get(q.id) ?? byNumber.get(n)
    const suggested =
      item?.suggestedMarks == null
        ? null
        : Math.max(0, Math.min(q.marks, Number(item.suggestedMarks)))
    const ocr = item?.ocrConfidence ?? null
    const ev = item?.evaluationConfidence ?? null
    const needsReview = needsTeacherReview({
      ocrConfidence: ocr,
      evaluationConfidence: ev,
    })

    return {
      assessmentQuestionId: q.id,
      questionNumber: n,
      extractedText: item?.extractedText?.trim() || null,
      ocrConfidence: ocr,
      evaluationConfidence: ev,
      suggestedMarks: suggested,
      maxMarks: q.marks,
      feedback: item?.feedback?.trim() || item?.reasoning?.trim() || null,
      needsReview: needsReview || suggested == null,
      rubricNotes: {
        mode: 'vision',
        conceptsCovered: item?.conceptsCovered ?? [],
        conceptsMissing: item?.conceptsMissing ?? [],
        overallNotes: result.overallNotes ?? null,
      },
    }
  })
}

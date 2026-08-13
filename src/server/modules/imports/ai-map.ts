import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { assistantConfigured, assistantModel } from '@/server/assistant/providers'
import { zodToJsonSchema } from '@/server/assistant/json-schema'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { gridPreviewText } from '@/lib/spreadsheet'
import { IMPORT_FIELDS, type ImportFieldKey } from './fields'

const fieldKeys = IMPORT_FIELDS.map((f) => f.key) as [ImportFieldKey, ...ImportFieldKey[]]

export const importQuestionKind = z.enum([
  'pick_column',
  'pick_class',
  'pick_section',
  'confirm_value',
  'free_text',
])

export type ImportQuestionKind = z.infer<typeof importQuestionKind>

export const importClarificationSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  kind: importQuestionKind,
  // OpenAI strict mode sends null for unused optionals — `.optional()` alone rejects that.
  // relatedField is a plain string so a slight model miss does not fail the whole analysis.
  options: z.array(z.string()).max(40).nullish(),
  relatedField: z.string().nullish(),
  /** Example cell values that triggered the question. */
  examples: z.array(z.string()).max(5).nullish(),
})

export type ImportClarification = z.infer<typeof importClarificationSchema>

export const importClassAliasSchema = z.object({
  /** Value as it appears in the spreadsheet. */
  fileValue: z.string().min(1),
  /** Exact class name from the school's academic structure. */
  className: z.string().min(1),
  sectionName: z.string().nullish(),
})

export type ImportClassAlias = z.infer<typeof importClassAliasSchema>

const mappingShape = Object.fromEntries(
  fieldKeys.map((key) => [key, z.string().nullable().optional()]),
) as Record<ImportFieldKey, z.ZodOptional<z.ZodNullable<z.ZodString>>>

const emitAnalysisSchema = z.object({
  headerRowIndex: z
    .number()
    .int()
    .min(0)
    .describe('0-based index of the row that contains column headers'),
  mapping: z
    .object(mappingShape)
    .describe('Map each MyCampusView field to a column header from that row, or null if absent'),
  summary: z
    .string()
    .describe('One sentence for the admin explaining what was detected in plain language'),
  notes: z
    .string()
    .nullish()
    .describe('Anything unusual about the layout, merged cells, or combined name columns'),
  questions: z
    .array(importClarificationSchema)
    .max(8)
    .describe('Questions for the admin when mapping is ambiguous. Empty if confident.'),
  classAliases: z
    .array(importClassAliasSchema)
    .max(200)
    .nullish()
    .describe('When class/section values in the file differ from the school names, map them here'),
  splitFullNameColumn: z
    .string()
    .nullish()
    .describe(
      'If first and last name live in one column, the header of that column. Leave null if separate.',
    ),
})

export type ImportAiAnalysis = z.infer<typeof emitAnalysisSchema> & {
  model?: string
  analyzedAt?: string
}

export type AnalyzeImportInput = {
  grid: string[][]
  fileName: string
  classes: Array<{
    name: string
    sections: string[]
  }>
  /** Prior answers when re-analysing after clarification. */
  clarifications?: Record<string, string>
}

function systemPrompt(classes: AnalyzeImportInput['classes']): string {
  const fieldList = IMPORT_FIELDS.map(
    (f) => `- ${f.key}: ${f.label}${f.required ? ' (required)' : ''}`,
  ).join('\n')

  const classList =
    classes.length === 0
      ? 'No classes configured yet.'
      : classes
          .map((c) => `- ${c.name}${c.sections.length ? ` (sections: ${c.sections.join(', ')})` : ''}`)
          .join('\n')

  return `You analyse student admission spreadsheets for import into MyCampusView.

# MyCampusView fields you may map
${fieldList}

# This school's classes (use these exact names in classAliases)
${classList}

# Rules
- Schools use different layouts: title rows, merged headers, Hindi/English mix, "Std" instead of "Class", combined parent names, etc.
- Find the real header row. Row 0 is often a school title, not headers.
- Map columns to MyCampusView fields using the header text from that row.
- Required fields: admissionNo, firstName, lastName, className, sectionName.
- If one column holds the full student name, set splitFullNameColumn to that header and leave firstName/lastName null.
- If class values in the file do not exactly match the school's class list, add classAliases (fileValue → className).
- Ask questions only when you genuinely cannot decide — max 8, each with a stable id like "class_column" or "section_std_5".
- For pick_column questions, options must be exact header strings from the detected header row.
- For pick_class / pick_section, options must come from the school's class list above.
- Do not invent student data. Only map structure.
- Call emit_import_analysis exactly once.`
}

export async function analyzeImportWithAi(
  ctx: AppContext,
  input: AnalyzeImportInput,
): Promise<ImportAiAnalysis> {
  if (!assistantConfigured()) {
    throw new ApiException(
      409,
      'AI_NOT_CONFIGURED',
      'Smart import needs AI_DRIVER and AI_API_KEY on the deployment. You can still map columns manually.',
    )
  }
  if (!(await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST))) {
    throw new ApiException(
      402,
      'FEATURE_LOCKED',
      'Smart import is not part of this school’s plan.',
    )
  }

  const preview = gridPreviewText(input.grid)
  const clarificationBlock =
    input.clarifications && Object.keys(input.clarifications).length > 0
      ? `\n\n# Admin answers from earlier questions\n${Object.entries(input.clarifications)
          .map(([id, answer]) => `- ${id}: ${answer}`)
          .join('\n')}`
      : ''

  const userText = `File: ${input.fileName}

Each line is "rowIndex | cell | cell | ...". Row indices are 0-based.

${preview}${clarificationBlock}

Analyse this spreadsheet and map it to MyCampusView fields.`

  const model = assistantModel()
  const result = await model.turn({
    system: systemPrompt(input.classes),
    turns: [{ role: 'user', text: userText }],
    tools: [
      {
        name: 'emit_import_analysis',
        description: 'Return the detected header row, column mapping, and any clarification questions.',
        parameters: zodToJsonSchema(emitAnalysisSchema),
      },
    ],
    onText: () => {},
  })

  if (result.refused) {
    throw new ApiException(
      502,
      'AI_REFUSED',
      'The model could not analyse this file. Try mapping columns manually.',
    )
  }

  const call = result.toolCalls.find((c) => c.name === 'emit_import_analysis')
  if (!call) {
    throw new ApiException(
      502,
      'AI_NO_OUTPUT',
      'The model did not return a mapping. Try again or map columns manually.',
    )
  }

  let parsed: z.infer<typeof emitAnalysisSchema>
  try {
    parsed = parseImportAnalysisOutput(call.argumentsJson)
  } catch (error) {
    console.error('[imports] AI mapping parse failed', error, call.argumentsJson?.slice(0, 2000))
    throw new ApiException(
      502,
      'AI_BAD_OUTPUT',
      'The suggested mapping could not be read. Try again.',
    )
  }

  return {
    ...parsed,
    questions: parsed.questions ?? [],
    classAliases: parsed.classAliases ?? [],
    splitFullNameColumn: parsed.splitFullNameColumn ?? null,
    notes: parsed.notes ?? undefined,
    model: model.model,
    analyzedAt: new Date().toISOString(),
  }
}

/**
 * OpenAI returns null for every optional it did not fill. Strip those at object
 * level, but leave `mapping` values alone — null there is the deliberate
 * "this field has no column" signal.
 */
export function normalizeModelOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const obj = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'mapping' && value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = value
      continue
    }
    if (value === null) continue
    if (Array.isArray(value)) {
      out[key] = value.map((item) => dropNullKeys(item))
      continue
    }
    if (value && typeof value === 'object') {
      out[key] = dropNullKeys(value)
      continue
    }
    out[key] = value
  }

  return out
}

function dropNullKeys(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== null),
  )
}

/** Parse the model's tool arguments into a validated analysis. Exported for tests. */
export function parseImportAnalysisOutput(argumentsJson: string) {
  const raw = JSON.parse(argumentsJson || '{}')
  return emitAnalysisSchema.parse(normalizeModelOutput(raw))
}

/** Merge admin answers into mapping / aliases without a second model call. */
export function applyClarificationAnswers(
  analysis: ImportAiAnalysis,
  answers: Record<string, string>,
  headers: string[],
): {
  mapping: Record<ImportFieldKey, string | null>
  classAliases: ImportClassAlias[]
  splitFullNameColumn: string | null
} {
  const mapping = normalizeAiMapping(analysis.mapping, headers)
  const classAliases = [...(analysis.classAliases ?? [])]
  let splitFullNameColumn = analysis.splitFullNameColumn ?? null

  for (const question of analysis.questions) {
    const answer = answers[question.id]?.trim()
    if (!answer) continue

    switch (question.kind) {
      case 'pick_column':
        if (
          question.relatedField &&
          fieldKeys.includes(question.relatedField as ImportFieldKey) &&
          headers.includes(answer)
        ) {
          mapping[question.relatedField as ImportFieldKey] = answer
        }
        break
      case 'pick_class':
        if (question.examples?.[0]) {
          classAliases.push({ fileValue: question.examples[0], className: answer })
        }
        break
      case 'pick_section':
        if (question.examples?.[0]) {
          const existing = classAliases.find((a) => a.fileValue === question.examples![0])
          if (existing) existing.sectionName = answer
          else classAliases.push({ fileValue: question.examples[0], className: '', sectionName: answer })
        }
        break
      case 'confirm_value':
        if (
          answer.toLowerCase() === 'yes' &&
          question.relatedField &&
          fieldKeys.includes(question.relatedField as ImportFieldKey) &&
          question.examples?.[0]
        ) {
          mapping[question.relatedField as ImportFieldKey] = question.examples[0]
        }
        break
      case 'free_text':
        if (question.id === 'split_full_name' && headers.includes(answer)) {
          splitFullNameColumn = answer
          mapping.firstName = null
          mapping.lastName = null
        }
        break
    }
  }

  if (splitFullNameColumn && headers.includes(splitFullNameColumn)) {
    mapping.firstName = null
    mapping.lastName = null
  }

  return { mapping, classAliases, splitFullNameColumn }
}

export function normalizeAiMapping(
  raw: Partial<Record<ImportFieldKey, string | null | undefined>>,
  headers: string[],
): Record<ImportFieldKey, string | null> {
  const headerSet = new Set(headers)
  const out = Object.fromEntries(
    IMPORT_FIELDS.map((f) => [f.key, null]),
  ) as Record<ImportFieldKey, string | null>

  for (const field of IMPORT_FIELDS) {
    const chosen = raw[field.key]
    if (chosen && headerSet.has(chosen)) out[field.key] = chosen
  }

  const used = new Set<string>()
  for (const field of IMPORT_FIELDS) {
    const h = out[field.key]
    if (!h) continue
    if (used.has(h)) out[field.key] = null
    else used.add(h)
  }

  return out
}

export function unresolvedQuestions(
  analysis: ImportAiAnalysis,
  answers: Record<string, string>,
): ImportClarification[] {
  return analysis.questions.filter((q) => !answers[q.id]?.trim())
}

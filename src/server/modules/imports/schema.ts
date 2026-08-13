import { z } from 'zod'
import { IMPORT_FIELDS, type ImportFieldKey } from './fields'
import type { ImportAiAnalysis, ImportClassAlias, ImportClarification } from './ai-map'

const fieldKeys = IMPORT_FIELDS.map((f) => f.key) as [ImportFieldKey, ...ImportFieldKey[]]

export const importMappingSchema = z.record(
  z.enum(fieldKeys),
  z.string().trim().min(1).nullable(),
)

export type ImportMapping = Partial<Record<ImportFieldKey, string | null>>

export const importMapInputSchema = z.object({
  mapping: importMappingSchema,
  saveAsTemplate: z.boolean().default(true),
})

export type ImportMapInput = z.infer<typeof importMapInputSchema>

export const importClarifyInputSchema = z.object({
  answers: z.record(z.string(), z.string()),
})

export type ImportClarifyInput = z.infer<typeof importClarifyInputSchema>

export const IMPORT_KIND_STUDENTS = 'students'

export const IMPORT_STATUS = {
  VALIDATING: 'VALIDATING',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  READY: 'READY',
  COMMITTED: 'COMMITTED',
  ROLLED_BACK: 'ROLLED_BACK',
  FAILED: 'FAILED',
} as const

export type ImportStatus = (typeof IMPORT_STATUS)[keyof typeof IMPORT_STATUS]

export type ImportRowError = {
  row: number
  admissionNo?: string
  messages: string[]
}

export type ImportBatchMeta = {
  headers: string[]
  mapping: Record<ImportFieldKey, string | null>
  rowErrors: ImportRowError[]
  preview: Array<{
    row: number
    admissionNo: string
    firstName: string
    lastName: string
    className: string
    sectionName: string
    ok: boolean
  }>
  committedIds?: string[]
  /** Raw grid for re-analysis (first sheet only). */
  sourceGrid?: string[][]
  headerRowIndex?: number
  splitFullNameColumn?: string | null
  classAliases?: ImportClassAlias[]
  aiAnalysis?: ImportAiAnalysis
  clarificationAnswers?: Record<string, string>
  pendingQuestions?: ImportClarification[]
  fileKind?: 'csv' | 'xlsx'
}

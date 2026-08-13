'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { importClarifyInputSchema, importMapInputSchema } from '@/server/modules/imports/schema'
import {
  clarifyStudentImport,
  commitStudentImport,
  confirmStudentImportMapping,
  mapStudentImport,
  rollbackStudentImport,
  sampleStudentCsv,
  uploadStudentImport,
  type ImportBatchSummary,
} from '@/server/modules/imports/service'

export type ImportActionResult =
  | { ok: true; message: string; data: ImportBatchSummary }
  | { ok: false; message: string; data?: undefined }

function failure(error: unknown, fallback: string): ImportActionResult {
  if (error instanceof ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? fallback }
  }
  if (error instanceof ApiException) {
    return { ok: false, message: error.message }
  }
  if (error instanceof Error) {
    return { ok: false, message: error.message }
  }
  return { ok: false, message: fallback }
}

export async function uploadStudentImportAction(formData: FormData): Promise<ImportActionResult> {
  try {
    const ctx = await requireContext('students.import')
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Choose a CSV or Excel file to upload' }
    }
    const useAi = formData.get('smartImport') === 'true'
    const data = await uploadStudentImport(ctx, file, { useAi })
    revalidatePath('/students/import')

    if (data.status === 'NEEDS_REVIEW') {
      const pending = data.pendingQuestions?.length ?? 0
      return {
        ok: true,
        message:
          pending > 0
            ? `Smart import mapped your file — ${pending} question${pending === 1 ? '' : 's'} need your answer before import`
            : 'Smart import mapped your file — review the mapping and confirm',
        data,
      }
    }

    return {
      ok: true,
      message: `${data.validRows} row${data.validRows === 1 ? '' : 's'} ready, ${data.errorRows} need attention`,
      data,
    }
  } catch (error) {
    return failure(error, 'The file could not be imported')
  }
}

export async function confirmStudentImportAction(
  batchId: string,
  payload: unknown,
): Promise<ImportActionResult> {
  try {
    const ctx = await requireContext('students.import')
    const body = payload as Record<string, unknown>
    const input = importMapInputSchema.parse(body)
    const answers =
      body.answers && typeof body.answers === 'object'
        ? (body.answers as Record<string, string>)
        : undefined
    const data = await confirmStudentImportMapping(ctx, batchId, { ...input, answers })
    revalidatePath('/students/import')
    return {
      ok: true,
      message:
        data.status === 'NEEDS_REVIEW'
          ? 'Answer the remaining questions to continue'
          : `${data.validRows} valid · ${data.errorRows} rejected`,
      data,
    }
  } catch (error) {
    return failure(error, 'The mapping could not be confirmed')
  }
}

export async function clarifyStudentImportAction(
  batchId: string,
  payload: unknown,
): Promise<ImportActionResult> {
  try {
    const ctx = await requireContext('students.import')
    const input = importClarifyInputSchema.parse(payload)
    const data = await clarifyStudentImport(ctx, batchId, input)
    revalidatePath('/students/import')
    return {
      ok: true,
      message:
        data.pendingQuestions && data.pendingQuestions.length > 0
          ? `${data.pendingQuestions.length} question${data.pendingQuestions.length === 1 ? '' : 's'} still open`
          : `${data.validRows} valid · ${data.errorRows} rejected`,
      data,
    }
  } catch (error) {
    return failure(error, 'Your answers could not be applied')
  }
}

export async function mapStudentImportAction(
  batchId: string,
  payload: unknown,
): Promise<ImportActionResult> {
  try {
    const ctx = await requireContext('students.import')
    const input = importMapInputSchema.parse(payload)
    const data = await mapStudentImport(ctx, batchId, input)
    revalidatePath('/students/import')
    return {
      ok: true,
      message: `${data.validRows} valid · ${data.errorRows} rejected`,
      data,
    }
  } catch (error) {
    return failure(error, 'The mapping could not be saved')
  }
}

export async function commitStudentImportAction(batchId: string): Promise<ImportActionResult> {
  try {
    const ctx = await requireContext('students.import')
    const data = await commitStudentImport(ctx, batchId)
    revalidatePath('/students/import')
    revalidatePath('/students')
    return {
      ok: true,
      message: `Imported ${data.validRows} student${data.validRows === 1 ? '' : 's'}`,
      data,
    }
  } catch (error) {
    return failure(error, 'The import could not be committed')
  }
}

export async function rollbackStudentImportAction(batchId: string): Promise<ImportActionResult> {
  try {
    const ctx = await requireContext('students.import')
    const data = await rollbackStudentImport(ctx, batchId)
    revalidatePath('/students/import')
    revalidatePath('/students')
    return {
      ok: true,
      message: `Rolled back ${data.committedCount} student${data.committedCount === 1 ? '' : 's'}`,
      data,
    }
  } catch (error) {
    return failure(error, 'The import could not be rolled back')
  }
}

export async function downloadSampleCsvAction(): Promise<{ ok: true; csv: string; fileName: string }> {
  await requireContext('students.import')
  return { ok: true, csv: sampleStudentCsv(), fileName: 'student-import-template.csv' }
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  addExamPaper,
  addExamPaperSchema,
  computeResults,
  createExam,
  createGradingScale,
  examCreateSchema,
  examMetaUpdateSchema,
  examPaperUpdateSchema,
  gradingScaleSchema,
  marksSaveSchema,
  publishResults,
  saveMarks,
  setExamGradingScale,
  updateExamMeta,
  updateExamPapers,
  deleteExam,
} from '@/server/modules/exams/service'
import {
  buildExamMarksTemplateCsv,
  importExamMarksFromSpreadsheet,
  importPaperMarksFromSpreadsheet,
} from '@/server/modules/exams/marks-import'
import {
  buildExamPapersTemplateCsv,
  buildNewExamTemplateCsv,
  createExamsFromSpreadsheet,
  importExamPapersFromSpreadsheet,
} from '@/server/modules/exams/papers-import'
import type { FormState } from '@/lib/form-state'

function fields(error: ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

export async function createExamAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let examId: string
  try {
    const ctx = await requireContext('exams.manage')
    const exam = await createExam(
      ctx,
      examCreateSchema.parse({
        name: formData.get('name'),
        kind: formData.get('kind'),
        startsOn: formData.get('startsOn') || undefined,
        endsOn: formData.get('endsOn') || undefined,
        gradingScaleId: formData.get('gradingScaleId') || undefined,
        classLevelIds: formData.getAll('classLevelIds'),
        classSubjectIds: formData.getAll('classSubjectIds'),
      }),
    )
    examId = exam.id
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Please correct the highlighted fields', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'The exam could not be saved', fieldErrors: {} }
  }

  // Next.js implements redirect by throwing a framework-controlled signal.
  // Keep it outside the catch block so a successful create is not displayed as
  // the misleading "NEXT_REDIRECT" form error.
  revalidatePath('/exams')
  redirect(`/exams/${examId}`)
}

export async function updateExamMetaAction(_previous: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireContext('exams.manage')
    const examId = String(formData.get('examId') ?? '')
    await updateExamMeta(
      ctx,
      examId,
      examMetaUpdateSchema.parse({
        name: formData.get('name') || undefined,
        startsOn: formData.get('startsOn') || undefined,
        endsOn: formData.get('endsOn') || undefined,
        status: formData.get('status') || undefined,
      }),
    )
    revalidatePath(`/exams/${examId}`)
    revalidatePath('/exams')
    return { ok: true, error: null, fieldErrors: {} }
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Please correct the highlighted fields', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'Could not update the exam', fieldErrors: {} }
  }
}

export async function updateExamPapersAction(_previous: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireContext('exams.manage')
    const examId = String(formData.get('examId') ?? '')
    const count = Number(formData.get('paperCount') ?? 0)
    const papers = Array.from({ length: count }, (_, index) => ({
      id: String(formData.get(`id-${index}`) ?? ''),
      maxMarks: formData.get(`maxMarks-${index}`),
      passMarks: formData.get(`passMarks-${index}`),
      examDate: formData.get(`examDate-${index}`) || undefined,
      startTime: formData.get(`startTime-${index}`) || undefined,
      endTime: formData.get(`endTime-${index}`) || undefined,
      roomName: formData.get(`roomName-${index}`) || undefined,
    }))
    await updateExamPapers(ctx, examId, examPaperUpdateSchema.parse({ papers }))
    revalidatePath(`/exams/${examId}`)
    revalidatePath(`/exams/${examId}/marks`)
    return { ok: true, error: null, fieldErrors: {} }
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Please correct the paper fields', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'Could not update papers', fieldErrors: {} }
  }
}

export async function addExamPaperAction(_previous: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireContext('exams.manage')
    const examId = String(formData.get('examId') ?? '')
    await addExamPaper(
      ctx,
      examId,
      addExamPaperSchema.parse({
        classSubjectId: formData.get('classSubjectId'),
        maxMarks: formData.get('maxMarks') || 100,
        passMarks: formData.get('passMarks') || 33,
        examDate: formData.get('examDate') || undefined,
        startTime: formData.get('startTime') || undefined,
        endTime: formData.get('endTime') || undefined,
        roomName: formData.get('roomName') || undefined,
      }),
    )
    revalidatePath(`/exams/${examId}`)
    revalidatePath(`/exams/${examId}/marks`)
    revalidatePath(`/exams/${examId}/admit-cards`)
    revalidatePath(`/exams/${examId}/attendance`)
    return { ok: true, error: null, fieldErrors: {} }
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Please correct the highlighted fields', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'Could not add the paper', fieldErrors: {} }
  }
}

export async function saveMarksAction(
  examId: string,
  examSubjectId: string,
  rows: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('exams.marks')
    const parsed = marksSaveSchema.parse({ rows })
    const result = await saveMarks(ctx, examId, examSubjectId, parsed)
    revalidatePath(`/exams/${examId}/marks`)
    return { ok: true, message: `${result.saved} marks saved.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Marks could not be saved' }
  }
}

export async function importPaperMarksAction(
  examId: string,
  examSubjectId: string,
  formData: FormData,
): Promise<{
  ok: boolean
  message: string
  issues?: { row: number; admissionNo?: string; message: string }[]
}> {
  try {
    const ctx = await requireContext('exams.marks')
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Choose a CSV or Excel file to upload' }
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await importPaperMarksFromSpreadsheet(ctx, examId, examSubjectId, {
      buffer,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
    })
    revalidatePath(`/exams/${examId}/marks`)
    const skipped =
      result.skipped > 0 ? ` ${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped.` : ''
    return {
      ok: true,
      message: `${result.saved} marks imported.${skipped}`,
      issues: result.issues,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Marks could not be imported' }
  }
}

export async function importExamMarksAction(
  examId: string,
  formData: FormData,
): Promise<{
  ok: boolean
  message: string
  issues?: { row: number; admissionNo?: string; message: string }[]
}> {
  try {
    const ctx = await requireContext('exams.marks')
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Choose a CSV or Excel file to upload' }
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await importExamMarksFromSpreadsheet(ctx, examId, {
      buffer,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
    })
    revalidatePath(`/exams/${examId}/marks`)
    revalidatePath('/exams/marks')
    const papers =
      result.papers && result.papers > 0
        ? ` across ${result.papers} paper${result.papers === 1 ? '' : 's'}`
        : ''
    const skipped =
      result.skipped > 0 ? ` ${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped.` : ''
    return {
      ok: true,
      message: `${result.saved} marks imported${papers}.${skipped}`,
      issues: result.issues,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Marks could not be imported' }
  }
}

export async function downloadExamMarksTemplateAction(
  examId: string,
): Promise<{ ok: boolean; message?: string; filename?: string; csv?: string }> {
  try {
    const ctx = await requireContext('exams.marks')
    const template = await buildExamMarksTemplateCsv(ctx, examId)
    return { ok: true, filename: template.filename, csv: template.csv }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not build the marks template',
    }
  }
}

export async function downloadExamPapersTemplateAction(
  examId: string,
): Promise<{ ok: boolean; message?: string; filename?: string; csv?: string }> {
  try {
    const ctx = await requireContext('exams.manage')
    const template = await buildExamPapersTemplateCsv(ctx, examId)
    return { ok: true, filename: template.filename, csv: template.csv }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not build the papers template',
    }
  }
}

export async function importExamPapersAction(
  examId: string,
  formData: FormData,
): Promise<{
  ok: boolean
  message: string
  issues?: { row: number; message: string }[]
}> {
  try {
    const ctx = await requireContext('exams.manage')
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Choose a CSV or Excel file to upload' }
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await importExamPapersFromSpreadsheet(ctx, examId, {
      buffer,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
    })
    revalidatePath(`/exams/${examId}`)
    revalidatePath(`/exams/${examId}/marks`)
    const skipped =
      result.skipped > 0 ? ` ${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped.` : ''
    return {
      ok: true,
      message: `${result.updated} papers updated.${skipped}`,
      issues: result.issues,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Papers could not be imported' }
  }
}

export async function downloadNewExamTemplateAction(): Promise<{
  ok: boolean
  message?: string
  filename?: string
  csv?: string
}> {
  try {
    const ctx = await requireContext('exams.manage')
    const template = await buildNewExamTemplateCsv(ctx)
    return { ok: true, filename: template.filename, csv: template.csv }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not build the exam template',
    }
  }
}

export async function createExamsFromSpreadsheetAction(formData: FormData): Promise<{
  ok: boolean
  message: string
  examId?: string
  issues?: { row: number; message: string }[]
}> {
  try {
    const ctx = await requireContext('exams.manage')
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Choose a CSV or Excel file to upload' }
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await createExamsFromSpreadsheet(ctx, {
      buffer,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
    })
    revalidatePath('/exams')
    for (const exam of result.exams) revalidatePath(`/exams/${exam.id}`)
    const skipped =
      result.skipped > 0 ? ` ${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped.` : ''
    const names = result.exams.map((exam) => exam.name).join(', ')
    return {
      ok: true,
      message: `Created ${result.created} exam${result.created === 1 ? '' : 's'}: ${names}.${skipped}`,
      examId: result.exams[0]?.id,
      issues: result.issues,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Exams could not be imported' }
  }
}

export async function createGradingScaleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireContext('exams.manage')
    const bands = [0, 1, 2, 3, 4].map((index) => ({
      grade: formData.get(`grade-${index}`),
      minPercent: formData.get(`min-${index}`),
      maxPercent: formData.get(`max-${index}`),
      points: formData.get(`points-${index}`) || null,
      remark: formData.get(`remark-${index}`) || null,
      isPass: formData.get(`pass-${index}`) === 'on',
    }))
    await createGradingScale(
      ctx,
      gradingScaleSchema.parse({
        name: formData.get('name'),
        isDefault: formData.get('isDefault') === 'on',
        bands,
      }),
    )
    revalidatePath('/exams/grades')
    revalidatePath('/exams/new')
    return { ok: true, error: null, fieldErrors: {} }
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Please correct the grade bands', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'The grading scale could not be saved', fieldErrors: {} }
  }
}

export async function computeResultsAction(examId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await computeResults(await requireContext('exams.manage'), examId)
    revalidatePath('/exams/results')
    return {
      ok: true,
      message: `${result.calculated} results computed${result.skipped ? `; ${result.skipped} students still need complete marks.` : '.'}`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not compute results' }
  }
}

export async function publishResultsAction(examId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await publishResults(await requireContext('exams.publish'), examId)
    revalidatePath('/exams/results')
    return { ok: true, message: `${result.published} results published and recipients notified.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not publish results' }
  }
}

export async function setExamGradingScaleAction(
  examId: string,
  gradingScaleId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    await setExamGradingScale(await requireContext('exams.manage'), examId, gradingScaleId)
    revalidatePath('/exams/results')
    return { ok: true, message: 'Grading scale updated. Calculate results to apply it.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not update the grading scale' }
  }
}

export async function deleteExamAction(examId: string): Promise<{ ok: boolean; message: string }> {
  try {
    await deleteExam(await requireContext('exams.delete'), examId)
    revalidatePath('/exams')
    return { ok: true, message: 'Exam deleted.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not delete the exam' }
  }
}

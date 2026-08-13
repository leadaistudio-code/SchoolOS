'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
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
} from '@/server/modules/exams/service'
import type { FormState } from '@/lib/form-state'

function fields(error: ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

export async function createExamAction(_previous: FormState, formData: FormData): Promise<FormState> {
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
    revalidatePath('/exams')
    redirect(`/exams/${exam.id}`)
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Please correct the highlighted fields', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'The exam could not be saved', fieldErrors: {} }
  }
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

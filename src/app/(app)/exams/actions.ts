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
  deleteGradingScale,
  setDefaultGradingScale,
  setGradingScalePassRule,
  passRuleSchema,
  updateGradingScale,
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
import { closeMarksSheet, sheetCloseSchema, sheetTransitionSchema, transitionMarksSheet } from '@/server/modules/exams/marks-hub'
import { holisticSaveSchema, saveHolisticAssessment } from '@/server/modules/exams/holistic'
import { correctResultMarks, resultCorrectionSchema } from '@/server/modules/exams/result-correction'
import { reportCardDesignSchema, saveReportCardDesign, setDefaultTemplateAccent } from '@/server/modules/exams/report-templates'
import { uploadReportCardSignature } from '@/server/modules/exams/report-card-signatures'
import type { FormState } from '@/lib/form-state'

function fields(error: ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

/**
 * Paper forms send the written part plus optional internal / oral parts
 * (picked from the "Additional marks" dropdown); the stored maximum is the total.
 */
function paperMarks(formData: FormData, suffix: string) {
  const value = (key: string) => {
    const raw = String(formData.get(`${key}${suffix}`) ?? '').trim()
    return raw === '' ? null : Number(raw)
  }
  const components = String(formData.get(`components${suffix}`) ?? '')
  const internal = components.includes('INTERNAL') ? value('internalMaxMarks') : null
  const oral = components.includes('ORAL') ? value('oralMaxMarks') : null
  const written = value('writtenMaxMarks') ?? value('maxMarks') ?? 100
  return {
    maxMarks: written + (internal ?? 0) + (oral ?? 0),
    internalMaxMarks: internal,
    oralMaxMarks: oral,
  }
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
      ...paperMarks(formData, `-${index}`),
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
        ...paperMarks(formData, ''),
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
    revalidatePath('/exams/marks')
    const parts = [
      `${result.saved} saved`,
      result.cleared ? `${result.cleared} cleared` : null,
      result.notEntered ? `${result.notEntered} not entered yet` : null,
    ].filter(Boolean)
    return { ok: true, message: `Marks saved: ${parts.join(' · ')}.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Marks could not be saved' }
  }
}

export async function transitionMarksSheetAction(
  examSubjectId: string,
  to: 'SUBMITTED' | 'LOCKED' | 'OPEN',
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('exams.marks')
    await transitionMarksSheet(ctx, sheetTransitionSchema.parse({ examSubjectId, to }))
    revalidatePath('/exams/marks')
    revalidatePath('/exams/[id]/marks', 'page')
    const verb = to === 'SUBMITTED' ? 'submitted' : to === 'LOCKED' ? 'locked' : 'reopened'
    return { ok: true, message: `Marks sheet ${verb}.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not update the marks sheet' }
  }
}

export async function correctResultMarksAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('exams.manage')
    const outcome = await correctResultMarks(ctx, resultCorrectionSchema.parse(input))
    if (outcome.changed === 0) return { ok: true, message: 'No marks were changed.' }
    revalidatePath('/exams/report-cards', 'layout')
    revalidatePath('/exams/results')
    revalidatePath('/exams/marks')
    const r = outcome.result!
    return {
      ok: true,
      message: `${outcome.changed} paper${outcome.changed === 1 ? '' : 's'} corrected. Now ${r.totalObtained} (${r.percentage}%)${r.grade ? `, grade ${r.grade}` : ''}${r.rankInClass ? `, rank ${r.rankInClass}` : ''}.`,
    }
  } catch (error) {
    if (error instanceof ZodError) return { ok: false, message: error.issues[0]?.message ?? 'Check the marks entered' }
    return { ok: false, message: error instanceof Error ? error.message : 'Could not correct the marks' }
  }
}

export async function closeMarksSheetAction(examSubjectId: string, reason: string): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('exams.manage')
    await closeMarksSheet(ctx, sheetCloseSchema.parse({ examSubjectId, reason: reason || undefined }))
    revalidatePath('/exams/marks')
    revalidatePath('/exams/[id]/marks', 'page')
    return { ok: true, message: 'Paper closed without marks. It will be left out of results.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not close the marks sheet' }
  }
}

export async function saveHolisticAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('exams.marks')
    const result = await saveHolisticAssessment(ctx, holisticSaveSchema.parse(input))
    revalidatePath('/exams/report-cards', 'layout')
    return { ok: true, message: `Holistic assessment saved for ${result.saved} students.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not save the assessment' }
  }
}

export async function saveReportCardAccentAction(accent: string): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('exams.manage')
    const result = await setDefaultTemplateAccent(ctx, accent)
    revalidatePath('/exams/report-cards', 'layout')
    return { ok: true, message: `Theme colour saved to “${result.name}”. All report cards now use it.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not save the theme colour' }
  }
}

export async function uploadReportCardSignatureAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string; url?: string }> {
  try {
    const ctx = await requireContext('exams.manage')
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose an image to upload' }
    const { url } = await uploadReportCardSignature(ctx, file)
    return { ok: true, message: 'Signature uploaded. Save to apply it to report cards.', url }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'The signature could not be uploaded' }
  }
}

export async function saveReportCardDesignAction(
  templateId: string,
  input: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('exams.manage')
    const template = await saveReportCardDesign(ctx, templateId, reportCardDesignSchema.parse(input))
    revalidatePath('/exams/report-cards', 'layout')
    return { ok: true, message: `Design saved to “${template.name}”.` }
  } catch (error) {
    if (error instanceof ZodError) return { ok: false, message: 'Some design settings are invalid' }
    return { ok: false, message: error instanceof Error ? error.message : 'Could not save the design' }
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

type ScaleActionResult = { ok: boolean; message: string; fieldErrors?: Record<string, string>; id?: string }

function revalidateScales() {
  revalidatePath('/exams/grades')
  revalidatePath('/exams/new')
  revalidatePath('/exams/results')
}

export async function saveGradingScaleAction(id: string | null, payload: unknown): Promise<ScaleActionResult> {
  try {
    const ctx = await requireContext('exams.manage')
    const input = gradingScaleSchema.parse(payload)
    const scale = id ? await updateGradingScale(ctx, id, input) : await createGradingScale(ctx, input)
    revalidateScales()
    return { ok: true, message: `${scale.name} ${id ? 'updated' : 'created'}.`, id: scale.id }
  } catch (error) {
    if (error instanceof ZodError) return { ok: false, message: error.issues[0]?.message ?? 'Please correct the highlighted fields', fieldErrors: fields(error) }
    return { ok: false, message: error instanceof Error ? error.message : 'The grading scale could not be saved' }
  }
}

export async function setDefaultGradingScaleAction(id: string): Promise<ScaleActionResult> {
  try {
    const scale = await setDefaultGradingScale(await requireContext('exams.manage'), id)
    revalidateScales()
    return { ok: true, message: `${scale.name} is now the default scale.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not change the default scale' }
  }
}

export async function setGradingScalePassRuleAction(id: string, payload: unknown): Promise<ScaleActionResult> {
  try {
    const input = passRuleSchema.parse(payload)
    const done = await setGradingScalePassRule(await requireContext('exams.manage'), id, input)
    revalidateScales()
    revalidatePath('/exams/results')
    revalidatePath('/exams/report-cards')
    revalidatePath('/exams/marks')
    return {
      ok: true,
      message: done.exams
        ? `Pass rule saved. ${done.recalculated} result${done.recalculated === 1 ? '' : 's'} recalculated across ${done.exams} exam${done.exams === 1 ? '' : 's'}.`
        : 'Pass rule saved.',
    }
  } catch (error) {
    if (error instanceof ZodError) return { ok: false, message: error.issues[0]?.message ?? 'Check the pass rule' }
    return { ok: false, message: error instanceof Error ? error.message : 'Could not change the pass rule' }
  }
}

export async function deleteGradingScaleAction(id: string): Promise<ScaleActionResult> {
  try {
    const scale = await deleteGradingScale(await requireContext('exams.manage'), id)
    revalidateScales()
    return { ok: true, message: `${scale.name} deleted.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not delete the scale' }
  }
}

export async function computeResultsAction(examId: string, classLevelId?: string): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await computeResults(await requireContext('exams.manage'), examId, { classLevelId })
    revalidatePath('/exams/results')
    revalidatePath('/exams/marks')
    const top = result.waiting.slice(0, 3).map((row) => `${row.paper} (${row.students})`).join(', ')
    return {
      ok: true,
      message: `${result.calculated} result${result.calculated === 1 ? '' : 's'} generated${result.skipped ? `; ${result.skipped} student${result.skipped === 1 ? '' : 's'} still need marks${top ? ` in ${top}` : ''}.` : '.'}`,
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

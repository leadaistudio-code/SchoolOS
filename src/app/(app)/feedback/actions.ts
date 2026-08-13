'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { activateCampaign, campaignSchema, createCampaign, createTeacherStudentFeedback, createTemplate, teacherStudentFeedbackSchema, templateSchema, submitResponse, responseSchema } from '@/server/modules/feedback/service'

type Result = { ok: true; message: string } | { ok: false; message: string }
const failure = (error: unknown, fallback: string): Result => ({ ok: false, message: error instanceof ZodError ? (error.issues[0]?.message ?? fallback) : error instanceof Error ? error.message : fallback })

export async function submitFeedbackAction(assignmentId: string, payload: unknown): Promise<Result> {
  try { const ctx = await requireContext('feedback.submit'); await submitResponse(ctx, assignmentId, responseSchema.parse(payload)); revalidatePath('/feedback'); return { ok: true, message: 'Thank you. Your feedback has been submitted.' } } catch (error) { return failure(error, 'Feedback could not be submitted') }
}
export async function createCampaignAction(payload: unknown): Promise<Result> {
  try { const ctx = await requireContext('feedback.campaign_manage'); await createCampaign(ctx, campaignSchema.parse(payload)); revalidatePath('/feedback/campaigns'); return { ok: true, message: 'Campaign saved as a draft.' } } catch (error) { return failure(error, 'Campaign could not be created') }
}
export async function activateCampaignAction(id: string): Promise<Result> {
  try { const ctx = await requireContext('feedback.campaign_manage'); const result = await activateCampaign(ctx, id); revalidatePath('/feedback/campaigns'); revalidatePath('/feedback'); return { ok: true, message: `Campaign activated. ${result.created} feedback requests created.` } } catch (error) { return failure(error, 'Campaign could not be activated') }
}
export async function createTemplateAction(payload: unknown): Promise<Result> {
  try { const ctx = await requireContext('feedback.template_manage'); await createTemplate(ctx, templateSchema.parse(payload)); revalidatePath('/feedback/templates'); return { ok: true, message: 'Template created.' } } catch (error) { return failure(error, 'Template could not be created') }
}
export async function giveStudentFeedbackAction(payload: unknown): Promise<Result> {
  try { const ctx = await requireContext('feedback.teacher_give_student'); await createTeacherStudentFeedback(ctx, teacherStudentFeedbackSchema.parse(payload)); revalidatePath('/feedback/students'); return { ok: true, message: 'Student feedback saved.' } } catch (error) { return failure(error, 'Student feedback could not be saved') }
}

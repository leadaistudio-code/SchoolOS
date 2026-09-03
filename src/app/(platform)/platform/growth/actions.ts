'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requirePlatformContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'
import {
  captureFieldLead,
  completeFollowUp,
  completeMeeting,
  createContact,
  createFollowUp,
  createSchool,
  createTask,
  createTemplate,
  deleteContact,
  deleteTemplate,
  logActivity,
  logVisit,
  moveStage,
  scheduleMeeting,
  seedDefaultTemplates,
  sendCrmMessage,
  setTaskStatus,
  setTemplateActive,
  updateSchool,
} from '@/server/modules/platform/growth/service'
import {
  analyseSchoolRisk,
  generateMeetingBrief,
  suggestSchoolNextAction,
  summarizeSchoolConversation,
} from '@/server/modules/platform/growth/intel'
import {
  activityCreateSchema,
  contactCreateSchema,
  followUpCreateSchema,
  meetingCreateSchema,
  schoolCreateSchema,
  schoolUpdateSchema,
  sendMessageSchema,
  stageChangeSchema,
  taskCreateSchema,
  taskStatusSchema,
  templateCreateSchema,
  visitLogSchema,
  fieldCaptureSchema,
} from '@/server/modules/platform/growth/schema'

function fieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) out[issue.path.join('.') || 'form'] = issue.message
  return out
}

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    return { error: 'Please correct the highlighted fields', fieldErrors: fieldErrors(error) }
  }
  if (error instanceof ApiException) {
    return { error: error.message, fieldErrors: {} }
  }
  return { error: error instanceof Error ? error.message : fallback, fieldErrors: {} }
}

function raw(formData: FormData) {
  return Object.fromEntries(formData.entries())
}

export async function createSchoolAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_create')
  try {
    const school = await createSchool(ctx, schoolCreateSchema.parse(raw(formData)))
    revalidatePath('/platform/growth')
    redirect(`/platform/growth/schools/${school.id}`)
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error
    return fail(error, 'Could not create the school')
  }
}

export async function captureFieldLeadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_create')
  try {
    const school = await captureFieldLead(ctx, fieldCaptureSchema.parse(raw(formData)))
    revalidatePath('/platform/growth')
    revalidatePath('/platform/growth/today')
    redirect(`/platform/growth/schools/${school.id}`)
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error
    return fail(error, 'Could not save the field capture')
  }
}

export async function updateSchoolAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_edit')
  try {
    await updateSchool(ctx, id, schoolUpdateSchema.parse(raw(formData)))
    revalidatePath(`/platform/growth/schools/${id}`)
    revalidatePath('/platform/growth')
    return { ...emptyFormState, ok: true, message: 'Saved' }
  } catch (error) {
    return fail(error, 'Could not save')
  }
}

export async function createContactAction(
  schoolId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_edit')
  try {
    await createContact(ctx, schoolId, contactCreateSchema.parse(raw(formData)))
    revalidatePath(`/platform/growth/schools/${schoolId}`)
    return { ...emptyFormState, ok: true, message: 'Contact added' }
  } catch (error) {
    return fail(error, 'Could not add the contact')
  }
}

export async function deleteContactAction(schoolId: string, contactId: string) {
  const ctx = await requirePlatformContext('platform.crm_delete')
  await deleteContact(ctx, schoolId, contactId)
  revalidatePath(`/platform/growth/schools/${schoolId}`)
}

export async function moveStageAction(schoolId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_edit')
  try {
    await moveStage(ctx, schoolId, stageChangeSchema.parse(raw(formData)))
    revalidatePath(`/platform/growth/schools/${schoolId}`)
    revalidatePath('/platform/growth/pipeline')
    revalidatePath('/platform/growth')
    return { ...emptyFormState, ok: true, message: 'Stage updated' }
  } catch (error) {
    return fail(error, 'Could not update the stage')
  }
}

export async function moveStageQuickAction(schoolId: string, stage: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await requirePlatformContext('platform.crm_edit')
  try {
    await moveStage(ctx, schoolId, stageChangeSchema.parse({ stage }))
    revalidatePath('/platform/growth/pipeline')
    revalidatePath(`/platform/growth/schools/${schoolId}`)
    return { ok: true, message: 'Stage updated' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not move' }
  }
}

export async function logActivityAction(
  schoolId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_edit')
  try {
    await logActivity(ctx, schoolId, activityCreateSchema.parse(raw(formData)))
    revalidatePath(`/platform/growth/schools/${schoolId}`)
    revalidatePath('/platform/growth')
    return { ...emptyFormState, ok: true, message: 'Logged' }
  } catch (error) {
    return fail(error, 'Could not log the activity')
  }
}

export async function logVisitAction(
  schoolId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_edit')
  try {
    await logVisit(ctx, schoolId, visitLogSchema.parse(raw(formData)))
    revalidatePath(`/platform/growth/schools/${schoolId}`)
    revalidatePath('/platform/growth')
    return { ...emptyFormState, ok: true, message: 'Visit logged' }
  } catch (error) {
    return fail(error, 'Could not log the visit')
  }
}

export async function createFollowUpAction(
  schoolId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_edit')
  try {
    await createFollowUp(ctx, schoolId, followUpCreateSchema.parse(raw(formData)))
    revalidatePath(`/platform/growth/schools/${schoolId}`)
    revalidatePath('/platform/growth')
    return { ...emptyFormState, ok: true, message: 'Follow-up scheduled' }
  } catch (error) {
    return fail(error, 'Could not create the follow-up')
  }
}

export async function scheduleMeetingAction(
  schoolId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_edit')
  try {
    await scheduleMeeting(ctx, schoolId, meetingCreateSchema.parse(raw(formData)))
    revalidatePath(`/platform/growth/schools/${schoolId}`)
    revalidatePath('/platform/growth')
    revalidatePath('/platform/growth/today')
    return { ...emptyFormState, ok: true, message: 'Meeting scheduled' }
  } catch (error) {
    return fail(error, 'Could not schedule the meeting')
  }
}

export async function completeMeetingAction(id: string, schoolId: string) {
  const ctx = await requirePlatformContext('platform.crm_edit')
  await completeMeeting(ctx, id)
  revalidatePath(`/platform/growth/schools/${schoolId}`)
  revalidatePath('/platform/growth/today')
}

export async function createTaskAction(
  schoolId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_edit')
  try {
    await createTask(ctx, schoolId, taskCreateSchema.parse(raw(formData)))
    revalidatePath(`/platform/growth/schools/${schoolId}`)
    revalidatePath('/platform/growth')
    revalidatePath('/platform/growth/today')
    return { ...emptyFormState, ok: true, message: 'Task added' }
  } catch (error) {
    return fail(error, 'Could not add the task')
  }
}

export async function setTaskStatusAction(id: string, schoolId: string, status: string) {
  const ctx = await requirePlatformContext('platform.crm_edit')
  await setTaskStatus(ctx, id, taskStatusSchema.parse({ status }).status)
  revalidatePath(`/platform/growth/schools/${schoolId}`)
  revalidatePath('/platform/growth/today')
}

export async function completeFollowUpAction(id: string, schoolId?: string) {
  const ctx = await requirePlatformContext('platform.crm_edit')
  await completeFollowUp(ctx, id)
  revalidatePath('/platform/growth')
  revalidatePath('/platform/growth/today')
  if (schoolId) revalidatePath(`/platform/growth/schools/${schoolId}`)
}

export async function quickFollowUpAction(schoolId: string, days: number, type: string) {
  const ctx = await requirePlatformContext('platform.crm_edit')
  const due = new Date()
  due.setDate(due.getDate() + days)
  due.setHours(10, 0, 0, 0)
  await createFollowUp(ctx, schoolId, followUpCreateSchema.parse({
    dueAt: due.toISOString(),
    type,
    priority: 'NORMAL',
  }))
  revalidatePath(`/platform/growth/schools/${schoolId}`)
  revalidatePath('/platform/growth')
  revalidatePath('/platform/growth/today')
}

export async function sendMessageAction(
  schoolId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_comms')
  try {
    await sendCrmMessage(ctx, schoolId, sendMessageSchema.parse(raw(formData)))
    revalidatePath(`/platform/growth/schools/${schoolId}`)
    revalidatePath('/platform/growth')
    return { ...emptyFormState, ok: true, message: 'Sent' }
  } catch (error) {
    return fail(error, 'Could not send the message')
  }
}

export async function createTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_comms')
  try {
    await createTemplate(ctx, templateCreateSchema.parse(raw(formData)))
    revalidatePath('/platform/growth/templates')
    return { ...emptyFormState, ok: true, message: 'Template saved' }
  } catch (error) {
    return fail(error, 'Could not save the template')
  }
}

export async function seedTemplatesAction() {
  const ctx = await requirePlatformContext('platform.crm_comms')
  await seedDefaultTemplates(ctx)
  revalidatePath('/platform/growth/templates')
}

export async function toggleTemplateAction(id: string, isActive: boolean) {
  const ctx = await requirePlatformContext('platform.crm_comms')
  await setTemplateActive(ctx, id, isActive)
  revalidatePath('/platform/growth/templates')
}

export async function deleteTemplateAction(id: string) {
  const ctx = await requirePlatformContext('platform.crm_comms')
  await deleteTemplate(ctx, id)
  revalidatePath('/platform/growth/templates')
}

type IntelActionResult = {
  ok: boolean
  message: string
  data?: unknown
}

export async function meetingBriefAction(schoolId: string): Promise<IntelActionResult> {
  const ctx = await requirePlatformContext('platform.crm')
  try {
    const data = await generateMeetingBrief(ctx, schoolId)
    return { ok: true, message: 'Brief ready', data }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not build the meeting brief',
    }
  }
}

export async function conversationSummaryAction(schoolId: string): Promise<IntelActionResult> {
  const ctx = await requirePlatformContext('platform.crm')
  try {
    const data = await summarizeSchoolConversation(ctx, schoolId)
    return { ok: true, message: 'Summary ready', data }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not summarise the conversation',
    }
  }
}

export async function nextActionIntelAction(schoolId: string): Promise<IntelActionResult> {
  const ctx = await requirePlatformContext('platform.crm')
  try {
    const data = await suggestSchoolNextAction(ctx, schoolId)
    return { ok: true, message: data.rationale, data }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not suggest a next action',
    }
  }
}

export async function riskAnalysisAction(schoolId: string): Promise<IntelActionResult> {
  const ctx = await requirePlatformContext('platform.crm')
  try {
    const data = await analyseSchoolRisk(ctx, schoolId)
    return { ok: true, message: `Risk ${data.level}`, data }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not analyse risk',
    }
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  certificateIssueSchema,
  certificateTemplateSchema,
  createCertificateTemplate,
  ensureDefaultCertificateTemplates,
  issueCertificate,
  revokeCertificate,
} from '@/server/modules/certificates/service'
import {
  createReportCardTemplate,
  updateReportCardTemplate,
  reportCardTemplateSchema,
} from '@/server/modules/exams/report-templates'
import type { FormState } from '@/lib/form-state'

function fields(error: ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

export async function issueCertificateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireContext('certificates.issue')
    const certificate = await issueCertificate(
      ctx,
      certificateIssueSchema.parse({
        templateId: formData.get('templateId'),
        studentId: formData.get('studentId'),
        purpose: formData.get('purpose') || undefined,
      }),
    )
    revalidatePath('/exams/certificates')
    redirect(`/exams/certificates/${certificate.id}`)
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Please correct the highlighted fields', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'The certificate could not be issued', fieldErrors: {} }
  }
}

export async function createCertificateTemplateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const ctx = await requireContext('certificates.template')
    await createCertificateTemplate(
      ctx,
      certificateTemplateSchema.parse({
        key: formData.get('key'),
        name: formData.get('name'),
        bodyHtml: formData.get('bodyHtml'),
        isActive: formData.get('isActive') === 'on',
      }),
    )
    revalidatePath('/exams/certificates')
    return { ok: true, error: null, fieldErrors: {}, message: 'Template saved.' }
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Please correct the template fields', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'The template could not be saved', fieldErrors: {} }
  }
}

export async function revokeCertificateAction(id: string) {
  const ctx = await requireContext('certificates.issue')
  await revokeCertificate(ctx, id)
  revalidatePath('/exams/certificates')
  revalidatePath(`/exams/certificates/${id}`)
}

export async function ensureCertificateTemplatesAction() {
  const ctx = await requireContext('certificates.template')
  await ensureDefaultCertificateTemplates(ctx)
  revalidatePath('/exams/certificates')
}

export async function createReportCardTemplateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const ctx = await requireContext('exams.manage')
    await createReportCardTemplate(
      ctx,
      reportCardTemplateSchema.parse({
        name: formData.get('name'),
        isDefault: formData.get('isDefault') === 'on',
        showAttendance: formData.get('showAttendance') === 'on',
        showRank: formData.get('showRank') === 'on',
        showRemarks: formData.get('showRemarks') === 'on',
        headerHtml: formData.get('headerHtml') || null,
        footerHtml: formData.get('footerHtml') || null,
      }),
    )
    revalidatePath('/exams/report-cards/templates')
    return { ok: true, error: null, fieldErrors: {}, message: 'Report card template saved.' }
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Please correct the template fields', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'The template could not be saved', fieldErrors: {} }
  }
}

export async function updateReportCardTemplateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const ctx = await requireContext('exams.manage')
    const id = String(formData.get('id') ?? '')
    await updateReportCardTemplate(
      ctx,
      id,
      reportCardTemplateSchema.parse({
        name: formData.get('name'),
        isDefault: formData.get('isDefault') === 'on',
        showAttendance: formData.get('showAttendance') === 'on',
        showRank: formData.get('showRank') === 'on',
        showRemarks: formData.get('showRemarks') === 'on',
        headerHtml: formData.get('headerHtml') || null,
        footerHtml: formData.get('footerHtml') || null,
      }),
    )
    revalidatePath('/exams/report-cards/templates')
    return { ok: true, error: null, fieldErrors: {}, message: 'Report card template updated.' }
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Please correct the template fields', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'The template could not be updated', fieldErrors: {} }
  }
}

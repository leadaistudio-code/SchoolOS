'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePlatformContext } from '@/server/context'
import { redirectWithFormError } from '@/server/modules/platform/action-errors'
import {
  createCommercialInvoice,
  createCommercialInvoiceSchema,
  duplicateTemplate,
  markCommercialInvoicePaid,
  rupeesToMinor,
  updateTemplate,
  updateTemplateSchema,
  voidCommercialInvoice,
} from '@/server/modules/platform/commercial-invoices'
import { parseTemplateBody } from '@/server/modules/platform/commercial-invoice-templates'

function revalidateInvoices(id?: string) {
  revalidatePath('/platform/invoices')
  revalidatePath('/platform/invoices/templates')
  if (id) revalidatePath(`/platform/invoices/${id}`)
}

export async function createCommercialInvoiceAction(formData: FormData) {
  const ctx = await requirePlatformContext('platform.billing')

  const lineTitles = formData.getAll('lineTitle') as string[]
  const lineDescs = formData.getAll('lineDescription') as string[]
  const lineQtys = formData.getAll('lineQty') as string[]
  const lineAmounts = formData.getAll('lineAmount') as string[] // rupees
  const lines = lineTitles
    .map((title, i) => ({
      title: title?.trim() ?? '',
      description: lineDescs[i]?.trim() || null,
      qty: Number(lineQtys[i] || 1),
      amountMinor: rupeesToMinor(Number(lineAmounts[i] || 0)),
    }))
    .filter((l) => l.title)

  const parsed = createCommercialInvoiceSchema.safeParse({
    tenantId: formData.get('tenantId'),
    templateId: formData.get('templateId'),
    status: formData.get('status') || 'DUE',
    dueInDays: formData.get('dueInDays') || 14,
    billToName: formData.get('billToName') || undefined,
    billToAddress: formData.get('billToAddress') || null,
    billToEmail: formData.get('billToEmail') || null,
    billToAttn: formData.get('billToAttn') || null,
    notes: formData.get('notes') || null,
    paymentRef: formData.get('paymentRef') || null,
    advanceMinor: rupeesToMinor(Number(formData.get('advanceRupees') || 0)),
    autoMonthly: formData.get('autoMonthly') === 'on',
    lines,
  })

  if (!parsed.success) {
    redirectWithFormError('/platform/invoices/new', parsed.error)
  }

  try {
    const invoice = await createCommercialInvoice(ctx, parsed.data)
    revalidateInvoices(invoice.id)
    redirect(`/platform/invoices/${invoice.id}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create invoice'
    redirect(`/platform/invoices/new?error=${encodeURIComponent(message)}`)
  }
}

export async function payCommercialInvoiceAction(id: string, formData: FormData) {
  const ctx = await requirePlatformContext('platform.billing')
  const paymentRef = String(formData.get('paymentRef') || '') || undefined
  await markCommercialInvoicePaid(ctx, id, paymentRef)
  revalidateInvoices(id)
}

export async function voidCommercialInvoiceAction(id: string) {
  const ctx = await requirePlatformContext('platform.billing')
  await voidCommercialInvoice(ctx, id)
  revalidateInvoices(id)
}

export async function updateTemplateAction(id: string, formData: FormData) {
  const ctx = await requirePlatformContext('platform.billing')
  const existing = await ctx.db.platformInvoiceTemplate.findUnique({ where: { id } })
  if (!existing) redirect('/platform/invoices/templates?error=Template%20not%20found')

  const current = parseTemplateBody(existing.body)
  const body = parseTemplateBody({
    ...current,
    layout: formData.get('layout') || current.layout,
    footer: formData.get('footer') ?? current.footer,
    showAdvance: formData.get('showAdvance') === 'on',
    defaultNotes: String(formData.get('defaultNotes') || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    from: {
      brand: String(formData.get('fromBrand') || current.from.brand),
      legalName: String(formData.get('fromLegalName') || current.from.legalName),
      website: String(formData.get('fromWebsite') || current.from.website),
      email: String(formData.get('fromEmail') || current.from.email),
    },
    labels: {
      documentTitle: String(formData.get('labelDocumentTitle') || current.labels.documentTitle),
      from: String(formData.get('labelFrom') || current.labels.from),
      billTo: String(formData.get('labelBillTo') || current.labels.billTo),
      notes: String(formData.get('labelNotes') || current.labels.notes),
      paymentReceived: String(formData.get('labelPayment') || current.labels.paymentReceived),
    },
    colors: {
      ink: String(formData.get('colorInk') || current.colors.ink),
      inkSoft: String(formData.get('colorInkSoft') || current.colors.inkSoft),
      rule: String(formData.get('colorRule') || current.colors.rule),
      wash: String(formData.get('colorWash') || current.colors.wash),
      accent: String(formData.get('colorAccent') || current.colors.accent),
    },
  })

  const parsed = updateTemplateSchema.safeParse({
    name: formData.get('name') || undefined,
    body,
  })
  if (!parsed.success) {
    redirectWithFormError(`/platform/invoices/templates/${id}`, parsed.error)
  }

  await updateTemplate(ctx, id, parsed.data)
  revalidatePath('/platform/invoices/templates')
  revalidatePath(`/platform/invoices/templates/${id}`)
  redirect(`/platform/invoices/templates/${id}?saved=1`)
}

export async function duplicateTemplateAction(id: string) {
  const ctx = await requirePlatformContext('platform.billing')
  const copy = await duplicateTemplate(ctx, id)
  revalidatePath('/platform/invoices/templates')
  redirect(`/platform/invoices/templates/${copy.id}`)
}

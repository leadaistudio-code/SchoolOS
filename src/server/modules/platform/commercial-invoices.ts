import { addDays, addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import type { PlatformContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { audit } from '@/server/audit'
import { badRequest, notFound } from '@/server/api/response'
import { paginationMeta } from '@/server/api/response'
import { z } from 'zod'
import {
  DEFAULT_FROM,
  SAMPLE_TEMPLATES,
  parseTemplateBody,
  type TemplateBody,
} from './commercial-invoice-templates'

const lineSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  qty: z.coerce.number().int().min(1).max(9999).default(1),
  amountMinor: z.coerce.number().int(),
})

export const createCommercialInvoiceSchema = z.object({
  tenantId: z.string().cuid(),
  templateId: z.string().cuid(),
  status: z.enum(['DRAFT', 'DUE']).default('DUE'),
  issueDate: z.coerce.date().optional(),
  dueInDays: z.coerce.number().int().min(0).max(365).default(14),
  billToName: z.string().min(1).max(200).optional(),
  billToAddress: z.string().max(1000).optional().nullable(),
  billToEmail: z.string().max(200).optional().nullable(),
  billToAttn: z.string().max(200).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  paymentRef: z.string().max(200).optional().nullable(),
  advanceMinor: z.coerce.number().int().min(0).default(0),
  autoMonthly: z.boolean().default(false),
  periodStart: z.coerce.date().optional().nullable(),
  periodEnd: z.coerce.date().optional().nullable(),
  lines: z.array(lineSchema).min(1).max(50),
})

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
})

export const listCommercialInvoicesSchema = z.object({
  status: z.string().optional(),
  tenantId: z.string().cuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

function inr(minor: number) {
  return `₹${Math.round(minor / 100).toLocaleString('en-IN')}`
}

/** Amounts on forms are rupees; store as paise (minor). */
export function rupeesToMinor(rupees: number) {
  return Math.round(rupees * 100)
}

async function nextCommercialNumber(db: PlatformContext['db'] | typeof prisma) {
  const now = new Date()
  const y = now.getFullYear()
  const fyStart = now.getMonth() >= 3 ? y : y - 1
  const fyLabel = `${fyStart}-${String(fyStart + 1).slice(2)}`
  const prefix = `MCV/INV/${fyLabel}/`
  const last = await db.platformInvoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  const seq = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export async function ensureSampleTemplates(db: PlatformContext['db'] | typeof prisma = prisma) {
  for (const sample of SAMPLE_TEMPLATES) {
    await db.platformInvoiceTemplate.upsert({
      where: { code: sample.code },
      create: {
        name: sample.name,
        code: sample.code,
        isSample: true,
        body: sample.body as object,
      },
      update: {},
    })
  }
}

export async function listTemplates(ctx: PlatformContext) {
  await ensureSampleTemplates(ctx.db)
  return ctx.db.platformInvoiceTemplate.findMany({ orderBy: [{ isSample: 'desc' }, { name: 'asc' }] })
}

export async function getTemplate(ctx: PlatformContext, id: string) {
  const row = await ctx.db.platformInvoiceTemplate.findUnique({ where: { id } })
  if (!row) throw notFound('Template')
  return row
}

export async function updateTemplate(
  ctx: PlatformContext,
  id: string,
  input: z.infer<typeof updateTemplateSchema>,
) {
  const existing = await ctx.db.platformInvoiceTemplate.findUnique({ where: { id } })
  if (!existing) throw notFound('Template')
  const nextBody = input.body
    ? parseTemplateBody({ ...parseTemplateBody(existing.body), ...input.body })
    : undefined
  const row = await ctx.db.platformInvoiceTemplate.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(nextBody ? { body: nextBody as object } : {}),
    },
  })
  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'platform.invoice_template.update',
    module: 'platform',
    entityType: 'PlatformInvoiceTemplate',
    entityId: id,
    summary: `Updated invoice template ${row.name}`,
  })
  return row
}

export async function duplicateTemplate(ctx: PlatformContext, id: string) {
  const src = await ctx.db.platformInvoiceTemplate.findUnique({ where: { id } })
  if (!src) throw notFound('Template')
  const code = `${src.code}_copy_${Date.now().toString(36).slice(-6)}`
  return ctx.db.platformInvoiceTemplate.create({
    data: {
      name: `${src.name} (copy)`,
      code,
      isSample: false,
      body: src.body as object,
    },
  })
}

export async function listCommercialInvoices(
  ctx: PlatformContext,
  query: z.infer<typeof listCommercialInvoicesSchema>,
) {
  let issueDateFilter: { gte?: Date; lte?: Date } | undefined
  if (query.month) {
    const [y, m] = query.month.split('-').map(Number)
    const start = new Date(y!, m! - 1, 1)
    issueDateFilter = { gte: start, lte: endOfMonth(start) }
  }
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    ...(issueDateFilter ? { issueDate: issueDateFilter } : {}),
  }
  const [total, rows] = await Promise.all([
    ctx.db.platformInvoice.count({ where }),
    ctx.db.platformInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        tenant: { select: { id: true, name: true, slug: true, school: { select: { name: true } } } },
        template: { select: { id: true, name: true, code: true } },
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    }),
  ])
  return { rows, meta: paginationMeta(query.page, query.pageSize, total) }
}

export async function getCommercialInvoice(ctx: PlatformContext, id: string) {
  const row = await ctx.db.platformInvoice.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, name: true, slug: true, school: { select: { name: true } } } },
      template: true,
      lines: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!row) throw notFound('Invoice')
  return row
}

export async function createCommercialInvoice(
  ctx: PlatformContext,
  raw: z.input<typeof createCommercialInvoiceSchema>,
) {
  const input = createCommercialInvoiceSchema.parse(raw)
  const tenant = await ctx.db.tenant.findUnique({
    where: { id: input.tenantId },
    include: {
      school: {
        select: {
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
        },
      },
    },
  })
  if (!tenant) throw notFound('School')
  const template = await ctx.db.platformInvoiceTemplate.findUnique({ where: { id: input.templateId } })
  if (!template) throw notFound('Template')

  if (input.autoMonthly) {
    const sub = await ctx.db.subscription.findUnique({ where: { tenantId: tenant.id } })
    if (!sub || sub.cycle !== 'MONTHLY') {
      throw badRequest('Monthly auto-invoice is only available for schools on a MONTHLY subscription')
    }
  }

  const body = parseTemplateBody(template.body)
  const schoolName = tenant.school?.name ?? tenant.name
  const addressParts = [
    tenant.school?.addressLine1,
    tenant.school?.addressLine2,
    [tenant.school?.city, tenant.school?.state, tenant.school?.postalCode].filter(Boolean).join(', '),
  ].filter(Boolean)

  const subtotalMinor = input.lines.reduce((s, l) => s + l.amountMinor * l.qty, 0)
  const advanceMinor = input.advanceMinor
  const balanceMinor = Math.max(0, subtotalMinor - advanceMinor)
  const issueDate = input.issueDate ?? new Date()
  const dueAt = addDays(issueDate, input.dueInDays)
  const number = await nextCommercialNumber(ctx.db)
  const periodStart = input.periodStart ?? startOfMonth(issueDate)
  const periodEnd = input.periodEnd ?? endOfMonth(issueDate)

  const invoice = await ctx.db.platformInvoice.create({
    data: {
      number,
      tenantId: tenant.id,
      templateId: template.id,
      status: input.status,
      issueDate,
      dueAt,
      currency: 'INR',
      subtotalMinor,
      advanceMinor,
      balanceMinor,
      billToName: input.billToName ?? schoolName,
      billToAddress: input.billToAddress ?? (addressParts.join('\n') || null),
      billToEmail: input.billToEmail ?? null,
      billToAttn: input.billToAttn ?? null,
      fromSnapshot: body.from,
      notes: input.notes ?? body.defaultNotes.join('\n'),
      paymentRef: input.paymentRef ?? null,
      periodStart,
      periodEnd,
      autoMonthly: input.autoMonthly,
      lines: {
        create: input.lines.map((l, i) => ({
          sortOrder: i,
          title: l.title,
          description: l.description ?? null,
          qty: l.qty,
          amountMinor: l.amountMinor,
        })),
      },
    },
    include: { lines: true, template: true, tenant: true },
  })

  await audit({
    tenantId: tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'platform.commercial_invoice.create',
    module: 'platform',
    entityType: 'PlatformInvoice',
    entityId: invoice.id,
    summary: `Created commercial invoice ${invoice.number} for ${schoolName}`,
  })
  return invoice
}

export async function markCommercialInvoicePaid(ctx: PlatformContext, id: string, paymentRef?: string) {
  const row = await ctx.db.platformInvoice.findUnique({ where: { id } })
  if (!row) throw notFound('Invoice')
  if (row.status === 'VOID') throw badRequest('Cannot pay a void invoice')
  const updated = await ctx.db.platformInvoice.update({
    where: { id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      balanceMinor: 0,
      ...(paymentRef ? { paymentRef } : {}),
    },
  })
  await audit({
    tenantId: row.tenantId,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'platform.commercial_invoice.pay',
    module: 'platform',
    entityType: 'PlatformInvoice',
    entityId: id,
    summary: `Marked ${row.number} paid`,
  })
  return updated
}

export async function voidCommercialInvoice(ctx: PlatformContext, id: string) {
  const row = await ctx.db.platformInvoice.findUnique({ where: { id } })
  if (!row) throw notFound('Invoice')
  if (row.status === 'PAID') throw badRequest('Cannot void a paid invoice')
  const updated = await ctx.db.platformInvoice.update({
    where: { id },
    data: { status: 'VOID', autoMonthly: false },
  })
  await audit({
    tenantId: row.tenantId,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'platform.commercial_invoice.void',
    module: 'platform',
    entityType: 'PlatformInvoice',
    entityId: id,
    summary: `Voided ${row.number}`,
  })
  return updated
}

/**
 * For each tenant with an autoMonthly schedule and MONTHLY subscription,
 * clone the latest schedule into a new DUE invoice for the current calendar month
 * if one does not already exist.
 */
export async function runMonthlyCommercialInvoices(now = new Date()) {
  await ensureSampleTemplates(prisma)
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const schedules = await prisma.platformInvoice.findMany({
    where: {
      autoMonthly: true,
      status: { in: ['DUE', 'PAID'] },
    },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      tenant: { include: { subscription: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Latest schedule per tenant
  const latest = new Map<string, (typeof schedules)[number]>()
  for (const inv of schedules) {
    if (!latest.has(inv.tenantId)) latest.set(inv.tenantId, inv)
  }

  let created = 0
  let skipped = 0
  for (const schedule of latest.values()) {
    const sub = schedule.tenant.subscription
    if (!sub || sub.cycle !== 'MONTHLY') {
      skipped++
      continue
    }
    if (sub.status !== 'ACTIVE' && sub.status !== 'PAST_DUE') {
      skipped++
      continue
    }

    const existing = await prisma.platformInvoice.findFirst({
      where: {
        tenantId: schedule.tenantId,
        status: { not: 'VOID' },
        issueDate: { gte: monthStart, lte: monthEnd },
        OR: [{ sourceInvoiceId: schedule.id }, { id: schedule.id, issueDate: { gte: monthStart, lte: monthEnd } }],
      },
      select: { id: true },
    })
    // Also skip if any non-void invoice already covers this month for the tenant from auto schedule
    const anyThisMonth = await prisma.platformInvoice.findFirst({
      where: {
        tenantId: schedule.tenantId,
        autoMonthly: true,
        status: { not: 'VOID' },
        issueDate: { gte: monthStart, lte: monthEnd },
      },
      select: { id: true },
    })
    if (existing || anyThisMonth) {
      skipped++
      continue
    }

    // Don't re-issue the schedule invoice itself if it was already created this month
    if (schedule.issueDate >= monthStart && schedule.issueDate <= monthEnd) {
      skipped++
      continue
    }

    const number = await nextCommercialNumber(prisma)
    const issueDate = now
    await prisma.platformInvoice.create({
      data: {
        number,
        tenantId: schedule.tenantId,
        templateId: schedule.templateId,
        status: 'DUE',
        issueDate,
        dueAt: addDays(issueDate, 14),
        currency: schedule.currency,
        subtotalMinor: schedule.subtotalMinor,
        advanceMinor: 0,
        balanceMinor: schedule.subtotalMinor,
        billToName: schedule.billToName,
        billToAddress: schedule.billToAddress,
        billToEmail: schedule.billToEmail,
        billToAttn: schedule.billToAttn,
        fromSnapshot: schedule.fromSnapshot as object,
        notes: schedule.notes,
        periodStart: monthStart,
        periodEnd: monthEnd,
        autoMonthly: true,
        sourceInvoiceId: schedule.id,
        lines: {
          create: schedule.lines.map((l, i) => ({
            sortOrder: i,
            title: l.title,
            description: l.description,
            qty: l.qty,
            amountMinor: l.amountMinor,
          })),
        },
      },
    })
    created++
  }

  return { created, skipped, checked: latest.size }
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderCommercialInvoiceHtml(input: {
  invoice: {
    number: string
    issueDate: Date
    dueAt: Date
    status: string
    subtotalMinor: number
    advanceMinor: number
    balanceMinor: number
    billToName: string
    billToAddress: string | null
    billToEmail: string | null
    billToAttn: string | null
    notes: string | null
    paymentRef: string | null
    paidAt: Date | null
    fromSnapshot: unknown
  }
  lines: { title: string; description: string | null; qty: number; amountMinor: number }[]
  templateBody: TemplateBody
  logoDataUrl?: string | null
}): string {
  const t = input.templateBody
  const from = {
    ...DEFAULT_FROM,
    ...((input.invoice.fromSnapshot && typeof input.invoice.fromSnapshot === 'object'
      ? input.invoice.fromSnapshot
      : {}) as Partial<typeof DEFAULT_FROM>),
    ...t.from,
  }
  const c = t.colors
  const notes = (input.invoice.notes ?? t.defaultNotes.join('\n'))
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean)
  const lineRows = input.lines
    .map(
      (l, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><span class="item">${esc(l.title)}</span>${
          l.description ? `<span class="desc">${esc(l.description)}</span>` : ''
        }</td>
        <td class="r">${l.qty}</td>
        <td class="r">${esc(inr(l.amountMinor * l.qty))}</td>
      </tr>`,
    )
    .join('')

  const headerBg = t.layout === 'brand_header' ? '#000' : '#fff'
  const headerColor = t.layout === 'brand_header' ? '#f6f5f2' : c.ink
  const logoBlock = input.logoDataUrl
    ? `<img src="${input.logoDataUrl}" alt="${esc(from.brand)}" style="height:36px;width:auto;display:block" />`
    : `<div style="font-family:Manrope,sans-serif;font-weight:800;font-size:16pt;color:${
        t.layout === 'brand_header' ? '#fff' : c.ink
      }">${esc(from.brand)}</div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(from.brand)} — ${esc(input.invoice.number)}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4;margin:0}
  body{font-family:"Source Sans 3",Segoe UI,sans-serif;font-size:10pt;line-height:1.4;color:${c.ink};background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:210mm;height:297mm;margin:0 auto;display:flex;flex-direction:column;overflow:hidden}
  .hdr{padding:8mm 12mm 4mm;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${c.rule};background:${headerBg};color:${headerColor}}
  .hdr-meta{text-align:right}
  .hdr-meta .doc{font-family:Manrope,sans-serif;font-size:16pt;font-weight:800}
  .hdr-meta .ref{margin-top:1mm;font-size:9.5pt;opacity:.85}
  .body{padding:4.5mm 12mm 4mm;display:flex;flex-direction:column;gap:3.5mm;flex:1}
  .meta{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid ${c.rule}}
  .meta div{padding:2.4mm 3.2mm}
  .meta div+div{border-left:1px solid ${c.rule}}
  .meta small{display:block;font-size:7.5pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${c.inkSoft};margin-bottom:.6mm}
  .meta span{font-weight:700;font-size:9.8pt}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm}
  .box{border:1px solid ${c.rule};padding:3.2mm 3.8mm;background:${t.layout === 'compact' ? '#fff' : c.wash}}
  .box h3{font-family:Manrope,sans-serif;font-size:8pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${c.inkSoft};margin-bottom:1.5mm}
  .box .name{font-family:Manrope,sans-serif;font-weight:800;font-size:11pt;margin-bottom:1mm}
  .box p{color:${c.inkSoft};font-size:9.5pt;white-space:pre-line}
  table.lines{width:100%;border-collapse:collapse;border:1px solid ${c.rule}}
  table.lines th{text-align:left;font-family:Manrope,sans-serif;font-size:8pt;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:2.4mm 3.2mm;border-bottom:1px solid ${c.rule};color:${c.inkSoft}}
  table.lines th.r,table.lines td.r{text-align:right}
  table.lines td{padding:3mm 3.2mm;vertical-align:top;border-bottom:1px solid ${c.rule}}
  table.lines tr:last-child td{border-bottom:0}
  .item{font-weight:700}
  .desc{display:block;color:${c.inkSoft};font-size:9pt;font-weight:400;margin-top:.8mm}
  .totals-wrap{display:grid;grid-template-columns:1.3fr .7fr;gap:3.5mm}
  .notes h3{font-family:Manrope,sans-serif;font-size:8pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${c.inkSoft};margin-bottom:1.8mm}
  .notes ul{list-style:none;display:grid;gap:1mm}
  .notes li{font-size:9pt;color:${c.inkSoft};padding-left:11px;position:relative}
  .notes li::before{content:"•";position:absolute;left:0;color:${c.inkSoft}}
  .totals{border:1px solid ${c.rule}}
  .totals .row{display:flex;justify-content:space-between;padding:2.2mm 3.2mm;border-bottom:1px solid ${c.rule};font-size:10pt}
  .totals .row:last-child{border-bottom:0}
  .totals .row span:last-child{font-weight:700}
  .totals .due{font-family:Manrope,sans-serif;font-weight:800;font-size:11.5pt;padding:2.8mm 3.2mm;border-top:2px solid ${c.accent}}
  .payment{border:1px solid ${c.rule};padding:3.2mm 3.8mm}
  .payment .tag{font-family:Manrope,sans-serif;font-size:8pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${c.inkSoft}}
  .payment h2{font-family:Manrope,sans-serif;font-size:11.5pt;font-weight:800;margin:1mm 0 0}
  .pf{margin-top:auto;display:flex;justify-content:space-between;padding:2.8mm 12mm;border-top:1px solid ${c.rule};font-size:8.5pt;color:${c.inkSoft}}
</style>
</head>
<body>
<div class="page">
  <header class="hdr">
    ${logoBlock}
    <div class="hdr-meta">
      <div class="doc">${esc(t.labels.documentTitle)}</div>
      <div class="ref">${esc(input.invoice.number)}<br />${esc(format(input.invoice.issueDate, 'd MMMM yyyy'))}</div>
    </div>
  </header>
  <div class="body">
    <div class="meta">
      <div><small>Invoice no.</small><span>${esc(input.invoice.number)}</span></div>
      <div><small>Issue date</small><span>${esc(format(input.invoice.issueDate, 'd MMM yyyy'))}</span></div>
      <div><small>Due date</small><span>${esc(format(input.invoice.dueAt, 'd MMM yyyy'))}</span></div>
      <div><small>Status</small><span>${esc(input.invoice.status)}</span></div>
    </div>
    <div class="parties">
      <div class="box">
        <h3>${esc(t.labels.from)}</h3>
        <div class="name">${esc(from.brand)}</div>
        <p>A product of <strong>${esc(from.legalName)}</strong><br />${esc(from.website)}<br />${esc(from.email)}</p>
      </div>
      <div class="box">
        <h3>${esc(t.labels.billTo)}</h3>
        <div class="name">${esc(input.invoice.billToName)}</div>
        <p>${esc(input.invoice.billToAddress ?? '')}${
          input.invoice.billToAttn ? `<br />Attn: ${esc(input.invoice.billToAttn)}` : ''
        }${input.invoice.billToEmail ? `<br />${esc(input.invoice.billToEmail)}` : ''}</p>
      </div>
    </div>
    <table class="lines">
      <thead><tr><th style="width:8%">#</th><th>Description</th><th class="r" style="width:12%">Qty</th><th class="r" style="width:18%">Amount</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table>
    <div class="totals-wrap">
      <div class="notes">
        <h3>${esc(t.labels.notes)}</h3>
        <ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${esc(inr(input.invoice.subtotalMinor))}</span></div>
        ${
          t.showAdvance && input.invoice.advanceMinor > 0
            ? `<div class="row"><span>Less: Advance</span><span>− ${esc(inr(input.invoice.advanceMinor))}</span></div>`
            : ''
        }
        <div class="row due"><span>Balance due</span><span>${esc(inr(input.invoice.balanceMinor))}</span></div>
      </div>
    </div>
    ${
      input.invoice.paymentRef || input.invoice.paidAt
        ? `<div class="payment"><div class="tag">${esc(t.labels.paymentReceived)}</div><h2>${
            input.invoice.paymentRef ? esc(input.invoice.paymentRef) : 'Payment recorded'
          }</h2></div>`
        : ''
    }
  </div>
  <footer class="pf"><span>${esc(input.invoice.billToName)} · ${esc(input.invoice.number)}</span><span>${esc(
    t.footer,
  )}</span><strong>Page 1 / 1</strong></footer>
</div>
</body>
</html>`
}

export async function renderInvoiceDocument(ctx: PlatformContext, id: string) {
  const invoice = await getCommercialInvoice(ctx, id)
  const body = parseTemplateBody(invoice.template.body)
  return renderCommercialInvoiceHtml({
    invoice,
    lines: invoice.lines,
    templateBody: body,
  })
}

/** Month shift helper used by tests. */
export function monthWindow(d: Date) {
  return { start: startOfMonth(d), end: endOfMonth(d), next: addMonths(startOfMonth(d), 1) }
}

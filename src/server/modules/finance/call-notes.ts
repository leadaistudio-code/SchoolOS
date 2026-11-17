import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { assertStudentAccess } from '@/server/scope'
import { conflict, notFound } from '@/server/api/response'

export const feeCallNoteSchema = z.object({
  studentId: z.string().min(1),
  notes: z.string().trim().min(3, 'Write what was discussed').max(2000),
  calledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
})

function digits(phone: string) {
  return phone.replace(/\D/g, '')
}

/** Primary guardian phone, else student WhatsApp / emergency contact. */
export async function feeCallContact(ctx: AppContext, studentId: string) {
  await assertStudentAccess(ctx, studentId)
  const student = await ctx.db.student.findFirst({
    where: { id: studentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      whatsappPhone: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      guardians: {
        orderBy: [{ isPrimary: 'desc' }, { isEmergencyContact: 'desc' }],
        select: {
          isPrimary: true,
          relation: true,
          parent: { select: { firstName: true, lastName: true, phone: true } },
        },
      },
    },
  })
  if (!student) throw notFound('Student')

  const primary = student.guardians.find((g) => g.isPrimary && g.parent.phone)
    ?? student.guardians.find((g) => g.parent.phone)
  if (primary?.parent.phone) {
    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      phone: primary.parent.phone,
      telHref: `tel:${digits(primary.parent.phone)}`,
      contactLabel: `${primary.relation.charAt(0)}${primary.relation.slice(1).toLowerCase()} · ${primary.parent.firstName} ${primary.parent.lastName}`.trim(),
    }
  }
  if (student.whatsappPhone) {
    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      phone: student.whatsappPhone,
      telHref: `tel:${digits(student.whatsappPhone)}`,
      contactLabel: 'Student WhatsApp',
    }
  }
  if (student.emergencyContactPhone) {
    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      phone: student.emergencyContactPhone,
      telHref: `tel:${digits(student.emergencyContactPhone)}`,
      contactLabel: student.emergencyContactName ? `Emergency · ${student.emergencyContactName}` : 'Emergency contact',
    }
  }
  return {
    studentId: student.id,
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    phone: null as string | null,
    telHref: null as string | null,
    contactLabel: null as string | null,
  }
}

export async function listFeeCallNotes(ctx: AppContext, studentId: string) {
  ctx.require('fees.accounts')
  await assertStudentAccess(ctx, studentId)
  return ctx.db.feeCallNote.findMany({
    where: { studentId },
    orderBy: { calledAt: 'desc' },
    take: 50,
  })
}

export async function latestFeeCallNotes(
  ctx: AppContext,
  studentIds: string[],
): Promise<Map<string, { calledAt: Date; notes: string; contactLabel: string | null }>> {
  if (studentIds.length === 0) return new Map()
  const rows = await ctx.db.feeCallNote.findMany({
    where: { studentId: { in: studentIds } },
    orderBy: { calledAt: 'desc' },
    select: { studentId: true, calledAt: true, notes: true, contactLabel: true },
  })
  const map = new Map<string, { calledAt: Date; notes: string; contactLabel: string | null }>()
  for (const row of rows) {
    if (!map.has(row.studentId)) map.set(row.studentId, row)
  }
  return map
}

export async function createFeeCallNote(ctx: AppContext, input: z.infer<typeof feeCallNoteSchema>) {
  ctx.require('fees.accounts')
  await assertStudentAccess(ctx, input.studentId)
  const contact = await feeCallContact(ctx, input.studentId)
  if (!contact.phone) throw conflict('No phone number on file for this student or their primary guardian')

  const calledAt = input.calledAt ? new Date(`${input.calledAt}:00`) : new Date()
  if (Number.isNaN(calledAt.getTime())) throw conflict('Enter a valid call date and time')

  const note = await ctx.db.feeCallNote.create({
    data: {
      tenantId: ctx.tenant.id,
      studentId: input.studentId,
      phone: contact.phone,
      contactLabel: contact.contactLabel,
      calledAt,
      notes: input.notes.trim(),
      createdById: ctx.user.userId,
      createdByLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee.call_note.create',
    module: 'fees',
    entityType: 'FeeCallNote',
    entityId: note.id,
    summary: `Logged fee call with ${contact.studentName} (${contact.contactLabel ?? contact.phone})`,
    after: { phone: note.phone, calledAt: note.calledAt, notes: note.notes },
  })

  return note
}

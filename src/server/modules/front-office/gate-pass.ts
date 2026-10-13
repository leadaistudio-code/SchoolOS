import crypto from 'node:crypto'
import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { hmacSha256, randomToken, timingSafeEqual } from '@/server/crypto'
import { notify } from '@/server/notifications'
import { sendParentMessage } from '@/server/messaging/send'
import { istDayBounds } from '@/server/modules/finance/dashboard'
import { env } from '@/lib/env'
import { istClock } from '@/lib/ist-clock'
import { maskPhone, phoneKey } from '@/lib/phone'

const OTP_TTL_MS = 15 * 60_000
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_GAP_MS = 45_000

export const gatePassSchema = z
  .object({
    studentId: z.string().min(1),
    reason: z.string().trim().min(2, 'Say why the student is leaving').max(200),
    guardianId: z.string().optional(),
    pickupName: z.string().trim().max(80).optional(),
    pickupRelation: z.string().trim().max(40).optional(),
    pickupPhone: z.string().trim().max(20).optional(),
    verification: z.enum(['OTP', 'IN_PERSON']),
  })
  .refine((v) => v.guardianId || (v.pickupName && v.pickupName.length >= 2), {
    path: ['pickupName'],
    message: 'Pick a guardian or enter who is collecting',
  })
  .refine((v) => v.guardianId || v.verification === 'OTP', {
    path: ['verification'],
    message: 'Someone not on the pickup list needs a guardian’s OTP approval',
  })

export type GatePassInput = z.infer<typeof gatePassSchema>

const actor = (ctx: AppContext) => ({
  tenantId: ctx.tenant.id,
  actorId: ctx.user.userId,
  actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
})

function otpHash(token: string, otp: string) {
  return hmacSha256(`gatepass:${token}:${otp}`, env().AUTH_SECRET)
}

function newOtp() {
  return String(crypto.randomInt(100_000, 1_000_000))
}

/** A student with the people allowed to collect them, for the desk form. */
export async function pickupCandidates(ctx: AppContext, studentId: string) {
  ctx.require('frontoffice.gatepass')
  const student = await ctx.db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      photoUrl: true,
      whatsappPhone: true,
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
      },
      guardians: {
        orderBy: [{ isPrimary: 'desc' }],
        select: {
          relation: true,
          canPickup: true,
          isPrimary: true,
          parent: { select: { id: true, firstName: true, lastName: true, phone: true, photoUrl: true } },
        },
      },
    },
  })
  if (!student) throw notFound('Student')
  const e = student.enrollments[0]
  return {
    id: student.id,
    name: `${student.firstName} ${student.lastName}`.trim(),
    admissionNo: student.admissionNo,
    photoUrl: student.photoUrl,
    className: e ? `${e.classLevel.name} ${e.section.name}` : '',
    hasContact: !!(student.whatsappPhone || student.guardians.some((g) => g.parent.phone)),
    guardians: student.guardians.map((g) => ({
      id: g.parent.id,
      name: `${g.parent.firstName} ${g.parent.lastName}`.trim(),
      relation: g.relation,
      canPickup: g.canPickup,
      isPrimary: g.isPrimary,
      phone: maskPhone(g.parent.phone),
      hasPhone: !!phoneKey(g.parent.phone),
      photoUrl: g.parent.photoUrl,
    })),
  }
}

/** Where the approval code goes: the collecting guardian, or else the primary guardian. */
async function approverPhone(ctx: AppContext, studentId: string, guardianId?: string) {
  const student = await ctx.db.student.findFirst({
    where: { id: studentId },
    select: {
      whatsappPhone: true,
      guardians: {
        orderBy: [{ isPrimary: 'desc' }],
        select: { parentId: true, canPickup: true, parent: { select: { phone: true } } },
      },
    },
  })
  const own = guardianId ? student?.guardians.find((g) => g.parentId === guardianId)?.parent.phone : null
  if (phoneKey(own)) return own!
  const other = student?.guardians.find((g) => phoneKey(g.parent.phone))?.parent.phone
  if (other) return other
  return phoneKey(student?.whatsappPhone) ? student!.whatsappPhone! : null
}

async function sendOtp(ctx: AppContext, pass: { token: string; pickupName: string; pickupRelation: string | null; reason: string }, studentName: string, to: string) {
  const otp = newOtp()
  const r = await sendParentMessage({
    to,
    body:
      `${ctx.tenant.name}: ${pass.pickupName}${pass.pickupRelation ? ` (${pass.pickupRelation})` : ''} is at the school to collect ${studentName}. ` +
      `Reason: ${pass.reason}.\n\nIf you approve, share this code with them: ${otp}\nValid for 15 minutes. If you did not expect this, call the school.`,
  })
  return { otp, ok: r.ok, error: r.ok ? undefined : r.error }
}

async function nextPassNumber(ctx: AppContext) {
  const { iso } = istClock()
  const count = await ctx.db.gatePass.count({ where: { createdAt: istDayBounds(iso) } })
  return `GP-${iso.replaceAll('-', '')}-${String(count + 1).padStart(3, '0')}`
}

export async function createGatePass(ctx: AppContext, raw: GatePassInput) {
  ctx.require('frontoffice.gatepass')
  const input = gatePassSchema.parse(raw)
  const student = await ctx.db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, status: true },
  })
  if (!student) throw notFound('Student')

  let pickupName = input.pickupName ?? ''
  let pickupRelation = input.pickupRelation || null
  let pickupPhone = input.pickupPhone || null
  if (input.guardianId) {
    const link = await ctx.db.studentGuardian.findFirst({
      where: { studentId: student.id, parentId: input.guardianId },
      select: { relation: true, canPickup: true, parent: { select: { firstName: true, lastName: true, phone: true } } },
    })
    if (!link) throw badRequest('That person is not a guardian of this student.')
    if (!link.canPickup && input.verification === 'IN_PERSON') {
      throw badRequest('This guardian is not on the pickup list. Send an OTP to approve instead.')
    }
    pickupName = `${link.parent.firstName} ${link.parent.lastName}`.trim()
    pickupRelation = link.relation.charAt(0) + link.relation.slice(1).toLowerCase()
    pickupPhone = link.parent.phone
  }

  const open = await ctx.db.gatePass.findFirst({
    where: { studentId: student.id, status: { in: ['AWAITING_OTP', 'APPROVED'] }, createdAt: istDayBounds(istClock().iso) },
    select: { passNumber: true },
  })
  if (open) throw conflict(`${student.firstName} already has an open pass today (${open.passNumber}).`)

  const studentName = `${student.firstName} ${student.lastName}`.trim()
  const token = randomToken(18)
  const base = {
    tenantId: ctx.tenant.id,
    passNumber: await nextPassNumber(ctx),
    token,
    studentId: student.id,
    reason: input.reason,
    pickupName,
    pickupRelation,
    pickupPhone,
    guardianId: input.guardianId ?? null,
    issuedById: ctx.user.userId,
    issuedByLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
  }

  let created
  if (input.verification === 'IN_PERSON') {
    created = await ctx.db.gatePass.create({
      data: { ...base, verification: 'IN_PERSON', status: 'APPROVED', approvedAt: new Date() },
    })
  } else {
    const to = await approverPhone(ctx, student.id, input.guardianId)
    if (!to) throw badRequest('No guardian phone number on record to send the approval code to.')
    const sent = await sendOtp(ctx, { token, pickupName, pickupRelation, reason: input.reason }, studentName, to)
    if (!sent.ok) throw badRequest(`Could not send the code: ${sent.error ?? 'messaging failed'}`)
    created = await ctx.db.gatePass.create({
      data: {
        ...base,
        status: 'AWAITING_OTP',
        otpHash: otpHash(token, sent.otp),
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
        otpSentTo: maskPhone(to),
      },
    })
  }

  await audit({
    ...actor(ctx),
    action: 'frontoffice.gatepass.create',
    module: 'front_office',
    entityType: 'GatePass',
    entityId: created.id,
    summary: `Gate pass ${created.passNumber} for ${studentName}, collected by ${pickupName}`,
  })
  return created
}

export async function resendGatePassOtp(ctx: AppContext, id: string) {
  ctx.require('frontoffice.gatepass')
  const pass = await ctx.db.gatePass.findFirst({
    where: { id },
    include: { student: { select: { firstName: true, lastName: true } } },
  })
  if (!pass) throw notFound('Gate pass')
  if (pass.status !== 'AWAITING_OTP') throw conflict('This pass is not waiting for a code.')
  if (Date.now() - pass.updatedAt.getTime() < OTP_RESEND_GAP_MS) {
    throw badRequest('Wait a moment before sending another code.')
  }
  const to = await approverPhone(ctx, pass.studentId, pass.guardianId ?? undefined)
  if (!to) throw badRequest('No guardian phone number on record.')
  const sent = await sendOtp(ctx, pass, `${pass.student.firstName} ${pass.student.lastName}`.trim(), to)
  if (!sent.ok) throw badRequest(`Could not send the code: ${sent.error ?? 'messaging failed'}`)
  return ctx.db.gatePass.update({
    where: { id },
    data: {
      otpHash: otpHash(pass.token, sent.otp),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
      otpAttempts: 0,
      otpSentTo: maskPhone(to),
    },
  })
}

export async function verifyGatePassOtp(ctx: AppContext, id: string, code: string) {
  ctx.require('frontoffice.gatepass')
  const pass = await ctx.db.gatePass.findFirst({ where: { id } })
  if (!pass) throw notFound('Gate pass')
  if (pass.status !== 'AWAITING_OTP' || !pass.otpHash) throw conflict('This pass is not waiting for a code.')
  if (pass.otpAttempts >= OTP_MAX_ATTEMPTS) throw badRequest('Too many wrong codes. Send a new one.')
  if (!pass.otpExpiresAt || pass.otpExpiresAt.getTime() < Date.now()) throw badRequest('The code has expired. Send a new one.')

  const clean = code.replace(/\D/g, '')
  const okCode = clean.length === 6 && timingSafeEqual(otpHash(pass.token, clean), pass.otpHash)
  if (!okCode) {
    await ctx.db.gatePass.update({ where: { id }, data: { otpAttempts: { increment: 1 } } })
    const left = OTP_MAX_ATTEMPTS - pass.otpAttempts - 1
    throw badRequest(left > 0 ? `That code is wrong. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong codes. Send a new one.')
  }

  const updated = await ctx.db.gatePass.update({
    where: { id },
    data: { status: 'APPROVED', verification: 'OTP', approvedAt: new Date(), otpHash: null },
  })
  await audit({
    ...actor(ctx),
    action: 'frontoffice.gatepass.approve',
    module: 'front_office',
    entityType: 'GatePass',
    entityId: id,
    summary: `Guardian approved gate pass ${pass.passNumber} by OTP`,
  })
  return updated
}

/** What the gate sees after scanning: who, with whom, and whether they may go. */
export async function lookupGatePass(ctx: AppContext, codeOrToken: string) {
  ctx.require('frontoffice.gate')
  const value = codeOrToken.trim()
  const token = value.includes('/') ? (value.split('/').pop() ?? '').split('?')[0] : value
  const pass = await ctx.db.gatePass.findFirst({
    where: { OR: [{ token }, { passNumber: value.toUpperCase() }] },
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNo: true,
          photoUrl: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      },
      guardian: { select: { photoUrl: true } },
    },
  })
  if (!pass) throw notFound('Gate pass')
  const e = pass.student.enrollments[0]
  const today = istClock().iso
  const issuedToday = istClock(pass.createdAt).iso === today
  return {
    id: pass.id,
    passNumber: pass.passNumber,
    status: pass.status,
    issuedToday,
    student: `${pass.student.firstName} ${pass.student.lastName}`.trim(),
    admissionNo: pass.student.admissionNo,
    className: e ? `${e.classLevel.name} ${e.section.name}` : '',
    studentPhoto: pass.student.photoUrl,
    pickupName: pass.pickupName,
    pickupRelation: pass.pickupRelation,
    pickupPhoto: pass.guardian?.photoUrl ?? null,
    reason: pass.reason,
    verification: pass.verification,
    exitedAt: pass.exitedAt,
  }
}

async function tellParents(ctx: AppContext, pass: { studentId: string; pickupName: string; pickupRelation: string | null; exitedAt: Date }) {
  const student = await ctx.db.student.findFirst({
    where: { id: pass.studentId },
    select: {
      firstName: true,
      lastName: true,
      whatsappPhone: true,
      guardians: { select: { parent: { select: { userId: true, phone: true } } } },
    },
  })
  if (!student) return false
  const time = pass.exitedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  const title = `${student.firstName} left school at ${time}`
  const body = `${student.firstName} ${student.lastName} left ${ctx.tenant.name} at ${time} with ${pass.pickupName}${pass.pickupRelation ? ` (${pass.pickupRelation})` : ''}.`

  const userIds = student.guardians.map((g) => g.parent.userId).filter((v): v is string => !!v)
  if (userIds.length) {
    await notify(ctx, { userIds, eventKey: 'gatepass.exited', title, body, linkUrl: '/', channels: ['IN_APP', 'WHATSAPP'] })
  }
  const covered = new Set<string>()
  const users = await ctx.db.user.findMany({ where: { id: { in: userIds } }, select: { phone: true } })
  for (const u of users) {
    const k = phoneKey(u.phone)
    if (k) covered.add(k)
  }
  const phones = [...student.guardians.map((g) => g.parent.phone), student.whatsappPhone]
  for (const phone of phones) {
    const k = phoneKey(phone)
    if (!k || covered.has(k)) continue
    covered.add(k)
    await sendParentMessage({ to: phone!, body: `${title}\n\n${body}` })
  }
  return covered.size > 0 || userIds.length > 0
}

export async function markGatePassExited(ctx: AppContext, id: string) {
  ctx.require('frontoffice.gate')
  const pass = await ctx.db.gatePass.findFirst({ where: { id } })
  if (!pass) throw notFound('Gate pass')
  if (pass.status === 'EXITED') throw conflict('Already scanned out.')
  if (pass.status === 'CANCELLED') throw conflict('This pass was cancelled. Do not let the student leave.')
  if (pass.status !== 'APPROVED') throw conflict('The guardian has not approved this pass yet.')
  if (istClock(pass.createdAt).iso !== istClock().iso) throw conflict('This pass was for another day.')

  const exitedAt = new Date()
  const claimed = await ctx.db.gatePass.updateMany({
    where: { id, status: 'APPROVED' },
    data: { status: 'EXITED', exitedAt, exitedByLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim() },
  })
  if (claimed.count === 0) throw conflict('Already scanned out.')

  const told = await tellParents(ctx, { ...pass, exitedAt })
  if (told) await ctx.db.gatePass.update({ where: { id }, data: { parentNotifiedAt: new Date() } })
  await audit({
    ...actor(ctx),
    action: 'frontoffice.gatepass.exit',
    module: 'front_office',
    entityType: 'GatePass',
    entityId: id,
    summary: `${pass.passNumber}: student left with ${pass.pickupName}`,
  })
  return { told }
}

export async function cancelGatePass(ctx: AppContext, id: string, reason: string) {
  ctx.require('frontoffice.gatepass')
  const pass = await ctx.db.gatePass.findFirst({ where: { id } })
  if (!pass) throw notFound('Gate pass')
  if (pass.status === 'EXITED') throw conflict('The student has already left.')
  if (pass.status === 'CANCELLED') return pass
  const updated = await ctx.db.gatePass.update({
    where: { id },
    data: { status: 'CANCELLED', cancelReason: reason.trim() || null, otpHash: null },
  })
  await audit({
    ...actor(ctx),
    action: 'frontoffice.gatepass.cancel',
    module: 'front_office',
    entityType: 'GatePass',
    entityId: id,
    summary: `Cancelled ${pass.passNumber}${reason.trim() ? `: ${reason.trim()}` : ''}`,
  })
  return updated
}

export async function listGatePasses(ctx: AppContext, iso: string) {
  ctx.require('frontoffice.view')
  return ctx.db.gatePass.findMany({
    where: { createdAt: istDayBounds(iso) },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      passNumber: true,
      status: true,
      reason: true,
      pickupName: true,
      pickupRelation: true,
      verification: true,
      otpSentTo: true,
      createdAt: true,
      approvedAt: true,
      exitedAt: true,
      issuedByLabel: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNo: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      },
    },
  })
}

export async function getGatePass(ctx: AppContext, id: string) {
  ctx.require('frontoffice.view')
  const pass = await ctx.db.gatePass.findFirst({
    where: { id },
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNo: true,
          photoUrl: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      },
    },
  })
  if (!pass) throw notFound('Gate pass')
  return pass
}

/** Search for the desk: name or admission number, current students only. */
export async function searchStudentsForPass(ctx: AppContext, q: string) {
  ctx.require('frontoffice.gatepass')
  const term = q.trim()
  if (term.length < 2) return []
  const tokens = term.split(/\s+/).slice(0, 3)
  const rows = await ctx.db.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      AND: tokens.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: 'insensitive' as const } },
          { lastName: { contains: t, mode: 'insensitive' as const } },
          { admissionNo: { contains: t, mode: 'insensitive' as const } },
        ],
      })),
    },
    take: 8,
    orderBy: { firstName: 'asc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
      },
    },
  })
  return rows.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`.trim(),
    admissionNo: s.admissionNo,
    className: s.enrollments[0] ? `${s.enrollments[0].classLevel.name} ${s.enrollments[0].section.name}` : '',
  }))
}

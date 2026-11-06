'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { uploadFile } from '@/server/files'
import { labTemplate } from '@/lib/labs/templates'
import { createLab, deleteLab, getLab, saveInfrastructure, updateLab } from '@/server/modules/labs/service'
import { addLabItem, recordMovement, setItemMsds, setOpeningCounts, updateLabItem } from '@/server/modules/labs/stock'
import { archiveExperiment, bookSession, cancelSession, completeSession, saveExperiment } from '@/server/modules/labs/sessions'
import { closeIncident, logWaste, recordInspection, reportIncident } from '@/server/modules/labs/safety'

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: error.issues[0]?.message ?? 'Please correct the highlighted fields', fieldErrors }
  }
  if (error instanceof ApiException) return { error: error.message, fieldErrors: {} }
  return { error: error instanceof Error ? error.message : fallback, fieldErrors: {} }
}

const done = (message: string): FormState => ({ ...emptyFormState, ok: true, message })
const text = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === 'string' ? v : undefined
}
const files = (fd: FormData, key: string) => fd.getAll(key).filter((f): f is File => f instanceof File && f.size > 0)

/* ---------------------------------------------------------------- setup */

export async function createLabAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.manage')
  let id: string
  try {
    const lab = await createLab(ctx, {
      name: text(fd, 'name'),
      type: text(fd, 'type'),
      room: text(fd, 'room'),
      inChargeStaffId: text(fd, 'inChargeStaffId'),
      assistantStaffId: text(fd, 'assistantStaffId'),
      loadItems: fd.get('loadItems') === 'on',
      loadPracticals: fd.get('loadPracticals') === 'on',
    })
    id = lab.id
  } catch (error) {
    return fail(error, 'Could not set up the lab')
  }
  revalidatePath('/labs')
  redirect(`/labs/${id}/setup`)
}

export async function updateLabAction(labId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.manage')
  try {
    const contacts = [0, 1, 2, 3, 4, 5]
      .map((i) => ({ label: text(fd, `contactLabel${i}`)?.trim() ?? '', phone: text(fd, `contactPhone${i}`)?.trim() ?? '' }))
      .filter((c) => c.label && c.phone)
    await updateLab(ctx, labId, {
      name: text(fd, 'name'),
      room: text(fd, 'room'),
      inChargeStaffId: text(fd, 'inChargeStaffId'),
      assistantStaffId: text(fd, 'assistantStaffId'),
      notes: text(fd, 'notes'),
      emergencyContacts: contacts,
    })
    revalidatePath(`/labs/${labId}`, 'layout')
    return done('Lab details saved')
  } catch (error) {
    return fail(error, 'Could not save the lab')
  }
}

export async function deleteLabAction(labId: string) {
  const ctx = await requireContext('labs.manage')
  await deleteLab(ctx, labId)
  revalidatePath('/labs')
  redirect('/labs')
}

export async function saveInfrastructureAction(labId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.manage')
  try {
    const lab = await getLab(ctx, labId)
    const template = labTemplate(lab.templateCode)
    if (!template) return { error: 'This lab has no standard template', fieldErrors: {} }
    const answers: Record<string, { ok: boolean; value?: number; note?: string }> = {}
    for (const check of template.infrastructure) {
      const rawValue = text(fd, `value_${check.code}`)
      const value = rawValue && rawValue.trim() !== '' ? Number(rawValue) : undefined
      const note = text(fd, `note_${check.code}`)?.trim()
      answers[check.code] = {
        ok: fd.get(`ok_${check.code}`) === 'on',
        ...(value !== undefined && Number.isFinite(value) ? { value } : {}),
        ...(note ? { note: note.slice(0, 200) } : {}),
      }
    }
    await saveInfrastructure(ctx, labId, answers)
    revalidatePath(`/labs/${labId}`, 'layout')
    return done('Infrastructure checklist saved')
  } catch (error) {
    return fail(error, 'Could not save the checklist')
  }
}

/* ------------------------------------------------------------- register */

function itemFields(fd: FormData) {
  return {
    name: text(fd, 'name'),
    category: text(fd, 'category'),
    kind: text(fd, 'kind'),
    unit: text(fd, 'unit'),
    requiredQty: text(fd, 'requiredQty') || 0,
    reorderLevel: text(fd, 'reorderLevel') || 0,
    storageLocation: text(fd, 'storageLocation'),
    hazards: fd.getAll('hazards').map(String),
    expiresOn: text(fd, 'expiresOn'),
    unitCostMinor: Math.round(Number(text(fd, 'unitCost') || 0) * 100),
    notes: text(fd, 'notes'),
  }
}

export async function addItemAction(labId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.stock')
  try {
    const item = await addLabItem(ctx, labId, { ...itemFields(fd), openingQty: text(fd, 'openingQty') || 0 })
    revalidatePath(`/labs/${labId}`, 'layout')
    return done(`${item.name} added to the register`)
  } catch (error) {
    return fail(error, 'Could not add the item')
  }
}

export async function updateItemAction(labId: string, itemId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.stock')
  try {
    await updateLabItem(ctx, itemId, itemFields(fd))
    const msds = files(fd, 'msds')[0]
    if (msds) {
      if (msds.type !== 'application/pdf' && !msds.type.startsWith('image/')) {
        return { error: 'Upload the safety data sheet as a PDF or photo', fieldErrors: {} }
      }
      const uploaded = await uploadFile(ctx, msds, 'labs/msds')
      await setItemMsds(ctx, itemId, uploaded.storageKey)
    }
    revalidatePath(`/labs/${labId}`, 'layout')
    return done('Item saved')
  } catch (error) {
    return fail(error, 'Could not save the item')
  }
}

export async function movementAction(labId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.stock')
  try {
    const type = text(fd, 'type')
    const cost = text(fd, 'unitCost')
    const admissionNo = text(fd, 'admissionNo')?.trim()
    let studentId: string | undefined
    if (type === 'BREAKAGE' && admissionNo) {
      const student = await ctx.db.student.findFirst({ where: { admissionNo, deletedAt: null }, select: { id: true } })
      if (!student) return { error: `No student with admission no. ${admissionNo}`, fieldErrors: {} }
      studentId = student.id
    }
    await recordMovement(ctx, labId, {
      type,
      itemId: text(fd, 'itemId'),
      quantity: text(fd, 'quantity'),
      countedQty: text(fd, 'countedQty'),
      unitCostMinor: cost ? Math.round(Number(cost) * 100) : 0,
      vendorName: text(fd, 'vendorName'),
      invoiceNo: text(fd, 'invoiceNo'),
      expiresOn: text(fd, 'expiresOn'),
      studentId,
      chargeMinor: text(fd, 'charge') ? Math.round(Number(text(fd, 'charge')) * 100) : undefined,
      reason: text(fd, 'reason'),
    })
    revalidatePath(`/labs/${labId}`, 'layout')
    return done('Stock updated')
  } catch (error) {
    return fail(error, 'Could not record the stock entry')
  }
}

export async function countAction(labId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.stock')
  try {
    const counts: { itemId: string; qty: number }[] = []
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith('count_') || typeof value !== 'string' || value.trim() === '') continue
      counts.push({ itemId: key.slice(6), qty: Number(value) })
    }
    if (counts.some((c) => !Number.isFinite(c.qty) || c.qty < 0)) {
      return { error: 'Counts must be zero or more', fieldErrors: {} }
    }
    const changed = await setOpeningCounts(ctx, labId, counts)
    revalidatePath(`/labs/${labId}`, 'layout')
    return done(changed ? `Stock recorded for ${changed} item(s)` : 'Nothing changed')
  } catch (error) {
    return fail(error, 'Could not save the stock count')
  }
}

/* ------------------------------------------------------------ practicals */

export async function saveExperimentAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.manage')
  try {
    let apparatus: unknown = []
    try {
      apparatus = JSON.parse(text(fd, 'apparatus') || '[]')
    } catch {
      apparatus = []
    }
    await saveExperiment(ctx, id, {
      labType: text(fd, 'labType'),
      classNumber: text(fd, 'classNumber'),
      subject: text(fd, 'subject'),
      title: text(fd, 'title'),
      aim: text(fd, 'aim'),
      safetyNotes: text(fd, 'safetyNotes'),
      apparatus,
    })
    revalidatePath('/labs/practicals')
    return done(id ? 'Practical saved' : 'Practical added')
  } catch (error) {
    return fail(error, 'Could not save the practical')
  }
}

export async function archiveExperimentAction(id: string) {
  const ctx = await requireContext('labs.manage')
  await archiveExperiment(ctx, id)
  revalidatePath('/labs/practicals')
}

/* -------------------------------------------------------------- sessions */

export async function bookSessionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.sessions')
  try {
    await bookSession(ctx, Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')))
    revalidatePath('/labs/sessions')
    return done('Lab booked')
  } catch (error) {
    return fail(error, 'Could not book the lab')
  }
}

export async function cancelSessionAction(id: string) {
  const ctx = await requireContext('labs.sessions')
  await cancelSession(ctx, id)
  revalidatePath('/labs/sessions')
}

export async function completeSessionAction(sessionId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.sessions')
  try {
    const payload = JSON.parse(text(fd, 'payload') || '{}') as Record<string, unknown>
    const result = await completeSession(ctx, { ...payload, sessionId })
    revalidatePath('/labs', 'layout')
    return done(
      `Practical completed: ${result.present} present, ${result.consumed} consumable(s) deducted${
        result.breakages ? `, ${result.breakages} breakage(s) recorded` : ''
      }`,
    )
  } catch (error) {
    return fail(error, 'Could not complete the session')
  }
}

/* ---------------------------------------------------------------- safety */

export async function inspectionAction(labId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.safety')
  try {
    const checklist: Record<string, boolean> = {}
    for (const key of fd.keys()) if (key.startsWith('check_')) checklist[key.slice(6)] = true
    await recordInspection(
      ctx,
      {
        labId,
        type: text(fd, 'type'),
        inspectedOn: text(fd, 'inspectedOn'),
        checklist,
        issues: text(fd, 'issues'),
        inspectorName: text(fd, 'inspectorName'),
      },
      files(fd, 'photos'),
    )
    revalidatePath(`/labs/${labId}`, 'layout')
    return done('Inspection recorded')
  } catch (error) {
    return fail(error, 'Could not record the inspection')
  }
}

export async function incidentAction(labId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.safety')
  try {
    const admissionNos = (text(fd, 'admissionNos') ?? '')
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    let studentIds: string[] = []
    if (admissionNos.length) {
      const students = await ctx.db.student.findMany({
        where: { admissionNo: { in: admissionNos }, deletedAt: null },
        select: { id: true, admissionNo: true },
      })
      const missing = admissionNos.filter((n) => !students.some((s) => s.admissionNo === n))
      if (missing.length) return { error: `No student with admission no. ${missing.join(', ')}`, fieldErrors: {} }
      studentIds = students.map((s) => s.id)
    }
    const local = text(fd, 'occurredAt')
    await reportIncident(
      ctx,
      {
        labId,
        // datetime-local carries no zone; the school works in IST.
        occurredAt: local ? `${local}:00+05:30` : '',
        type: text(fd, 'type'),
        severity: text(fd, 'severity'),
        description: text(fd, 'description'),
        studentIds,
        firstAidGiven: fd.get('firstAidGiven') === 'on',
        parentInformed: fd.get('parentInformed') === 'on',
        actionTaken: text(fd, 'actionTaken'),
      },
      files(fd, 'photos'),
    )
    revalidatePath(`/labs/${labId}`, 'layout')
    return done('Incident reported. The principal has been alerted.')
  } catch (error) {
    return fail(error, 'Could not report the incident')
  }
}

export async function closeIncidentAction(labId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.safety')
  try {
    await closeIncident(ctx, {
      incidentId: text(fd, 'incidentId'),
      actionTaken: text(fd, 'actionTaken'),
      parentInformed: fd.get('parentInformed') === 'on',
    })
    revalidatePath(`/labs/${labId}`, 'layout')
    return done('Incident closed')
  } catch (error) {
    return fail(error, 'Could not close the incident')
  }
}

export async function wasteAction(labId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireContext('labs.safety')
  try {
    await logWaste(ctx, {
      labId,
      disposedOn: text(fd, 'disposedOn'),
      category: text(fd, 'category'),
      quantity: text(fd, 'quantity'),
      unit: text(fd, 'unit'),
      handedTo: text(fd, 'handedTo'),
      notes: text(fd, 'notes'),
    })
    revalidatePath(`/labs/${labId}`, 'layout')
    return done('Disposal logged')
  } catch (error) {
    return fail(error, 'Could not log the disposal')
  }
}

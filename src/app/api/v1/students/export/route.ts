import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { audit } from '@/server/audit'
import { csvResponse } from '@/lib/csv'
import { toDateInput } from '@/lib/dates'
import { exportStudents } from '@/server/modules/students/service'
import { studentListFilterSchema } from '@/server/modules/students/schema'

const day = (d: Date | null | undefined) => (d ? toDateInput(d) : '')
const label = (v: string | null | undefined) => (v ? v.charAt(0) + v.slice(1).toLowerCase().replaceAll('_', ' ') : '')

/** GET /api/v1/students/export: full student details with the student list filters (class, section, status …). */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const p = req.nextUrl.searchParams
    const filter = studentListFilterSchema.parse({
      classLevelId: p.get('classLevelId') || undefined,
      sectionId: p.get('sectionId') || undefined,
      status: p.get('status') || undefined,
      gender: p.get('gender') || undefined,
      hasDues: p.get('hasDues') || undefined,
    })
    const q = p.get('q')?.trim() || undefined
    const students = await exportStudents(ctx, q, filter)
    const withFees = ctx.can('fees.view')

    const guardianCols = ['Name', 'Phone', 'Alternate phone', 'Email', 'Occupation', 'Annual income']
    const headers = [
      'Admission no', 'First name', 'Last name', 'Class', 'Section', 'Roll no', 'Session', 'Status',
      'Gender', 'Date of birth', 'Blood group', 'Nationality', 'Religion', 'Category', 'Caste', 'Mother tongue',
      'Aadhaar no', 'Birth place', 'Identification mark', 'Disability', 'House', 'WhatsApp',
      'Admission date', 'Joined class on', 'Previous school',
      'Address line 1', 'Address line 2', 'City', 'State', 'PIN code',
      ...guardianCols.map((c) => `Father ${c.toLowerCase()}`),
      ...guardianCols.map((c) => `Mother ${c.toLowerCase()}`),
      'Primary contact', 'Primary contact relation', 'Primary contact phone', 'Other guardians',
      'Emergency contact', 'Emergency phone', 'Medical notes', 'Allergies',
      'Transport route', 'Transport stop', 'Transport direction',
      ...(withFees ? ['Fee due (Rs)'] : []),
    ]

    const rows = students.map((s) => {
      const e = s.enrollments[0]
      const father = s.guardians.find((g) => g.relation === 'FATHER')
      const mother = s.guardians.find((g) => g.relation === 'MOTHER')
      const primary = s.guardians.find((g) => g.isPrimary) ?? s.guardians[0]
      const others = s.guardians.filter((g) => g !== father && g !== mother && g !== primary)
      const name = (g?: (typeof s.guardians)[number]) => (g ? `${g.parent.firstName} ${g.parent.lastName}`.trim() : '')
      const guardian = (g?: (typeof s.guardians)[number]) => [
        name(g),
        g?.parent.phone ?? '',
        g?.parent.secondaryPhone ?? '',
        g?.parent.email ?? '',
        g?.parent.occupation ?? '',
        g?.parent.annualIncome ?? '',
      ]
      const t = s.transport[0]
      return [
        s.admissionNo, s.firstName, s.lastName, e?.classLevel.name ?? '', e?.section.name ?? '', e?.rollNumber ?? '',
        e?.session.name ?? '', label(s.status),
        label(s.gender), day(s.dateOfBirth), s.bloodGroup ?? '', s.nationality ?? '', s.religion ?? '', s.category ?? '',
        s.caste ?? '', s.motherTongue ?? '',
        s.aadhaarNo ?? '', s.birthPlace ?? '', s.identificationMark ?? '', s.disability ?? '', s.house ?? '', s.whatsappPhone ?? '',
        day(s.admissionDate), day(e?.joinedOn), s.previousSchool ?? '',
        s.addressLine1 ?? '', s.addressLine2 ?? '', s.city ?? '', s.state ?? '', s.postalCode ?? '',
        ...guardian(father),
        ...guardian(mother),
        name(primary), label(primary?.relation), primary?.parent.phone ?? '',
        others.map((g) => `${name(g)} (${label(g.relation)}${g.parent.phone ? `, ${g.parent.phone}` : ''})`).join('; '),
        s.emergencyContactName ?? '', s.emergencyContactPhone ?? '', s.medicalNotes ?? '', s.allergies ?? '',
        t?.route.name ?? '', t?.stop.name ?? '', t ? label(t.direction) : '',
        ...(withFees ? [(s.invoices.reduce((sum, i) => sum + i.balanceMinor, 0) / 100).toFixed(2)] : []),
      ]
    })

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
      action: 'students.export',
      module: 'students',
      entityType: 'Student',
      summary: `Exported ${rows.length} student${rows.length === 1 ? '' : 's'} with full details`,
      after: { filter, q: q ?? null },
    })

    const first = students[0]?.enrollments[0]
    const scopeName = first && (filter.sectionId || filter.classLevelId)
      ? [first.classLevel.name, filter.sectionId ? first.section.name : null].filter(Boolean).join('-')
      : 'all'
    return csvResponse(`students-${scopeName}-${toDateInput(new Date())}.csv`, headers, rows)
  },
  { permission: 'students.export' },
)

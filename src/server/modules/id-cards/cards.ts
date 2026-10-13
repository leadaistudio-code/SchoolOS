import QRCode from 'qrcode'
import type { AppContext } from '@/server/context'
import { resolveBrandingAssetUrl } from '@/server/branding-assets'
import { getStudentIdCards } from '@/server/modules/students/id-cards'
import { formatDay } from '@/lib/dates'
import type { IdCardPerson, IdCardSchool } from '@/components/id-card/id-card'

async function qr(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, { margin: 0, width: 180, errorCorrectionLevel: 'M' })
  } catch {
    return null
  }
}

async function schoolBlock(ctx: AppContext, validity: string): Promise<IdCardSchool> {
  const school = await ctx.db.school.findFirst({
    where: { tenantId: ctx.tenant.id },
    select: {
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      email: true,
      website: true,
      branding: { select: { logoUrl: true, signatureUrl: true } },
    },
  })
  return {
    name: school?.name ?? ctx.tenant.school?.name ?? ctx.tenant.name,
    address: school
      ? [school.addressLine1, school.addressLine2, [school.city, school.state, school.postalCode].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', ')
      : '',
    phone: school?.phone ?? null,
    email: school?.email ?? null,
    website: school?.website ?? null,
    logoUrl: resolveBrandingAssetUrl(school?.branding?.logoUrl, 'logo'),
    signatureUrl: resolveBrandingAssetUrl(school?.branding?.signatureUrl, 'signature'),
    validity,
  }
}

/** Everything a card can print; the design settings choose which rows show. */
export type IdCardSource = Omit<IdCardPerson, 'rows'> & { values: Record<string, string> }

const day = (d: Date | null | undefined) => (d ? formatDay(d, 'dd MMM yyyy') : '')

/** Student cards for a class (and optional section) in the current session. */
export async function buildStudentCards(
  ctx: AppContext,
  classLevelId: string,
  sectionId?: string,
) {
  const data = await getStudentIdCards(ctx, classLevelId, sectionId)
  const school = await schoolBlock(ctx, `Valid till ${formatDay(data.setup.session.endsOn, 'MMM yyyy')}`)

  const people: IdCardSource[] = await Promise.all(
    data.cards.map(async (s) => {
      const name = `${s.firstName} ${s.lastName}`.trim()
      const guardian = s.guardian ? `${s.guardian.firstName} ${s.guardian.lastName}`.trim() : ''
      const phone = s.emergencyContactPhone ?? s.guardian?.phone ?? ''
      return {
        id: s.id,
        name,
        photoUrl: s.photoUrl,
        idLabel: 'Adm. no.',
        idValue: s.admissionNo,
        badge: 'Student',
        values: {
          class: `${s.className} - ${s.sectionName}`,
          roll: s.rollNumber ? String(s.rollNumber) : '',
          dob: day(s.dateOfBirth),
          blood: s.bloodGroup ?? '',
          guardian,
          phone,
          address: [s.addressLine1, s.city].filter(Boolean).join(', '),
        },
        qr: await qr(`${school.name}\nStudent: ${name}\nAdm. no.: ${s.admissionNo}\nClass: ${s.className} ${s.sectionName}${phone ? `\nContact: ${phone}` : ''}`),
        emergency: phone || school.phone,
        bloodGroup: s.bloodGroup,
      }
    }),
  )

  return { ...data, school, people }
}

export async function staffIdCardFilters(ctx: AppContext) {
  ctx.require('staff.id_cards')
  const rows = await ctx.db.staff.findMany({
    where: { deletedAt: null, leftOn: null },
    select: { department: true, staffType: true },
  })
  const departments = [...new Set(rows.map((r) => r.department).filter((d): d is string => !!d))].sort()
  const types = [...new Set(rows.map((r) => r.staffType))].sort()
  return { departments, types, total: rows.length }
}

export async function buildStaffCards(
  ctx: AppContext,
  filter: { department?: string; staffType?: string; q?: string },
) {
  ctx.require('staff.id_cards')
  const q = filter.q?.trim()
  const staff = await ctx.db.staff.findMany({
    where: {
      deletedAt: null,
      leftOn: null,
      ...(filter.department ? { department: filter.department } : {}),
      ...(filter.staffType ? { staffType: filter.staffType as never } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { lastName: { contains: q, mode: 'insensitive' as const } },
              { employeeCode: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ staffType: 'asc' }, { firstName: 'asc' }],
    take: 300,
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      staffType: true,
      designation: true,
      department: true,
      phone: true,
      email: true,
      dateOfBirth: true,
      joinedOn: true,
      addressLine1: true,
      city: true,
    },
  })

  const now = new Date()
  const fyEnd = new Date(Date.UTC(now.getUTCMonth() >= 3 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(), 2, 31))
  const school = await schoolBlock(ctx, `Valid till ${formatDay(fyEnd, 'MMM yyyy')}`)

  const people: IdCardSource[] = await Promise.all(
    staff.map(async (s) => {
      const name = `${s.firstName} ${s.lastName}`.trim()
      return {
        id: s.id,
        name,
        photoUrl: s.photoUrl,
        idLabel: 'Emp. code',
        idValue: s.employeeCode,
        badge: s.staffType === 'TEACHING' ? 'Teacher' : 'Staff',
        values: {
          designation: s.designation ?? '',
          department: s.department ?? '',
          phone: s.phone ?? '',
          email: s.email ?? '',
          dob: day(s.dateOfBirth),
          joined: day(s.joinedOn),
          address: [s.addressLine1, s.city].filter(Boolean).join(', '),
        },
        qr: await qr(`${school.name}\nStaff: ${name}\nEmp. code: ${s.employeeCode}${s.designation ? `\n${s.designation}` : ''}${s.phone ? `\nPhone: ${s.phone}` : ''}`),
        emergency: s.phone ?? school.phone,
        bloodGroup: null,
      }
    }),
  )

  return { school, people }
}

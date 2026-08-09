import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { studentScopeWhere } from '@/server/scope'

type Hit = { id: string; type: string; title: string; subtitle?: string; href: string }

/**
 * Global search.
 *
 * Each source is queried only if the caller holds the matching permission and
 * is narrowed by the same row-level scope as its module, so search can never
 * become a side channel around authorization.
 */
export const GET = route(async (req: NextRequest, ctx) => {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return ok([])

  const hits: Hit[] = []
  const like = { contains: q, mode: 'insensitive' as const }

  if (ctx.can('students.view')) {
    const scope = await studentScopeWhere(ctx)
    const students = await ctx.db.student.findMany({
      where: {
        deletedAt: null,
        ...scope,
        OR: [{ firstName: like }, { lastName: like }, { admissionNo: like }],
      },
      take: 6,
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
    hits.push(
      ...students.map((s) => ({
        id: s.id,
        type: 'Student',
        title: `${s.firstName} ${s.lastName}`,
        subtitle: [
          s.admissionNo,
          s.enrollments[0]
            ? `${s.enrollments[0].classLevel.name} ${s.enrollments[0].section.name}`
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/students/${s.id}`,
      })),
    )
  }

  if (ctx.can('staff.view')) {
    const staff = await ctx.db.staff.findMany({
      where: {
        deletedAt: null,
        OR: [{ firstName: like }, { lastName: like }, { employeeCode: like }],
      },
      take: 4,
      select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true },
    })
    hits.push(
      ...staff.map((s) => ({
        id: s.id,
        type: 'Staff',
        title: `${s.firstName} ${s.lastName}`,
        subtitle: [s.employeeCode, s.designation].filter(Boolean).join(' · '),
        href: `/staff/${s.id}`,
      })),
    )
  }

  if (ctx.can('parents.view')) {
    const parents = await ctx.db.parent.findMany({
      where: { deletedAt: null, OR: [{ firstName: like }, { lastName: like }, { phone: { contains: q } }] },
      take: 4,
      select: { id: true, firstName: true, lastName: true, phone: true },
    })
    hits.push(
      ...parents.map((p) => ({
        id: p.id,
        type: 'Parent',
        title: `${p.firstName} ${p.lastName}`,
        subtitle: p.phone ?? undefined,
        href: `/parents/${p.id}`,
      })),
    )
  }

  if (ctx.can('fees.view')) {
    const invoices = await ctx.db.feeInvoice.findMany({
      where: { OR: [{ number: like }, { title: like }] },
      take: 4,
      select: {
        id: true,
        number: true,
        title: true,
        student: { select: { firstName: true, lastName: true } },
      },
    })
    hits.push(
      ...invoices.map((i) => ({
        id: i.id,
        type: 'Invoice',
        title: i.number,
        subtitle: `${i.title} · ${i.student.firstName} ${i.student.lastName}`,
        href: `/finance/invoices/${i.id}`,
      })),
    )
  }

  if (ctx.can('notices.view')) {
    const notices = await ctx.db.notice.findMany({
      where: { deletedAt: null, isPublished: true, title: like },
      take: 3,
      select: { id: true, title: true },
    })
    hits.push(
      ...notices.map((n) => ({
        id: n.id,
        type: 'Notice',
        title: n.title,
        href: `/communication/notices/${n.id}`,
      })),
    )
  }

  return ok(hits)
})

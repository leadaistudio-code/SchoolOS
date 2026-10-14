import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { getEntitlements } from '@/server/entitlements'
import { NAVIGATION, visibleNavigation, type NavItem } from '@/lib/navigation'
import { isPortalOnlyRole, studentScopeWhere } from '@/server/scope'
import { accountingEnvSwitches, getAccountingFlags } from '@/server/modules/accounting/service'

export type SearchHit = { id: string; type: string; title: string; subtitle?: string; href: string }

/**
 * Words people actually type for a screen, beyond its sidebar label. Matched
 * against the visible navigation only, so a page never appears in search for
 * someone who cannot open it.
 */
const PAGE_KEYWORDS: Record<string, string[]> = {
  '/finance/collect': ['collect fee', 'take payment', 'receive fee', 'fee counter', 'cash'],
  '/finance/payments': ['receipt', 'payments', 'transactions', 'cheque'],
  '/finance/dues': ['dues', 'outstanding', 'defaulters', 'pending fee', 'balance'],
  '/finance/structures': ['fee head', 'fee structure', 'fee plan', 'fee setup', 'billing period'],
  '/finance/invoices': ['invoice', 'bill', 'generate fees'],
  '/finance/concessions': ['concession', 'discount', 'scholarship', 'waiver'],
  '/finance/expenses': ['expense', 'spend', 'vendor bill'],
  '/finance/reports': ['fee report', 'collection report'],
  '/students/new': ['admission', 'new student', 'enrol', 'enroll', 'register student'],
  '/students/transfer-certificates': ['tc', 'transfer certificate', 'leaving certificate', 'slc'],
  '/students/id-cards': ['id card', 'identity card', 'student card'],
  '/staff/id-cards': ['staff id card', 'teacher id card'],
  '/students/promotion': ['promote', 'promotion', 'next class'],
  '/attendance': ['attendance', 'present', 'absent', 'roll call'],
  '/exams/grades': ['grading', 'grade scale', 'marks system', 'gpa', 'cgpa', 'marking scheme'],
  '/exams/marks': ['marks', 'marks entry', 'marks register', 'result entry'],
  '/exams/results': ['results', 'rank', 'merit list'],
  '/exams/report-cards': ['report card', 'marksheet', 'progress report'],
  '/exams/admit-cards': ['admit card', 'hall ticket', 'roll number slip'],
  '/exams/new': ['new exam', 'create exam', 'schedule exam'],
  '/academics/timetable': ['timetable', 'time table', 'periods', 'schedule'],
  '/academics/homework': ['homework', 'assignment'],
  '/academics/classes': ['class', 'section', 'classes'],
  '/academics/subjects': ['subject', 'subjects'],
  '/academics/calendar': ['holiday', 'calendar', 'events calendar'],
  '/communication/notices': ['notice', 'circular', 'announcement'],
  '/messages': ['message', 'chat', 'sms', 'whatsapp'],
  '/library': ['library', 'book', 'issue book'],
  '/transport': ['transport', 'bus', 'van', 'route'],
  '/inventory/store': ['store', 'uniform', 'stationery', 'books sale', 'pos'],
  '/inventory': ['asset', 'inventory', 'stock'],
  '/front-office': ['visitor', 'gate pass', 'front desk', 'reception'],
  '/admissions': ['enquiry', 'enquiries', 'lead', 'admission enquiry'],
  '/staff/payroll': ['salary', 'payroll', 'payslip'],
  '/staff/approvals': ['leave approval', 'approvals'],
  '/accounts': ['ledger', 'journal', 'trial balance', 'balance sheet', 'profit and loss', 'accounts'],
  '/settings': ['settings', 'configuration', 'school profile', 'logo'],
  '/settings/roles': ['roles', 'permissions', 'access'],
  '/account/profile': ['my profile', 'change password', 'my account'],
}

function flattenWithTrail(items: NavItem[], trail: string[] = []): Array<{ item: NavItem; trail: string[] }> {
  return items.flatMap((item) => [
    { item, trail },
    ...(item.children ? flattenWithTrail(item.children, [...trail, item.label]) : []),
  ])
}

/** Pages and features the user can open, best match first. */
export function pageHits(visible: NavItem[], q: string, limit = 6): SearchHit[] {
  const needle = q.trim().toLowerCase()
  if (needle.length < 2) return []
  const seen = new Set<string>()
  const scored: Array<{ hit: SearchHit; score: number }> = []
  for (const { item, trail } of flattenWithTrail(visible)) {
    if (item.soon || seen.has(item.href)) continue
    const label = item.label.toLowerCase()
    const keywords = PAGE_KEYWORDS[item.href] ?? []
    const words = label.split(/[\s/&·-]+/)
    let score = 0
    if (label === needle) score = 100
    else if (label.startsWith(needle)) score = 80
    else if (words.some((w) => w.startsWith(needle))) score = 70
    else if (keywords.some((k) => k === needle)) score = 65
    else if (keywords.some((k) => k.startsWith(needle) || k.split(' ').some((w) => w.startsWith(needle)))) score = 55
    else if (label.includes(needle)) score = 45
    else if (keywords.some((k) => k.includes(needle))) score = 35
    else if (trail.some((t) => t.toLowerCase().startsWith(needle))) score = 20
    if (!score) continue
    seen.add(item.href)
    scored.push({
      score: score - trail.length,
      hit: { id: item.href, type: 'Pages', title: item.label, subtitle: trail.length ? trail.join(' › ') : 'Open page', href: item.href },
    })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.hit)
}

/** Splits "rahul sharma 8B" into up to four tokens that must each match some field. */
export function searchTokens(q: string) {
  return q.trim().split(/\s+/).filter((t) => t.length > 0).slice(0, 4)
}

const like = (value: string) => ({ contains: value, mode: 'insensitive' as const })

const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim()

export async function globalSearch(ctx: AppContext, q: string): Promise<SearchHit[]> {
  const query = q.trim().slice(0, 80)
  if (query.length < 2) return []
  const tokens = searchTokens(query)
  const [entitlements, accountingFlags] = await Promise.all([getEntitlements(ctx.tenant.id), getAccountingFlags(ctx.db)])
  const visible = visibleNavigation(NAVIGATION, {
    can: ctx.can,
    hasFeature: (feature) => entitlements[feature]?.enabled ?? false,
    isPortal: isPortalOnlyRole(ctx.user.roleKeys),
    accounting: {
      module: accountingFlags.module,
      whatsapp: accountingFlags.module && accountingEnvSwitches().whatsappReceipts,
    },
  })
  const hrefs = new Set(flattenWithTrail(visible).map(({ item }) => item.href))
  // A data source is searched only when its module is both permitted and on the school's plan.
  const open = (href: string, permission: string) => ctx.can(permission) && [...hrefs].some((h) => h === href || h.startsWith(`${href}/`))

  const tasks: Array<Promise<SearchHit[]>> = []

  if (ctx.can('students.view')) {
    tasks.push(
      (async () => {
        const scope = await studentScopeWhere(ctx)
        const perToken = tokens.map(
          (t): Prisma.StudentWhereInput => ({
            OR: [
              { firstName: like(t) },
              { lastName: like(t) },
              { admissionNo: like(t) },
              { aadhaarNo: { contains: t } },
              { whatsappPhone: { contains: t } },
              { guardians: { some: { parent: { OR: [{ firstName: like(t) }, { lastName: like(t) }, { phone: { contains: t } }] } } } },
            ],
          }),
        )
        const students = await ctx.db.student.findMany({
          where: { deletedAt: null, ...scope, AND: perToken },
          take: 6,
          orderBy: [{ status: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
            status: true,
            enrollments: {
              where: { isCurrent: true },
              take: 1,
              select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
            },
          },
        })
        return students.map((s) => ({
          id: s.id,
          type: 'Students',
          title: name(s),
          subtitle: [
            s.admissionNo,
            s.enrollments[0] ? `${s.enrollments[0].classLevel.name} ${s.enrollments[0].section.name}` : null,
            s.status !== 'ACTIVE' ? s.status.toLowerCase() : null,
          ].filter(Boolean).join(' · '),
          href: `/students/${s.id}`,
        }))
      })(),
    )
  }

  if (ctx.can('staff.view')) {
    tasks.push(
      ctx.db.staff
        .findMany({
          where: {
            deletedAt: null,
            AND: tokens.map((t) => ({
              OR: [{ firstName: like(t) }, { lastName: like(t) }, { employeeCode: like(t) }, { designation: like(t) }, { department: like(t) }, { phone: { contains: t } }, { email: like(t) }],
            })),
          },
          take: 5,
          select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true },
        })
        .then((rows) => rows.map((s) => ({ id: s.id, type: 'Staff', title: name(s), subtitle: [s.employeeCode, s.designation].filter(Boolean).join(' · '), href: `/staff/${s.id}` }))),
    )
  }

  if (ctx.can('parents.view')) {
    tasks.push(
      ctx.db.parent
        .findMany({
          where: { deletedAt: null, AND: tokens.map((t) => ({ OR: [{ firstName: like(t) }, { lastName: like(t) }, { phone: { contains: t } }, { email: like(t) }] })) },
          take: 4,
          select: { id: true, firstName: true, lastName: true, phone: true },
        })
        .then((rows) => rows.map((p) => ({ id: p.id, type: 'Parents', title: name(p), subtitle: p.phone ?? undefined, href: `/parents/${p.id}` }))),
    )
  }

  if (ctx.can('fees.view')) {
    tasks.push(
      ctx.db.feeInvoice
        .findMany({
          where: { OR: [{ number: like(query) }, { title: like(query) }] },
          take: 4,
          orderBy: { issuedOn: 'desc' },
          select: { id: true, number: true, title: true, student: { select: { firstName: true, lastName: true } } },
        })
        .then((rows) => rows.map((i) => ({ id: i.id, type: 'Invoices', title: i.number, subtitle: `${i.title} · ${name(i.student)}`, href: `/finance/invoices/${i.id}` }))),
      ctx.db.feeReceipt
        .findMany({
          where: { OR: [{ number: like(query) }, { payment: { OR: [{ reference: like(query) }, { billBookNo: like(query) }] } }] },
          take: 4,
          orderBy: { issuedOn: 'desc' },
          select: { id: true, number: true, paymentId: true, payment: { select: { amountMinor: true, student: { select: { firstName: true, lastName: true } } } } },
        })
        .then((rows) =>
          rows.map((r) => ({
            id: r.id,
            type: 'Receipts',
            title: r.number,
            subtitle: `₹${(r.payment.amountMinor / 100).toLocaleString('en-IN')} · ${name(r.payment.student)}`,
            href: `/finance/payments/${r.paymentId}`,
          })),
        ),
    )
  }

  if (ctx.can('exams.view')) {
    tasks.push(
      ctx.db.exam
        .findMany({ where: { name: like(query) }, take: 4, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, status: true, session: { select: { name: true } } } })
        .then((rows) => rows.map((e) => ({ id: e.id, type: 'Exams', title: e.name, subtitle: `${e.session.name} · ${e.status.toLowerCase().replace('_', ' ')}`, href: `/exams/${e.id}` }))),
    )
  }

  if (open('/academics', 'academics.view')) {
    tasks.push(
      ctx.db.classLevel
        .findMany({ where: { deletedAt: null, session: { isCurrent: true }, name: like(query) }, take: 4, orderBy: { numeric: 'asc' }, select: { id: true, name: true, _count: { select: { sections: true } } } })
        .then((rows) => rows.map((c) => ({ id: c.id, type: 'Classes', title: c.name, subtitle: `${c._count.sections} section${c._count.sections === 1 ? '' : 's'}`, href: '/academics/classes' }))),
      ctx.db.subject
        .findMany({ where: { deletedAt: null, OR: [{ name: like(query) }, { code: like(query) }] }, take: 4, select: { id: true, name: true, code: true } })
        .then((rows) => rows.map((s) => ({ id: s.id, type: 'Subjects', title: s.name, subtitle: s.code, href: '/academics/subjects' }))),
    )
  }

  if (open('/academics/homework', 'homework.view')) {
    tasks.push(
      ctx.db.homework
        .findMany({ where: { deletedAt: null, title: like(query) }, take: 3, orderBy: { dueOn: 'desc' }, select: { id: true, title: true, classLevel: { select: { name: true } } } })
        .then((rows) => rows.map((h) => ({ id: h.id, type: 'Homework', title: h.title, subtitle: h.classLevel.name, href: `/academics/homework/${h.id}` }))),
    )
  }

  if (open('/students/transfer-certificates', 'students.tc')) {
    tasks.push(
      ctx.db.transferCertificate
        .findMany({
          where: { OR: [{ number: like(query) }, { student: { OR: [{ firstName: like(query) }, { lastName: like(query) }, { admissionNo: like(query) }] } }] },
          take: 3,
          orderBy: { issuedOn: 'desc' },
          select: { id: true, number: true, status: true, student: { select: { firstName: true, lastName: true } } },
        })
        .then((rows) => rows.map((t) => ({ id: t.id, type: 'Transfer certificates', title: t.number, subtitle: `${name(t.student)}${t.status === 'CANCELLED' ? ' · cancelled' : ''}`, href: `/students/transfer-certificates/${t.id}` }))),
    )
  }

  if (open('/finance/expenses', 'expenses.view')) {
    tasks.push(
      ctx.db.schoolExpense
        .findMany({ where: { deletedAt: null, OR: [{ title: like(query) }, { vendor: like(query) }, { referenceNo: like(query) }] }, take: 3, orderBy: { expenseDate: 'desc' }, select: { id: true, title: true, vendor: true, amountMinor: true } })
        .then((rows) => rows.map((e) => ({ id: e.id, type: 'Expenses', title: e.title, subtitle: [`₹${(e.amountMinor / 100).toLocaleString('en-IN')}`, e.vendor].filter(Boolean).join(' · '), href: `/finance/expenses?q=${encodeURIComponent(e.title)}` }))),
    )
  }

  if (open('/admissions', 'admissions.view')) {
    tasks.push(
      ctx.db.admissionLead
        .findMany({ where: { deletedAt: null, OR: [{ studentName: like(query) }, { parentName: like(query) }, { phone: { contains: query } }, { reference: like(query) }] }, take: 4, orderBy: { createdAt: 'desc' }, select: { id: true, studentName: true, parentName: true, phone: true } })
        .then((rows) => rows.map((l) => ({ id: l.id, type: 'Admission enquiries', title: l.studentName, subtitle: `${l.parentName} · ${l.phone}`, href: `/admissions/${l.id}` }))),
    )
  }

  if (open('/library', 'library.view')) {
    tasks.push(
      ctx.db.book
        .findMany({ where: { deletedAt: null, OR: [{ title: like(query) }, { author: like(query) }, { isbn: { contains: query } }] }, take: 4, select: { id: true, title: true, author: true, availableCopies: true, totalCopies: true } })
        .then((rows) => rows.map((b) => ({ id: b.id, type: 'Library books', title: b.title, subtitle: [b.author, `${b.availableCopies}/${b.totalCopies} available`].filter(Boolean).join(' · '), href: `/library?q=${encodeURIComponent(b.title)}` }))),
    )
  }

  if (open('/inventory/store', 'store.view')) {
    tasks.push(
      ctx.db.storeItem
        .findMany({ where: { OR: [{ name: like(query) }, { sku: like(query) }, { barcode: { contains: query } }, { variant: like(query) }] }, take: 4, select: { id: true, name: true, variant: true, sku: true, quantity: true } })
        .then((rows) => rows.map((i) => ({ id: i.id, type: 'Store items', title: [i.name, i.variant].filter(Boolean).join(' — '), subtitle: `${i.sku} · ${i.quantity} in stock`, href: `/inventory/store/items?q=${encodeURIComponent(i.sku)}` }))),
    )
  }

  if (open('/inventory', 'inventory.view')) {
    tasks.push(
      ctx.db.asset
        .findMany({ where: { deletedAt: null, OR: [{ name: like(query) }, { assetCode: like(query) }, { location: like(query) }] }, take: 3, select: { id: true, name: true, assetCode: true, location: true } })
        .then((rows) => rows.map((a) => ({ id: a.id, type: 'Assets', title: a.name, subtitle: [a.assetCode, a.location].filter(Boolean).join(' · '), href: `/inventory/${a.id}` }))),
    )
  }

  if (open('/transport', 'transport.view')) {
    tasks.push(
      ctx.db.bus
        .findMany({ where: { deletedAt: null, OR: [{ registrationNo: like(query) }, { code: like(query) }] }, take: 3, select: { id: true, code: true, registrationNo: true } })
        .then((rows) => rows.map((b) => ({ id: b.id, type: 'Transport', title: `Bus ${b.code}`, subtitle: b.registrationNo, href: `/transport/buses/${b.id}` }))),
      ctx.db.route
        .findMany({ where: { deletedAt: null, OR: [{ name: like(query) }, { code: like(query) }] }, take: 3, select: { id: true, name: true, code: true } })
        .then((rows) => rows.map((r) => ({ id: r.id, type: 'Transport', title: r.name, subtitle: `Route ${r.code}`, href: `/transport/routes/${r.id}` }))),
    )
  }

  if (open('/front-office', 'frontoffice.view')) {
    tasks.push(
      ctx.db.visitor
        .findMany({ where: { OR: [{ name: like(query) }, { phone: { contains: query } }, { passNumber: like(query) }] }, take: 3, orderBy: { checkInAt: 'desc' }, select: { id: true, name: true, purpose: true, checkInAt: true } })
        .then((rows) => rows.map((v) => ({ id: v.id, type: 'Visitors', title: v.name, subtitle: `${v.purpose} · ${v.checkInAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`, href: `/front-office?q=${encodeURIComponent(v.name)}` }))),
    )
  }

  if (ctx.can('notices.view')) {
    tasks.push(
      ctx.db.notice
        .findMany({ where: { deletedAt: null, isPublished: true, title: like(query) }, take: 3, orderBy: { publishOn: 'desc' }, select: { id: true, title: true } })
        .then((rows) => rows.map((n) => ({ id: n.id, type: 'Notices', title: n.title, href: `/communication/notices/${n.id}` }))),
    )
  }

  if (open('/events', 'events.view')) {
    tasks.push(
      ctx.db.schoolEvent
        .findMany({ where: { deletedAt: null, title: like(query) }, take: 3, orderBy: { startsAt: 'desc' }, select: { id: true, title: true, venue: true } })
        .then((rows) => rows.map((e) => ({ id: e.id, type: 'Events', title: e.title, subtitle: e.venue ?? undefined, href: `/events/${e.id}` }))),
    )
  }

  // One failing source (a module mid-migration, say) must not blank the whole search.
  const settled = await Promise.allSettled(tasks)
  const records = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  return [...pageHits(visible, query), ...records]
}

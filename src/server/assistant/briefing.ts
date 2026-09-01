import { attendanceDate } from '@/lib/dates'
import { ROLE_BY_KEY } from '@/lib/rbac/roles'
import type { AppContext } from '@/server/context'

export type AssistantActionItem = {
  id: string
  label: string
  detail: string
  count: number
  href: string
  icon: string
  urgent: boolean
}

export type AssistantBriefing = {
  greeting: {
    roleTitle: string
    timeGreeting: string
    honorific: string | null
    firstName: string
    /** Full line read aloud when the panel opens. */
    spoken: string
    /** Primary headline in the welcome card. */
    headline: string
    /** Secondary line under the headline. */
    subline: string
  }
  actionItems: AssistantActionItem[]
  /** Suggested spoken questions derived from today's priorities. */
  followUpPrompts: string[]
  /** True when at least one urgent item needs attention. */
  hasUrgent: boolean
}

function timeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function honorific(gender: string | null | undefined): string | null {
  if (gender === 'MALE') return 'sir'
  if (gender === 'FEMALE') return 'ma\'am'
  return null
}

function roleTitle(roleKeys: string[]): string {
  const priority = ['PRINCIPAL', 'SCHOOL_ADMIN', 'ACCOUNTANT', 'TEACHER', 'FRONT_DESK', 'HR', 'LIBRARIAN']
  for (const key of priority) {
    if (roleKeys.includes(key)) {
      return ROLE_BY_KEY.get(key as never)?.name ?? key.replace(/_/g, ' ')
    }
  }
  const first = roleKeys[0]
  if (!first) return 'Admin'
  return ROLE_BY_KEY.get(first as never)?.name ?? first.replace(/_/g, ' ')
}

/** Natural spoken line for urgent items — one flowing sentence, not a list. */
function spokenUrgentLine(item: AssistantActionItem): string {
  switch (item.id) {
    case 'attendance-unmarked':
      return item.count === 1
        ? 'one student still is not marked'
        : `${item.count} students still are not marked`
    case 'admit-cards':
      return item.count === 1
        ? 'one admit card is waiting on you'
        : `${item.count} admit cards are waiting on you`
    case 'leave':
      return item.count === 1
        ? 'one leave request needs your approval'
        : `${item.count} leave requests need your approval`
    case 'fees-overdue':
      return item.count === 1
        ? 'one invoice is past due'
        : `${item.count} invoices are past due`
    case 'library':
      return item.count === 1
        ? 'one library book is overdue'
        : `${item.count} library books are overdue`
    case 'admissions':
      return item.count === 1
        ? 'one admission follow-up is due today'
        : `${item.count} admission follow-ups are due today`
    case 'teacher-fees':
      return item.count === 1
        ? 'one overdue invoice in your classes'
        : `${item.count} overdue invoices in your classes`
    default:
      return item.detail.toLowerCase()
  }
}

function composeGreeting(options: {
  time: string
  honor: string | null
  firstName: string
  urgentItems: AssistantActionItem[]
}): { spoken: string; headline: string; subline: string } {
  const { time, honor, firstName, urgentItems } = options
  const address = honor ?? firstName
  const headline = honor ? `${time}, ${honor}` : `${time}, ${firstName}`

  if (urgentItems.length === 0) {
    return {
      spoken: `${time} ${address}. You are all caught up for now. What should we look at?`,
      headline,
      subline: 'Nothing urgent on your plate right now.',
    }
  }

  const parts = urgentItems.slice(0, 2).map(spokenUrgentLine)
  let headsUp: string
  if (parts.length === 1) {
    headsUp = `Quick heads-up — ${parts[0]}.`
  } else {
    headsUp = `Quick heads-up — ${parts[0]}, and ${parts[1]}.`
  }

  return {
    spoken: `${time} ${address}. ${headsUp} What would you like to do first?`,
    headline,
    subline: 'Here is what needs your attention today.',
  }
}

function followUpPromptsFromItems(items: AssistantActionItem[]): string[] {
  const prompts: string[] = []
  for (const item of items) {
    if (!item.urgent || item.count === 0) continue
    switch (item.id) {
      case 'attendance-unmarked':
        prompts.push('Which classes still need attendance marked?')
        break
      case 'admit-cards':
        prompts.push('How many admit cards are pending approval?')
        break
      case 'leave':
        prompts.push('Who has leave waiting for approval?')
        break
      case 'fees-overdue':
        prompts.push('How much fee is overdue?')
        break
      case 'library':
        prompts.push('Which library books are overdue?')
        break
      case 'admissions':
        prompts.push('Which admission leads need a follow-up today?')
        break
      case 'teacher-fees':
        prompts.push('Show me overdue fees in my classes')
        break
    }
    if (prompts.length >= 2) break
  }
  if (prompts.length === 0) {
    prompts.push('What is today\'s attendance?', 'How much fee came in today?')
  }
  return prompts.slice(0, 2)
}

/**
 * Role-aware greeting and the three most important things to do today.
 *
 * Counts are permission-gated the same way the dashboard is: a teacher never
 * sees school-wide fee totals they cannot open, and a principal sees approvals
 * a teacher cannot action.
 */
export async function getAssistantBriefing(ctx: AppContext): Promise<AssistantBriefing> {
  const today = attendanceDate(new Date())
  const now = new Date()
  const hour = now.getHours()
  const time = timeGreeting(hour)

  const [staffGender, attendanceToday, studentCount] = await Promise.all([
    ctx.db.staff.findFirst({
      where: { userId: ctx.user.userId },
      select: { gender: true },
    }),
    ctx.can('attendance.view') || ctx.can('dashboard.view')
      ? ctx.db.studentAttendance.groupBy({
          by: ['status'],
          where: { onDate: today },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    ctx.can('students.view')
      ? ctx.db.student.count({ where: { status: 'ACTIVE', deletedAt: null } })
      : Promise.resolve(0),
  ])

  const title = roleTitle(ctx.user.roleKeys)
  const honor = honorific(staffGender?.gender)
  const firstName = ctx.user.firstName

  const attendanceMap = Object.fromEntries(
    attendanceToday.map((row) => [row.status, row._count._all]),
  ) as Record<string, number | undefined>
  const marked =
    (attendanceMap.PRESENT ?? 0) +
    (attendanceMap.ABSENT ?? 0) +
    (attendanceMap.LATE ?? 0) +
    (attendanceMap.HALF_DAY ?? 0) +
    (attendanceMap.LEAVE ?? 0)
  const unmarked = Math.max(0, studentCount - marked)

  type Candidate = AssistantActionItem & { priority: number }

  const candidates: Candidate[] = []

  if (ctx.can('attendance.mark') && studentCount > 0) {
    candidates.push({
      id: 'attendance-unmarked',
      label: 'Mark attendance',
      detail:
        unmarked > 0
          ? `${unmarked} student${unmarked === 1 ? '' : 's'} not marked yet`
          : 'Today\'s register is complete',
      count: unmarked,
      href: '/attendance',
      icon: 'CalendarCheck',
      urgent: unmarked > 0,
      priority: 100,
    })
  }

  if (ctx.can('exams.admit_approve')) {
    const pendingAdmits = await ctx.db.admitCard.count({ where: { status: 'PENDING' } })
    candidates.push({
      id: 'admit-cards',
      label: 'Admit cards to approve',
      detail:
        pendingAdmits > 0
          ? `${pendingAdmits} waiting for your approval`
          : 'No admit cards waiting',
      count: pendingAdmits,
      href: '/exams',
      icon: 'FileCheck',
      urgent: pendingAdmits > 0,
      priority: 95,
    })
  }

  if (ctx.can('leave.approve')) {
    const pendingLeave = await ctx.db.leaveRequest.count({ where: { status: 'PENDING' } })
    candidates.push({
      id: 'leave',
      label: 'Leave requests',
      detail:
        pendingLeave > 0
          ? `${pendingLeave} request${pendingLeave === 1 ? '' : 's'} need approval`
          : 'No leave requests pending',
      count: pendingLeave,
      href: '/leave',
      icon: 'CalendarOff',
      urgent: pendingLeave > 0,
      priority: 90,
    })
  }

  if (ctx.can('fees.view')) {
    const overdueInvoices = await ctx.db.feeInvoice.count({
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
        dueOn: { lt: today },
      },
    })
    candidates.push({
      id: 'fees-overdue',
      label: 'Overdue invoices',
      detail:
        overdueInvoices > 0
          ? `${overdueInvoices} invoice${overdueInvoices === 1 ? '' : 's'} past due`
          : 'Fee collection is on track',
      count: overdueInvoices,
      href: '/finance/outstanding',
      icon: 'ReceiptText',
      urgent: overdueInvoices > 0,
      priority: 85,
    })
  }

  if (ctx.can('library.view')) {
    const libraryOverdue = await ctx.db.libraryLoan.count({
      where: { status: { in: ['ISSUED', 'OVERDUE'] }, dueOn: { lt: today } },
    })
    candidates.push({
      id: 'library',
      label: 'Library books overdue',
      detail:
        libraryOverdue > 0
          ? `${libraryOverdue} book${libraryOverdue === 1 ? '' : 's'} to follow up`
          : 'No overdue loans',
      count: libraryOverdue,
      href: '/library/loans',
      icon: 'Library',
      urgent: libraryOverdue > 0,
      priority: 70,
    })
  }

  if (ctx.can('admissions.view')) {
    const followUpsDue = await ctx.db.admissionLead.count({
      where: {
        deletedAt: null,
        convertedStudentId: null,
        nextFollowUpOn: { lte: today },
        stage: { notIn: ['LOST', 'ENROLLED'] },
      },
    })
    candidates.push({
      id: 'admissions',
      label: 'Admission follow-ups',
      detail:
        followUpsDue > 0
          ? `${followUpsDue} lead${followUpsDue === 1 ? '' : 's'} due today`
          : 'No follow-ups due today',
      count: followUpsDue,
      href: '/admissions/followups',
      icon: 'UserPlus',
      urgent: followUpsDue > 0,
      priority: 75,
    })
  }

  if (ctx.can('fees.collect')) {
    candidates.push({
      id: 'collect-fee',
      label: 'Collect a fee',
      detail: 'Record a payment against an invoice',
      count: 0,
      href: '/finance/collect',
      icon: 'BadgeIndianRupee',
      urgent: false,
      priority: 40,
    })
  }

  if (ctx.can('notices.manage')) {
    candidates.push({
      id: 'notice',
      label: 'Publish a notice',
      detail: 'Send an update to staff or parents',
      count: 0,
      href: '/communication/notices/new',
      icon: 'Megaphone',
      urgent: false,
      priority: 35,
    })
  }

  if (ctx.can('homework.manage')) {
    candidates.push({
      id: 'homework',
      label: 'Set homework',
      detail: 'Assign work to a class',
      count: 0,
      href: '/academics/homework/new',
      icon: 'ClipboardList',
      urgent: false,
      priority: 30,
    })
  }

  // Teacher-scoped overdue fees when they cannot see school-wide outstanding.
  if (!ctx.can('fees.view') && ctx.can('fees.collect')) {
    const { accessibleStudentIds } = await import('@/server/scope')
    const ids = await accessibleStudentIds(ctx)
    if (ids && ids.length > 0) {
      const teacherOverdue = await ctx.db.feeInvoice.count({
        where: {
          studentId: { in: ids },
          balanceMinor: { gt: 0 },
          dueOn: { lt: today },
          status: { notIn: ['CANCELLED', 'DRAFT'] },
        },
      })
      if (teacherOverdue > 0) {
        candidates.push({
          id: 'teacher-fees',
          label: 'Overdue in your classes',
          detail: `${teacherOverdue} invoice${teacherOverdue === 1 ? '' : 's'} past due`,
          count: teacherOverdue,
          href: '/finance/invoices',
          icon: 'Wallet',
          urgent: true,
          priority: 80,
        })
      }
    }
  }

  const sorted = candidates.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
    if (a.count !== b.count) return b.count - a.count
    return b.priority - a.priority
  })

  const actionItems = sorted.slice(0, 3)
  const urgentItems = sorted.filter((item) => item.urgent && item.count > 0)
  const greetingCopy = composeGreeting({ time, honor, firstName, urgentItems })
  const followUpPrompts = followUpPromptsFromItems(actionItems)

  return {
    greeting: {
      roleTitle: title,
      timeGreeting: time,
      honorific: honor,
      firstName,
      spoken: greetingCopy.spoken,
      headline: greetingCopy.headline,
      subline: greetingCopy.subline,
    },
    actionItems,
    followUpPrompts,
    hasUrgent: urgentItems.length > 0,
  }
}

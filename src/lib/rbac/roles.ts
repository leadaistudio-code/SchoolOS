import { PERMISSION_KEYS, PERMISSIONS } from './permissions'

/**
 * Built-in role keys. Schools may create additional custom roles at runtime;
 * these are the ones every tenant starts with.
 */
export const ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SCHOOL_ADMIN: 'SCHOOL_ADMIN',
  PRINCIPAL: 'PRINCIPAL',
  TEACHER: 'TEACHER',
  ACCOUNTANT: 'ACCOUNTANT',
  LIBRARIAN: 'LIBRARIAN',
  TRANSPORT_MANAGER: 'TRANSPORT_MANAGER',
  DRIVER: 'DRIVER',
  FRONT_DESK: 'FRONT_DESK',
  HR: 'HR',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
} as const

export type RoleKey = (typeof ROLE)[keyof typeof ROLE]

const all = (module: string) =>
  PERMISSIONS.filter((p) => p.module === module).map((p) => p.key)

const tenantPermissions = PERMISSION_KEYS.filter((k) => !k.startsWith('platform.'))

export type RoleDef = {
  key: RoleKey
  name: string
  description: string
  isPlatform?: boolean
  permissions: string[]
}

export const SYSTEM_ROLES: RoleDef[] = [
  {
    key: ROLE.SUPER_ADMIN,
    name: 'Platform Super Admin',
    description: 'Operates the SaaS platform across all tenants.',
    isPlatform: true,
    permissions: PERMISSION_KEYS.slice(),
  },
  {
    key: ROLE.SCHOOL_ADMIN,
    name: 'School Admin',
    description: 'Full control over one school.',
    permissions: tenantPermissions,
  },
  {
    key: ROLE.PRINCIPAL,
    name: 'Principal',
    description: 'Oversight across academics, staff and finance; approvals.',
    permissions: [
      'dashboard.view',
      ...all('students').filter((k) => !k.endsWith('.delete')),
      ...all('parents').filter((k) => !k.endsWith('.delete')),
      ...all('staff').filter((k) => !k.endsWith('.delete')),
      ...all('academics'),
      ...all('curriculum'),
      ...all('questionbank'),
      ...all('assessments'),
      ...all('timetable'),
      ...all('homework'),
      ...all('classwork'),
      ...all('calendar'),
      ...all('attendance'),
      ...all('staff_attendance'),
      ...all('biometric'),
      ...all('leave'),
      'fees.view', 'fees.accounts', 'fees.export', 'fees.concession', 'fees.report', 'fees.reminder', 'fees.owner_analytics',
      'expenses.view',
      ...all('exams'),
      ...all('results'),
      ...all('certificates'),
      ...all('notices'),
      ...all('messages'),
      ...all('feedback'),
      'teacher_refresh.manage',
      'teacher_refresh.view_department',
      'teacher_refresh.view_school',
      'teacher_refresh.configure',
      'teacher_refresh.question_review',
      'library.view', 'inventory.view', 'frontoffice.view',
      'admissions.view', 'admissions.manage', 'admissions.convert',
      'transport.view', 'transport.track',
      ...all('sports'),
      ...all('events'),
      ...all('reports'),
      ...all('score'),
      ...all('roi'),
      'documents.view',
      'audit.view',
      'assistant.use',
      'settings.view',
      'settings.export',
      'users.view',
      'roles.view',
    ],
  },
  {
    key: ROLE.TEACHER,
    name: 'Teacher',
    description: 'Teaches assigned classes; sees only their students, classes and fee status.',
    permissions: [
      'dashboard.view',
      'students.view',
      // Counts of paid vs unpaid only — never rupee amounts (see fees.status).
      'fees.status',
      'academics.view',
      'curriculum.view',
      'curriculum.manage',
      'questionbank.view',
      'questionbank.create',
      'questionbank.edit',
      'questionbank.delete',
      'questionbank.share',
      'questionbank.generate',
      'assessments.view',
      'assessments.create',
      'assessments.edit',
      'assessments.delete',
      'assessments.export',
      'assessments.assign',
      'assessments.evaluate',
      'assessments.publish',
      'timetable.view',
      'homework.view',
      'homework.create',
      'homework.edit',
      'homework.delete',
      'homework.review',
      'classwork.view',
      'classwork.create',
      'classwork.edit',
      'classwork.delete',
      'attendance.view',
      'attendance.mark',
      'attendance.report',
      'staff_attendance.mark',
      'leave.view',
      'leave.apply',
      'exams.view',
      'exams.attendance',
      'exams.marks',
      'results.view',
      'notices.view',
      'messages.view',
      'messages.send',
      'feedback.view',
      'feedback.teacher_view_own',
      'feedback.teacher_give_student',
      'teacher_refresh.view_self',
      'teacher_refresh.take',
    ],
  },
  {
    key: ROLE.ACCOUNTANT,
    name: 'Accountant',
    description: 'Owns fee structures, invoicing, collection and refunds.',
    permissions: [
      'dashboard.view',
      ...all('fees'),
      ...all('expenses'),
      'notices.view',
      'messages.view', 'messages.send',
      'assistant.use',
      'staff_attendance.mark',
      'leave.view', 'leave.apply',
    ],
  },
  {
    key: ROLE.LIBRARIAN,
    name: 'Librarian',
    description: 'Manages the library catalogue and circulation.',
    permissions: [
      'dashboard.view',
      ...all('library'),
      'inventory.view',
      'notices.view',
      'staff_attendance.mark',
      'leave.view', 'leave.apply',
    ],
  },
  {
    key: ROLE.TRANSPORT_MANAGER,
    name: 'Transport Manager',
    description: 'Manages buses, routes, drivers and student assignments.',
    permissions: [
      'dashboard.view',
      ...all('transport'),
      'notices.view',
      'staff_attendance.mark',
      'leave.view', 'leave.apply',
    ],
  },
  {
    key: ROLE.DRIVER,
    name: 'Driver',
    description: 'Runs trips and records student boarding.',
    permissions: [
      'dashboard.view',
      'transport.view', 'transport.drive',
      'staff_attendance.mark',
      'leave.view', 'leave.apply',
      'notices.view',
    ],
  },
  {
    key: ROLE.FRONT_DESK,
    name: 'Front Office',
    description: 'Reception, visitors, enquiries and admission leads.',
    permissions: [
      'dashboard.view',
      ...all('frontoffice'),
      ...all('admissions'),
      'expenses.view',
      'expenses.manage',
      'notices.view',
      'messages.view', 'messages.send',
      'feedback.view', 'feedback.parent_submit', 'feedback.submit',
      'calendar.view',
      'events.view',
      'staff_attendance.mark',
      'leave.view', 'leave.apply',
    ],
  },
  {
    key: ROLE.HR,
    name: 'HR / Staff Manager',
    description: 'Manages staff records, attendance and leave.',
    permissions: [
      'dashboard.view',
      ...all('staff'),
      ...all('staff_attendance'),
      ...all('leave'),
      'notices.view',
      'users.view', 'users.create', 'users.edit',
      'roles.view',
    ],
  },
  {
    key: ROLE.STUDENT,
    name: 'Student',
    description: 'Sees only their own academic and financial records.',
    permissions: [
      'dashboard.view',
      'students.view',
      'timetable.view',
      'homework.view', 'homework.submit',
      'classwork.view',
      'curriculum.view',
      'calendar.view',
      'attendance.view',
      'attendance.report',
      'leave.view', 'leave.apply',
      'fees.view',
      'exams.view', 'results.view',
      'assessments.attempt',
      'certificates.view',
      'notices.view',
      'messages.view', 'messages.send',
      'library.view',
      'feedback.view',
      'feedback.submit',
      'feedback.student_submit',
      'events.view',
      'transport.track',
      'documents.view',
    ],
  },
  {
    key: ROLE.PARENT,
    name: 'Parent',
    description: 'Sees records for their own children and pays fees.',
    permissions: [
      'dashboard.view',
      // Own-child profile (row scope still enforced in scope.ts).
      'students.view',
      'timetable.view',
      // Parents hand work in on behalf of younger children; the scope layer
      // still restricts them to their own.
      'homework.view', 'homework.submit',
      'classwork.view',
      'curriculum.view',
      'calendar.view',
      'attendance.view',
      'attendance.report',
      'leave.view', 'leave.apply',
      'fees.view',
      'exams.view', 'results.view',
      'certificates.view',
      'notices.view',
      'messages.view', 'messages.send',
      'library.view',
      'feedback.view',
      'feedback.submit',
      'feedback.parent_submit',
      'events.view',
      'transport.track',
      'documents.view',
    ],
  },
]

export const ROLE_BY_KEY = new Map(SYSTEM_ROLES.map((r) => [r.key, r]))

/**
 * Roles whose data access is scoped to the acting person rather than to the
 * whole school. Row-level narrowing for these lives in src/server/scope.ts.
 */
export const SELF_SCOPED_ROLES: RoleKey[] = [ROLE.STUDENT, ROLE.PARENT]

export function hasSchoolWideScope(roleKeys: string[]): boolean {
  const schoolWideRoleKeys: string[] = [ROLE.SUPER_ADMIN, ROLE.SCHOOL_ADMIN, ROLE.PRINCIPAL]
  return roleKeys.some((key) => schoolWideRoleKeys.includes(key))
}

export function isSelfScoped(roleKeys: string[]): boolean {
  const isPortal = roleKeys.some((key) => SELF_SCOPED_ROLES.includes(key as RoleKey))
  return isPortal && !hasSchoolWideScope(roleKeys)
}

/** Teacher-only accounts get a scoped dashboard and row-level filters in scope.ts. */
export function isTeacherScoped(roleKeys: string[]): boolean {
  const schoolWide: string[] = [
    ROLE.SUPER_ADMIN,
    ROLE.SCHOOL_ADMIN,
    ROLE.PRINCIPAL,
    ROLE.ACCOUNTANT,
    ROLE.LIBRARIAN,
    ROLE.TRANSPORT_MANAGER,
    ROLE.FRONT_DESK,
    ROLE.HR,
  ]
  return (
    roleKeys.includes(ROLE.TEACHER) &&
    !roleKeys.includes(ROLE.PARENT) &&
    !roleKeys.includes(ROLE.STUDENT) &&
    !roleKeys.some((key) => schoolWide.includes(key))
  )
}

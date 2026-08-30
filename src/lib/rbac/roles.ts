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
      ...all('leave'),
      'fees.view', 'fees.export', 'fees.concession',
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
      'fees.view',
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
      'staff_attendance.mark',
      'leave.view',
      'leave.apply',
      'exams.view',
      'exams.marks',
      'results.view',
      'notices.view',
      'messages.view',
      'messages.send',
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
      'students.view', 'parents.view',
      'academics.view',
      ...all('fees'),
      'reports.view', 'reports.export',
      'notices.view',
      'messages.view', 'messages.send',
      'feedback.view', 'feedback.student_submit', 'feedback.submit',
      'documents.view',
      'audit.view',
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
      'students.view', 'staff.view',
      ...all('library'),
      'inventory.view',
      'reports.view',
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
      'students.view',
      ...all('transport'),
      'reports.view',
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
      'students.view', 'parents.view',
      ...all('frontoffice'),
      ...all('admissions'),
      'notices.view',
      'messages.view', 'messages.send',
      'feedback.view', 'feedback.parent_submit', 'feedback.submit',
      'calendar.view',
      'events.view',
      'documents.view',
      'reports.view',
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
      'documents.view', 'documents.manage',
      'reports.view', 'reports.export',
      'notices.view',
      'users.view', 'users.create', 'users.edit', 'users.roles',
      'roles.view',
    ],
  },
  {
    key: ROLE.STUDENT,
    name: 'Student',
    description: 'Sees only their own academic and financial records.',
    permissions: [
      'dashboard.view',
      'timetable.view',
      'homework.view', 'homework.submit',
      'classwork.view',
      'calendar.view',
      'attendance.view',
      'leave.view', 'leave.apply',
      'fees.view',
      'exams.view', 'results.view',
      'assessments.attempt',
      'certificates.view',
      'notices.view',
      'messages.view', 'messages.send',
      'library.view',
      'events.view',
      'transport.view',
      'documents.view',
    ],
  },
  {
    key: ROLE.PARENT,
    name: 'Parent',
    description: 'Sees records for their own children and pays fees.',
    permissions: [
      'dashboard.view',
      'timetable.view',
      // Parents hand work in on behalf of younger children; the scope layer
      // still restricts them to their own.
      'homework.view', 'homework.submit',
      'classwork.view',
      'calendar.view',
      'attendance.view',
      'leave.view', 'leave.apply',
      'fees.view',
      'exams.view', 'results.view',
      'certificates.view',
      'notices.view',
      'messages.view', 'messages.send',
      'events.view',
      'transport.view', 'transport.track',
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

export function isSelfScoped(roleKeys: string[]): boolean {
  const elevated = roleKeys.some(
    (k) => !SELF_SCOPED_ROLES.includes(k as RoleKey),
  )
  return !elevated && roleKeys.length > 0
}

/** Teacher-only accounts get a scoped dashboard and row-level filters in scope.ts. */
export function isTeacherScoped(roleKeys: string[]): boolean {
  return roleKeys.length > 0 && roleKeys.every((k) => k === ROLE.TEACHER)
}

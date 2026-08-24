/**
 * The permission catalogue. Every server-side authorization check refers to a
 * key from this file - there are no ad hoc permission strings anywhere else.
 * Seeding reads this list, so adding an entry here and re-running the seed is
 * all it takes to introduce a new capability.
 */

export type PermissionDef = {
  key: string
  module: string
  action: string
  label: string
}

function mod(module: string, entries: [action: string, label: string][]): PermissionDef[] {
  return entries.map(([action, label]) => ({
    key: `${module}.${action}`,
    module,
    action,
    label,
  }))
}

const CRUD: [string, string][] = [
  ['view', 'View'],
  ['create', 'Create'],
  ['edit', 'Edit'],
  ['delete', 'Delete'],
]

export const PERMISSIONS: PermissionDef[] = [
  ...mod('dashboard', [['view', 'View dashboard']]),

  ...mod('students', [
    ...CRUD,
    ['import', 'Bulk import'],
    ['export', 'Export'],
    ['promote', 'Promote / transfer'],
    ['documents', 'Manage documents'],
  ]),
  ...mod('parents', [...CRUD, ['export', 'Export']]),
  ...mod('staff', [
    ...CRUD,
    ['export', 'Export'],
    ['payroll', 'View payroll data'],
    ['payroll_manage', 'Set salaries and run payroll'],
    ['appraise', 'Run appraisals and record performance'],
  ]),

  ...mod('assessments', [
    ...CRUD,
    ['assign', 'Assign a paper to students'],
    ['approve', 'Approve a paper for use'],
    ['attempt', 'Sit an assigned paper'],
    ['evaluate', 'Mark submitted papers'],
    ['publish', 'Release results to students'],
    ['export', 'Print and export papers'],
  ]),
  ...mod('questionbank', [
    ...CRUD,
    ['share', 'Share questions with the school'],
    ['approve', 'Approve draft questions'],
    ['generate', 'Generate questions with AI'],
  ]),
  ...mod('curriculum', [
    ['view', 'View the syllabus'],
    ['manage', 'Manage chapters, topics and outcomes'],
  ]),
  ...mod('academics', [
    ['view', 'View classes, sections and subjects'],
    ['manage', 'Manage classes, sections and subjects'],
  ]),
  ...mod('timetable', [
    ['view', 'View timetable'],
    ['manage', 'Manage timetable'],
  ]),
  ...mod('homework', [...CRUD, ['review', 'Review submissions'], ['submit', 'Submit homework']]),
  ...mod('classwork', [...CRUD]),
  ...mod('calendar', [
    ['view', 'View calendar'],
    ['manage', 'Manage calendar events'],
  ]),

  ...mod('attendance', [
    ['view', 'View student attendance'],
    ['mark', 'Mark student attendance'],
    ['edit', 'Edit past attendance'],
    ['report', 'Attendance reports'],
  ]),
  ...mod('staff_attendance', [
    ['view', 'View staff attendance'],
    ['mark', 'Mark own attendance'],
    ['manage', 'Manage / override staff attendance'],
  ]),
  ...mod('leave', [
    ['view', 'View leave requests'],
    ['apply', 'Apply for leave'],
    ['approve', 'Approve or reject leave'],
  ]),

  ...mod('fees', [
    ['view', 'View fees'],
    ['structure', 'Manage fee structures'],
    ['invoice', 'Generate invoices'],
    ['collect', 'Collect payments'],
    ['refund', 'Issue refunds'],
    ['concession', 'Manage concessions'],
    ['export', 'Export finance data'],
  ]),

  ...mod('exams', [
    ['view', 'View exams'],
    ['manage', 'Create and schedule exams'],
    ['marks', 'Enter marks'],
    ['publish', 'Publish results'],
  ]),
  ...mod('results', [
    ['view', 'View results'],
    ['export', 'Export results'],
  ]),
  ...mod('certificates', [
    ['view', 'View certificates'],
    ['issue', 'Issue certificates'],
    ['template', 'Manage certificate templates'],
  ]),

  ...mod('notices', [...CRUD, ['publish', 'Publish notices']]),
  ...mod('messages', [
    ['view', 'View messages'],
    ['send', 'Send messages'],
    ['broadcast', 'Broadcast to audiences'],
  ]),

  ...mod('feedback', [
    ['view', 'View feedback'],
    ['submit', 'Submit assigned feedback'],
    ['student_submit', 'Submit student-to-teacher feedback'],
    ['parent_submit', 'Submit parent feedback'],
    ['teacher_view_own', 'View own aggregated feedback'],
    ['teacher_give_student', 'Give student feedback'],
    ['campaign_manage', 'Manage feedback campaigns'],
    ['template_manage', 'Manage feedback templates'],
    ['analytics_view', 'View feedback analytics'],
    ['moderate', 'Moderate feedback comments'],
    ['concern_view', 'View confidential concerns'],
    ['concern_manage', 'Manage confidential concerns'],
    ['action_manage', 'Manage feedback action items'],
    ['settings_manage', 'Manage feedback settings'],
  ]),

  // Teacher Knowledge Refresh & Readiness. Professional development, not
  // surveillance: an individual teacher's results are internal PD data (never
  // exposed to parents or students), and the module never drives employment
  // decisions on its own. Oversight roles see readiness to offer support.
  ...mod('teacher_refresh', [
    ['view_self', 'View and track own knowledge refreshers'],
    ['take', 'Take an assigned knowledge refresher'],
    ['manage', 'Assign, extend and exempt refreshers'],
    ['view_department', 'View department readiness'],
    ['view_school', 'View school-wide faculty readiness'],
    ['configure', 'Configure knowledge refresh settings'],
    ['question_review', 'Review AI-generated refresh questions'],
  ]),

  ...mod('library', [
    ['view', 'View library'],
    ['manage', 'Manage books'],
    ['issue', 'Issue and return books'],
  ]),
  ...mod('inventory', [['view', 'View assets'], ['manage', 'Manage assets']]),
  ...mod('frontoffice', [
    ['view', 'View front office'],
    ['manage', 'Manage visitors and appointments'],
  ]),
  ...mod('admissions', [
    ['view', 'View admission leads'],
    ['manage', 'Manage leads and follow-ups'],
    ['convert', 'Convert lead to student'],
  ]),
  ...mod('transport', [
    ['view', 'View transport'],
    ['manage', 'Manage buses, routes and assignments'],
    ['track', 'Live tracking'],
    ['drive', 'Driver trip operations'],
  ]),
  ...mod('sports', [['view', 'View sports'], ['manage', 'Manage sports and teams']]),
  ...mod('events', [['view', 'View events'], ['manage', 'Manage events']]),
  ...mod('website', [['view', 'View website CMS'], ['manage', 'Manage website content']]),

  ...mod('reports', [['view', 'View reports'], ['export', 'Export reports']]),
  ...mod('documents', [['view', 'View documents'], ['manage', 'Upload and delete documents']]),
  ...mod('roi', [['view', 'Use the ROI calculator']]),
  ...mod('score', [
    ['view', 'View the health score'],
    ['manage', 'Set the score weightings'],
  ]),
  ...mod('audit', [['view', 'View audit log']]),

  // The in-app assistant. A separate right from the records it reads: holding
  // it grants no data access on its own, because every assistant tool re-checks
  // the permission for the module it reads (see server/assistant/tools.ts).
  ...mod('assistant', [['use', 'Ask the school assistant']]),

  ...mod('settings', [
    ['view', 'View settings'],
    ['manage', 'Change school settings'],
    ['branding', 'Manage branding'],
    ['integrations', 'Manage integrations and secrets'],
  ]),
  ...mod('support', [
    ['view', 'View support tickets'],
    ['create', 'Raise support tickets'],
  ]),
  ...mod('users', [
    ...CRUD,
    ['roles', 'Assign roles'],
    ['impersonate', 'Impersonate users'],
  ]),
  ...mod('roles', [['view', 'View roles'], ['manage', 'Create and edit roles']]),

  // Platform-only. Never granted to a tenant role.
  ...mod('platform', [
    ['tenants', 'Manage tenants'],
    ['plans', 'Manage plans and entitlements'],
    ['billing', 'Manage billing'],
    ['impersonate', 'Impersonate tenant users'],
    ['health', 'View system health'],
    ['support', 'Manage support tickets'],
  ]),
]

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key)

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export const PERMISSION_MODULES = Array.from(new Set(PERMISSIONS.map((p) => p.module)))

export function isValidPermission(key: string): boolean {
  return PERMISSION_KEYS.includes(key)
}

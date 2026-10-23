/**
 * The marketing blog's vocabulary.
 *
 * Shared by the daily generator (which category it writes in, which topic it
 * takes next) and the website (labels, colours, icons). Categories rotate one
 * per day so the archive stays balanced instead of drifting towards whatever
 * the model finds easiest to write about.
 */

export type BlogCategoryKey =
  | 'fees'
  | 'admissions'
  | 'attendance'
  | 'academics'
  | 'parents'
  | 'leadership'
  | 'operations'
  | 'transport'
  | 'technology'
  | 'data'
  | 'staff'

export type BlogCategory = {
  key: BlogCategoryKey
  label: string
  blurb: string
  /** Name of a lucide icon, resolved on the website. */
  icon:
    | 'Wallet'
    | 'DoorOpen'
    | 'CalendarCheck'
    | 'GraduationCap'
    | 'MessageCircle'
    | 'Compass'
    | 'ClipboardList'
    | 'Bus'
    | 'MonitorSmartphone'
    | 'ShieldCheck'
    | 'Briefcase'
  /** Accent and tint for the cover art; both from the site palette family. */
  accent: string
  tint: string
}

export const BLOG_CATEGORIES: BlogCategory[] = [
  { key: 'fees', label: 'Fees & finance', blurb: 'Fee structures, collection, dues and the school office ledger.', icon: 'Wallet', accent: '#1d4ed8', tint: '#eef2fd' },
  { key: 'admissions', label: 'Admissions', blurb: 'Enquiries, follow-ups, campus visits and enrolment season.', icon: 'DoorOpen', accent: '#a1620b', tint: '#fbf3e6' },
  { key: 'attendance', label: 'Attendance', blurb: 'Registers, absence follow-up and the patterns behind them.', icon: 'CalendarCheck', accent: '#0f766e', tint: '#e8f6f3' },
  { key: 'academics', label: 'Teaching & exams', blurb: 'Homework, assessments, report cards and the academic calendar.', icon: 'GraduationCap', accent: '#4338ca', tint: '#eef0fd' },
  { key: 'parents', label: 'Parent communication', blurb: 'Notices, updates and the conversations that build trust.', icon: 'MessageCircle', accent: '#be185d', tint: '#fdeef5' },
  { key: 'leadership', label: 'School leadership', blurb: 'Planning, decisions and running a school well.', icon: 'Compass', accent: '#17369e', tint: '#eaf0fb' },
  { key: 'operations', label: 'Operations', blurb: 'The front office, records, timetables and everyday admin.', icon: 'ClipboardList', accent: '#0369a1', tint: '#e8f3fa' },
  { key: 'transport', label: 'Transport & safety', blurb: 'Buses, routes, pick-up and keeping children safe.', icon: 'Bus', accent: '#b45309', tint: '#fcf1e4' },
  { key: 'technology', label: 'School technology', blurb: 'Choosing, rolling out and getting value from software.', icon: 'MonitorSmartphone', accent: '#1e40af', tint: '#ecf1fc' },
  { key: 'data', label: 'Data & privacy', blurb: 'Protecting student records and handling data responsibly.', icon: 'ShieldCheck', accent: '#047857', tint: '#e7f5ef' },
  { key: 'staff', label: 'Staff & HR', blurb: 'Hiring, leave, payroll and supporting teachers.', icon: 'Briefcase', accent: '#7c2d12', tint: '#f9ede7' },
]

/** Hero photo served from object storage when the post has `coverImageKey`. */
export function blogCoverUrl(slug: string, coverImageKey: string | null | undefined) {
  return coverImageKey ? `/blog/cover/${slug}` : null
}

export function blogCategory(key: string): BlogCategory {
  return BLOG_CATEGORIES.find((c) => c.key === key) ?? BLOG_CATEGORIES[0]!
}

/**
 * Topics with a search intent behind them. The generator takes the first one
 * in today's category that has not been written yet; once a category's list is
 * used up it asks the model for a fresh angle that avoids every past title.
 */
export type BlogTopic = { key: string; category: BlogCategoryKey; topic: string; keyword: string }

export const BLOG_TOPICS: BlogTopic[] = [
  // Fees
  { key: 'fees-reduce-defaults', category: 'fees', topic: 'Practical ways to reduce school fee defaults without damaging relationships with parents', keyword: 'reduce school fee defaults' },
  { key: 'fees-structure-design', category: 'fees', topic: 'How to design a clear school fee structure parents understand', keyword: 'school fee structure' },
  { key: 'fees-online-collection', category: 'fees', topic: 'Moving school fee collection online: a step-by-step plan for the school office', keyword: 'online school fee collection' },
  { key: 'fees-reminders', category: 'fees', topic: 'Writing fee reminder messages that are polite, clear and effective', keyword: 'school fee reminder message' },
  { key: 'fees-concessions', category: 'fees', topic: 'Managing sibling discounts, scholarships and fee concessions fairly', keyword: 'school fee concession policy' },
  { key: 'fees-month-end', category: 'fees', topic: 'A month-end fee reconciliation checklist for school accountants', keyword: 'school fee reconciliation' },
  { key: 'fees-receipts', category: 'fees', topic: 'What a good school fee receipt should include and why it matters', keyword: 'school fee receipt format' },
  { key: 'fees-late-fines', category: 'fees', topic: 'Setting a late fee policy that is fair and actually enforced', keyword: 'school late fee policy' },
  // Admissions
  { key: 'adm-enquiry-followup', category: 'admissions', topic: 'Why schools lose admission enquiries and how to follow up properly', keyword: 'school admission enquiry follow up' },
  { key: 'adm-campus-visit', category: 'admissions', topic: 'Running a campus visit that turns interested parents into admissions', keyword: 'school campus visit for parents' },
  { key: 'adm-season-plan', category: 'admissions', topic: 'Planning the school admission season: a month-by-month checklist', keyword: 'school admission planning' },
  { key: 'adm-online-form', category: 'admissions', topic: 'Designing an online admission form parents complete without calling the office', keyword: 'online school admission form' },
  { key: 'adm-website', category: 'admissions', topic: 'What parents look for on a school website before they enquire', keyword: 'school website for admissions' },
  { key: 'adm-pipeline', category: 'admissions', topic: 'Tracking admissions as a pipeline: stages every school should measure', keyword: 'school admissions pipeline' },
  { key: 'adm-documents', category: 'admissions', topic: 'Collecting and verifying admission documents without the paper chase', keyword: 'school admission documents checklist' },
  { key: 'adm-retention', category: 'admissions', topic: 'Re-enrolment and retention: keeping families from one year to the next', keyword: 'student retention in schools' },
  // Attendance
  { key: 'att-chronic-absence', category: 'attendance', topic: 'Spotting chronic absenteeism early and what schools can do about it', keyword: 'chronic absenteeism in schools' },
  { key: 'att-daily-routine', category: 'attendance', topic: 'A daily attendance routine that takes teachers minutes, not a period', keyword: 'daily attendance in school' },
  { key: 'att-same-day-alerts', category: 'attendance', topic: 'Same-day absence alerts to parents: why they matter and how to do them well', keyword: 'absence alert to parents' },
  { key: 'att-late-arrivals', category: 'attendance', topic: 'Handling late arrivals consistently across a school', keyword: 'late coming policy school' },
  { key: 'att-reports', category: 'attendance', topic: 'Attendance reports a principal should read every week', keyword: 'school attendance report' },
  { key: 'att-period-wise', category: 'attendance', topic: 'Period-wise versus daily attendance: which a school needs and when', keyword: 'period wise attendance' },
  { key: 'att-staff', category: 'attendance', topic: 'Staff attendance and substitution planning without a scramble each morning', keyword: 'teacher substitution planning' },
  // Academics
  { key: 'aca-homework-policy', category: 'academics', topic: 'Writing a homework policy that teachers follow and parents understand', keyword: 'school homework policy' },
  { key: 'aca-report-cards', category: 'academics', topic: 'Report cards that tell parents something useful', keyword: 'school report card comments' },
  { key: 'aca-exam-planning', category: 'academics', topic: 'Planning a term examination schedule without clashes or last-minute changes', keyword: 'school exam timetable planning' },
  { key: 'aca-mark-entry', category: 'academics', topic: 'A cleaner process for teachers entering marks and publishing results', keyword: 'marks entry for teachers' },
  { key: 'aca-timetable', category: 'academics', topic: 'Building a school timetable that works for teachers and students', keyword: 'school timetable planning' },
  { key: 'aca-class-tests', category: 'academics', topic: 'Using short class tests to find learning gaps early', keyword: 'class tests for learning gaps' },
  { key: 'aca-ptm', category: 'academics', topic: 'Preparing for parent-teacher meetings that are actually productive', keyword: 'parent teacher meeting tips' },
  { key: 'aca-calendar', category: 'academics', topic: 'Building the academic calendar: terms, holidays and exam windows', keyword: 'school academic calendar' },
  // Parents
  { key: 'par-whatsapp-chaos', category: 'parents', topic: 'Moving school communication beyond scattered WhatsApp groups', keyword: 'school communication with parents' },
  { key: 'par-notice-writing', category: 'parents', topic: 'How to write a school notice parents read and act on', keyword: 'how to write a school notice' },
  { key: 'par-difficult-conversations', category: 'parents', topic: 'Handling difficult conversations with parents professionally', keyword: 'handling difficult parents' },
  { key: 'par-engagement', category: 'parents', topic: 'Parent engagement ideas that work for busy families', keyword: 'parent engagement in school' },
  { key: 'par-complaints', category: 'parents', topic: 'A simple process for handling parent complaints and closing them properly', keyword: 'parent complaint handling school' },
  { key: 'par-newsletter', category: 'parents', topic: 'Creating a school newsletter parents look forward to', keyword: 'school newsletter ideas' },
  { key: 'par-app-adoption', category: 'parents', topic: 'Getting every parent to actually use the school app', keyword: 'parent app adoption' },
  // Leadership
  { key: 'lead-weekly-review', category: 'leadership', topic: 'The weekly review every principal should run in thirty minutes', keyword: 'principal weekly review' },
  { key: 'lead-dashboard', category: 'leadership', topic: 'The numbers a school owner should look at every month', keyword: 'school management dashboard' },
  { key: 'lead-new-session', category: 'leadership', topic: 'Preparing for a new academic session: a checklist for school leaders', keyword: 'new academic session checklist' },
  { key: 'lead-delegation', category: 'leadership', topic: 'Delegation for principals: what to hand over and how', keyword: 'delegation for school principals' },
  { key: 'lead-growth', category: 'leadership', topic: 'Growing a private school sustainably without stretching quality', keyword: 'how to grow a private school' },
  { key: 'lead-multi-campus', category: 'leadership', topic: 'Running more than one campus without losing control of the details', keyword: 'managing multiple school campuses' },
  { key: 'lead-policies', category: 'leadership', topic: 'The written policies every school should have and keep current', keyword: 'school policies list' },
  { key: 'lead-inspection-ready', category: 'leadership', topic: 'Keeping school records inspection-ready all year', keyword: 'school records management' },
  // Operations
  { key: 'ops-front-office', category: 'operations', topic: 'Organising the school front office so parents are served quickly', keyword: 'school front office management' },
  { key: 'ops-paperless', category: 'operations', topic: 'Going paperless in the school office, one register at a time', keyword: 'paperless school office' },
  { key: 'ops-student-records', category: 'operations', topic: 'Keeping student records accurate from admission to leaving certificate', keyword: 'student records management' },
  { key: 'ops-certificates', category: 'operations', topic: 'Issuing transfer, bonafide and character certificates without delays', keyword: 'school certificate issuance' },
  { key: 'ops-year-end', category: 'operations', topic: 'Year-end promotion and rollover: an administrator checklist', keyword: 'student promotion year end' },
  { key: 'ops-inventory', category: 'operations', topic: 'Tracking school inventory, books and uniforms without spreadsheets breaking', keyword: 'school inventory management' },
  { key: 'ops-visitor', category: 'operations', topic: 'A visitor and gate management routine that keeps the campus safe', keyword: 'school visitor management' },
  // Transport
  { key: 'tr-route-planning', category: 'transport', topic: 'Planning school bus routes and stops efficiently', keyword: 'school bus route planning' },
  { key: 'tr-safety-checklist', category: 'transport', topic: 'A daily school bus safety checklist for transport managers', keyword: 'school bus safety checklist' },
  { key: 'tr-parent-tracking', category: 'transport', topic: 'Live bus tracking for parents: what it solves and what it does not', keyword: 'school bus tracking for parents' },
  { key: 'tr-driver-records', category: 'transport', topic: 'Keeping driver and attendant records complete and current', keyword: 'school bus driver records' },
  { key: 'tr-pickup', category: 'transport', topic: 'A safe dismissal and pick-up process for schools', keyword: 'school pick up process' },
  { key: 'tr-fees', category: 'transport', topic: 'Setting and collecting transport fees fairly by route or distance', keyword: 'school transport fee' },
  { key: 'tr-maintenance', category: 'transport', topic: 'Fleet maintenance and document renewals schools should never miss', keyword: 'school bus maintenance' },
  // Technology
  { key: 'tech-choose-erp', category: 'technology', topic: 'How to choose school management software: questions to ask every vendor', keyword: 'how to choose school management software' },
  { key: 'tech-rollout', category: 'technology', topic: 'Rolling out new school software without losing a term to it', keyword: 'school software implementation' },
  { key: 'tech-staff-training', category: 'technology', topic: 'Training staff on new software so it sticks', keyword: 'training teachers on school software' },
  { key: 'tech-sis-vs-erp', category: 'technology', topic: 'Student information system, school ERP, LMS: what each one is for', keyword: 'student information system vs school ERP' },
  { key: 'tech-data-migration', category: 'technology', topic: 'Moving school data from spreadsheets to a new system cleanly', keyword: 'school data migration' },
  { key: 'tech-integration-cost', category: 'technology', topic: 'The hidden cost of running five separate school tools', keyword: 'integrated school management system' },
  { key: 'tech-mobile', category: 'technology', topic: 'Mobile apps for teachers and parents: what really matters', keyword: 'school mobile app' },
  { key: 'tech-ai-in-school-office', category: 'technology', topic: 'Sensible uses of AI in the school office, and where to be careful', keyword: 'AI in school administration' },
  // Data
  { key: 'data-privacy-basics', category: 'data', topic: 'Student data privacy basics every school should get right', keyword: 'student data privacy' },
  { key: 'data-access-roles', category: 'data', topic: 'Who should see what: role-based access to school records', keyword: 'role based access school' },
  { key: 'data-passwords', category: 'data', topic: 'Account and password hygiene for school staff', keyword: 'school cyber security tips' },
  { key: 'data-backups', category: 'data', topic: 'Backups and continuity: what happens if the school office computer dies', keyword: 'school data backup' },
  { key: 'data-consent', category: 'data', topic: 'Photos, consent and sharing student information responsibly', keyword: 'student photo consent' },
  { key: 'data-audit-trail', category: 'data', topic: 'Why an audit trail of changes protects your school', keyword: 'audit trail school records' },
  { key: 'data-retention', category: 'data', topic: 'How long a school should keep records, and how to remove them', keyword: 'school record retention' },
  // Staff
  { key: 'staff-onboarding', category: 'staff', topic: 'Onboarding new teachers so they are effective from week one', keyword: 'teacher onboarding' },
  { key: 'staff-leave-policy', category: 'staff', topic: 'A staff leave policy that is clear, fair and easy to run', keyword: 'staff leave policy school' },
  { key: 'staff-payroll', category: 'staff', topic: 'Getting school payroll right every month', keyword: 'school payroll management' },
  { key: 'staff-workload', category: 'staff', topic: 'Reducing teacher admin workload so teaching gets the time', keyword: 'reduce teacher workload' },
  { key: 'staff-appraisal', category: 'staff', topic: 'Running teacher appraisals that help people improve', keyword: 'teacher appraisal' },
  { key: 'staff-retention', category: 'staff', topic: 'Keeping good teachers: retention ideas schools can afford', keyword: 'teacher retention' },
  { key: 'staff-records', category: 'staff', topic: 'Staff records every school should keep complete', keyword: 'school staff records' },
]

/** Pages on the website an article may link to, so links never 404. */
export const BLOG_INTERNAL_LINKS: { path: string; label: string }[] = [
  { path: '/product', label: 'How MyCampusView works' },
  { path: '/modules', label: 'All modules' },
  { path: '/student-information-system', label: 'Student information system' },
  { path: '/admission-crm', label: 'Admission CRM' },
  { path: '/school-erp', label: 'School ERP: fees, staff and communication' },
  { path: '/transport', label: 'School transport and bus tracking' },
  { path: '/security', label: 'Security and data protection' },
  { path: '/services', label: 'Implementation and support' },
  { path: '/book-demo', label: 'Book a demo' },
]

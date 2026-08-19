/**
 * The API's shapes, as the app consumes them.
 *
 * Hand-written rather than generated, and deliberately partial: a screen needs
 * the fields it renders, not every column the server happens to return. Each
 * one was taken from the live endpoint, so they describe what actually arrives
 * rather than what a route file suggests might.
 */

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY'

/* -------------------------------------------------------------- dashboard */

export type Dashboard = {
  people: { students: number; teachers: number; staff: number; parents: number }
  attendance: {
    present: number
    absent: number
    late: number
    marked: number
    expected: number
    percent: number
    trend: { day: string; percent: number }[]
  }
  finance: {
    collectedTodayMinor: number
    paymentsToday: number
    collectedMonthMinor: number
    outstandingMinor: number
    overdueInvoices: number
    trend: { day: string; amountMinor: number }[]
  }
  admissions?: { open?: number; converted?: number; newThisWeek?: number } | null
  pendingLeave?: number
  upcomingExams?: { id: string; name: string; startsOn: string }[]
  recentNotices?: { id: string; title: string; publishOn: string }[]
  recentPayments?: { id: string; amountMinor: number; studentName?: string; takenAt?: string }[]
}

/* --------------------------------------------------------------- students */

export type StudentRow = {
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  photoUrl: string | null
  gender: string | null
  status: string
  className: string | null
  sectionName: string | null
  rollNumber: number | null
  guardianName: string | null
  guardianPhone: string | null
  dueMinor: number
}

export type StudentDetail = StudentRow & {
  dateOfBirth: string | null
  bloodGroup: string | null
  category: string | null
  admissionDate: string | null
  nationality: string | null
  religion: string | null
}

/* ------------------------------------------------------------- attendance */

/** `GET /attendance?onDate=` — every section, and how far each has got. */
export type AttendanceSection = {
  id: string
  label: string
  numeric: number
  enrolled: number
  marked: number
}

/** `GET /attendance?sectionId=&onDate=` */
export type Register = {
  section: { id: string; name: string; className: string }
  onDate: string
  /** False once the day is locked, or the user may only read. */
  editable: boolean
  lockedReason: string | null
  markedAt: string | null
  markedBy: string | null
  rows: RegisterRow[]
}

export type RegisterRow = {
  studentId: string
  admissionNo: string
  firstName: string
  lastName: string
  rollNumber: number | null
  status: AttendanceStatus | null
  minutesLate: number | null
  remarks: string | null
  /** Already approved as absent; marking them present would contradict a record. */
  onApprovedLeave: boolean
}

/* ------------------------------------------------------------------ fees */

export type OutstandingRow = {
  className: string
  students: number
  outstandingMinor: number
  overdueMinor: number
}

/* ---------------------------------------------------------------- notices */

export type Notice = {
  id: string
  title: string
  body: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | string
  publishOn: string
  expiresOn: string | null
  isPublished: boolean
  pinned: boolean
  audience: string
  attachmentCount: number
  isExpired: boolean
}

/* ----------------------------------------------------------------- search */

export type SearchHit = {
  id: string
  type: string
  title: string
  subtitle: string
  /** The web path. Mapped to a mobile route rather than opened as a URL. */
  href: string
}

/* ---------------------------------------------------------- notifications */

export type Notifications = {
  unread: number
  rows: { id: string; title: string; body: string; createdAt: string; readAt: string | null; linkUrl: string | null }[]
}

/* ------------------------------------------------------------- admissions */

export type Enquiry = {
  id: string
  reference: string
  studentName: string
  parentName: string | null
  phone: string | null
  email: string | null
  source: string | null
  stage: string
  className: string | null
  nextFollowUpOn: string | null
  updatedAt: string
}

/** `GET /admissions` returns the pipeline already grouped by stage. */
export type Pipeline = Record<string, Enquiry[]>

/* -------------------------------------------------------------- assistant */

export type AssistantReply = {
  answer: string
  citations?: { label: string; href: string }[]
  /** Set when the assistant has drafted an action it will not take unasked. */
  pendingAction?: { id: string; summary: string } | null
}

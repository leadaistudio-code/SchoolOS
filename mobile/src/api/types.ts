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

export type AssistantBriefing = {
  greeting: {
    roleTitle: string
    timeGreeting: string
    honorific: string | null
    firstName: string
    spoken: string
    headline: string
    subline: string
  }
  actionItems: Array<{
    id: string
    label: string
    detail: string
    count: number
    href: string
    icon: string
    urgent: boolean
  }>
  followUpPrompts: string[]
  hasUrgent: boolean
}

/* ---------------------------------------------------------------- parents */

export type Parent = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  occupation: string | null
  hasLogin: boolean
  childCount: number
  children: string[]
}

/* ------------------------------------------------------------------ staff */

export type Staff = {
  id: string
  employeeCode: string
  firstName: string
  lastName: string
  staffType: string
  designation: string | null
  department: string | null
  phone: string | null
  email: string | null
  hasLogin: boolean
  classCount: number
  isClassTeacherOf: string | null
}

/* --------------------------------------------------------------- homework */

export type Homework = {
  id: string
  title: string
  subject: string | null
  className: string | null
  sectionName: string | null
  teacher: string | null
  assignedOn: string
  dueOn: string | null
  isPublished: boolean
  maxScore: number | null
  attachmentCount: number
  /** How many students it was set for, and how far they have got. */
  expected: number
  submitted: number
  reviewed: number
  isOverdue: boolean
}

/* ------------------------------------------------------------------ leave */

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export type LeaveRequest = {
  id: string
  applicantType: 'STUDENT' | 'STAFF'
  applicantName: string
  applicantDetail: string | null
  leaveType: string | null
  fromDate: string
  toDate: string
  days: number
  reason: string
  status: LeaveStatus
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
  /** The server's own answer to "may this user decide it" — self-approval is refused. */
  canDecide: boolean
}

/* -------------------------------------------------------------- transport */

export type TransportStop = {
  id: string
  name: string
  pickupTime: string | null
  dropTime: string | null
}

export type TransportRoute = {
  id: string
  name: string
  code: string | null
  distanceKm: number | null
  isActive: boolean
  bus: {
    id: string
    code: string
    registrationNo: string | null
    capacity: number | null
    driver: { firstName: string; lastName: string; phone: string | null } | null
  } | null
  stops: TransportStop[]
}

/* -------------------------------------------------------------- timetable */

export type TimetablePeriod = {
  id: string
  name: string
  startTime: string
  endTime: string
  isBreak: boolean
}

export type TimetableCell = {
  slotId: string | null
  subject: string | null
  subjectCode: string | null
  /** Section view: teacher name. Teacher view: class + section. */
  teacher: string | null
  teacherId: string | null
  roomName: string | null
}

export type TimetableGrid = {
  staff?: { id: string; firstName: string; lastName: string }
  section?: { id: string; name: string; className: string }
  periods: TimetablePeriod[]
  days: { value: number; label: string; short: string }[]
  cells: Record<string, Record<number, TimetableCell>>
  periodsPerWeek?: number
}

/* ------------------------------------------------------------------- exams */

export type ExamRow = {
  id: string
  name: string
  kind: string
  status: string
  startsOn: string
  endsOn: string
  gradingScale: { name: string } | null
  _count: { classes: number; subjects: number }
}

export type ExamAttendanceDate = {
  key: string
  paperCount: number
  subjects: string[]
}

export type ExamAttendanceRow = {
  admitCardNumber: string
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNo: string
    photoUrl: string | null
    enrollments: {
      rollNumber: number | null
      classLevel: { name: string }
      section: { name: string } | null
    }[]
  }
  paperCount: number
  papersMarked: number
  attendance: {
    status: string
    source: string
    checkedInAt: string | null
    updatedAt: string
  } | null
}

export type ExamAttendanceDesk = {
  exam: { id: string; name: string }
  dates: ExamAttendanceDate[]
  selectedDate: string | null
  dayPapers: { id: string; subjectName: string; className: string; startTime: string | null }[]
  rows: ExamAttendanceRow[]
}

export type ExamScanResult = {
  studentId: string
  studentName: string
  admissionNo: string
  photoUrl: string | null
  className: string
  checkedInAt: string | null
  duplicate: boolean
  papersTotal: number
}

export type ExamMarksPaper = {
  id: string
  maxMarks: number
  classSubject: {
    classLevel: { name: string }
    subject: { name: string }
    teacherId: string | null
  }
}

export type ExamMarksSetup = {
  id: string
  name: string
  subjects: ExamMarksPaper[]
}

export type MarksRosterRow = {
  studentId: string
  rollNumber: number | null
  student: { admissionNo: string; firstName: string; lastName: string }
  mark: {
    marksObtained: number | null
    isAbsent: boolean
    remarks: string | null
  } | null
}

export type MarksRoster = {
  exam: { id: string; name: string }
  subject: { name: string }
  maxMarks: number
  passMarks: number
  rows: MarksRosterRow[]
}

/* ---------------------------------------------------------- fee collection */

export type InvoiceRow = {
  id: string
  number: string
  title: string
  studentId: string
  studentName: string
  admissionNo: string
  className: string | null
  issuedOn: string
  dueOn: string
  totalMinor: number
  paidMinor: number
  balanceMinor: number
  status: string
  daysOverdue: number
}

export type CollectResult = {
  paymentId: string
  receiptNumber: string
  allocatedMinor: number
  unallocatedMinor: number
  discountedMinor: number
  invoices: { number: string; appliedMinor: number; balanceMinor: number }[]
}

export type PaymentReceipt = {
  id: string
  amountMinor: number
  mode: string
  reference: string | null
  notes: string | null
  paidAt: string | null
  createdAt: string
  receipt: { number: string } | null
  outstandingMinor: number
  advanceMinor: number
  collectedBy: { firstName: string; lastName: string } | null
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNo: string
    enrollments: {
      rollNumber: number | null
      classLevel: { name: string }
      section: { name: string } | null
    }[]
    guardians: { parent: { firstName: string; lastName: string } }[]
  }
  allocations: {
    amountMinor: number
    invoice: {
      number: string
      title: string
      balanceMinor: number
      totalMinor: number
      paidMinor: number
    }
  }[]
}

export type TeachableSubject = {
  id: string
  classLevelId: string
  subject: { name: string; code: string | null }
  classLevel: {
    id: string
    name: string
    sections: { id: string; name: string }[]
  }
}

export type HomeworkSubmission = {
  id: string
  status: string
  score: number | null
  note: string | null
  teacherComment: string | null
  submittedAt: string | null
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNo: string
  }
}

export type HomeworkDetail = {
  homework: {
    id: string
    title: string
    instructions: string | null
    assignedOn: string
    dueOn: string
    maxScore: number | null
    isPublished: boolean
    classLevel: { id: string; name: string }
    section: { id: string; name: string } | null
    classSubject: { subject: { name: string } }
    teacher: { firstName: string; lastName: string }
  }
  submissions: HomeworkSubmission[]
  pending: {
    rollNumber: number | null
    student: { id: string; firstName: string; lastName: string; admissionNo: string }
  }[]
}

export type LeaveType = {
  id: string
  name: string
  isPaid: boolean
}

/* ----------------------------------------------------------- AI evaluation */

export type EvaluationJobRow = {
  id: string
  status: string
  createdAt: string
  _count: { answers: number }
  answerSheet: {
    id: string
    fileName: string
    mimeType: string
    status: string
    pageCount: number
    student: { firstName: string; lastName: string; admissionNo: string | null }
    assignment: { assessment: { id: string; title: string } }
  }
}

export type EvaluatedAnswerRow = {
  id: string
  questionNumber: number | null
  assessmentQuestionId: string | null
  extractedText: string | null
  ocrConfidence: number | null
  evaluationConfidence: number | null
  suggestedMarks: number | null
  maxMarks: number | null
  feedback: string | null
  needsReview: boolean
  reviewStatus: string
  teacherMarks: number | null
  teacherFeedback: string | null
}

export type EvaluationJobDetail = {
  id: string
  status: string
  answers: EvaluatedAnswerRow[]
  answerSheet: {
    id: string
    fileName: string
    mimeType: string
    pageCount: number
    student: { id: string; firstName: string; lastName: string; admissionNo: string | null }
    assignment: {
      id: string
      assessment: { id: string; title: string; totalMarks: number }
    }
  }
}

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type * as T from './types'

/**
 * The typed surface every screen calls.
 *
 * Screens never name a URL — if an endpoint moves, it moves here once. Query
 * keys are arrays so a mutation can invalidate a whole family (`['students']`)
 * without knowing which filters are in play.
 */

/* -------------------------------------------------------------- dashboard */

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<T.Dashboard>('/dashboard').then((r) => r.data),
  })
}

/* --------------------------------------------------------------- students */

const PAGE_SIZE = 25

/**
 * Paged rather than fetched whole. A school with 3,000 students on a phone is
 * the case that decides whether this screen works at all, and the API pages,
 * so the app pages with it.
 */
export function useStudents(search: string) {
  return useInfiniteQuery({
    queryKey: ['students', search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<T.StudentRow[]>('/students', { q: search || undefined, page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (last, all) => (last.data.length < PAGE_SIZE ? undefined : all.length + 1),
  })
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: ['student', id],
    queryFn: () => api.get<T.StudentDetail>(`/students/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

/* ------------------------------------------------------------- attendance */

export function useAttendanceSections(onDate: string) {
  return useQuery({
    queryKey: ['attendance', 'sections', onDate],
    queryFn: () => api.get<T.AttendanceSection[]>('/attendance', { onDate }).then((r) => r.data),
  })
}

export function useAttendanceRegister(sectionId: string, onDate: string) {
  return useQuery({
    queryKey: ['attendance', 'register', sectionId, onDate],
    queryFn: () => api.get<T.Register>('/attendance', { sectionId, onDate }).then((r) => r.data),
    enabled: !!sectionId,
  })
}

export function useMarkAttendance(sectionId: string, onDate: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entries: { studentId: string; status: T.AttendanceStatus }[]) =>
      api.post('/attendance', { sectionId, onDate, entries }),
    onSuccess: () => {
      // The register and the counts on the section list both changed, as did
      // the attendance figure on Home.
      qc.invalidateQueries({ queryKey: ['attendance'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/* ------------------------------------------------------------------- fees */

export function useOutstanding() {
  return useQuery({
    queryKey: ['fees', 'outstanding'],
    queryFn: () => api.get<T.OutstandingRow[]>('/finance/outstanding').then((r) => r.data),
  })
}

/* ---------------------------------------------------------------- notices */

export function useNotices() {
  return useQuery({
    queryKey: ['notices'],
    queryFn: () => api.get<T.Notice[]>('/notices', { limit: 50 }).then((r) => r.data),
  })
}

/* --------------------------------------------------------------- search */

export function useSearch(term: string) {
  return useQuery({
    queryKey: ['search', term],
    queryFn: () => api.get<T.SearchHit[]>('/search', { q: term }).then((r) => r.data),
    // Below three characters the result set is everything, which is no answer.
    enabled: term.trim().length >= 2,
  })
}

/* ---------------------------------------------------------- notifications */

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<T.Notifications>('/notifications', { limit: 30 }).then((r) => r.data),
  })
}

/* ------------------------------------------------------------- admissions */

export function usePipeline() {
  return useQuery({
    queryKey: ['admissions'],
    queryFn: () => api.get<T.Pipeline>('/admissions').then((r) => r.data),
  })
}

export function useMoveStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.post(`/admissions/${id}/stage`, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admissions'] }),
  })
}

/* -------------------------------------------------------------- assistant */

export function useAskAssistant() {
  return useMutation({
    mutationFn: (question: string) =>
      api.post<T.AssistantReply>('/assistant', { question }).then((r) => r.data),
  })
}

export function useAssistantBriefing() {
  return useQuery({
    queryKey: ['assistant', 'briefing'],
    queryFn: () => api.get<T.AssistantBriefing>('/assistant/briefing').then((r) => r.data),
    staleTime: 60_000,
  })
}

/* ---------------------------------------------------------------- parents */

export function useParents(search: string) {
  return useInfiniteQuery({
    queryKey: ['parents', search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<T.Parent[]>('/parents', { q: search || undefined, page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (last, all) => (last.data.length < PAGE_SIZE ? undefined : all.length + 1),
  })
}

/* ------------------------------------------------------------------ staff */

export function useStaff(search: string) {
  return useInfiniteQuery({
    queryKey: ['staff', search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<T.Staff[]>('/staff', { q: search || undefined, page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (last, all) => (last.data.length < PAGE_SIZE ? undefined : all.length + 1),
  })
}

/* --------------------------------------------------------------- homework */

export function useHomework() {
  return useQuery({
    queryKey: ['homework'],
    queryFn: () => api.get<T.Homework[]>('/homework', { limit: 50 }).then((r) => r.data),
  })
}

/* ------------------------------------------------------------------ leave */

export function useLeave(status?: T.LeaveStatus) {
  return useQuery({
    queryKey: ['leave', status ?? 'all'],
    queryFn: () => api.get<T.LeaveRequest[]>('/leave', { status }).then((r) => r.data),
  })
}

/**
 * Approve or reject.
 *
 * The list is invalidated rather than patched in place: deciding a request can
 * change more than its own row — a staff absence writes an attendance record —
 * and re-reading is cheaper than modelling every consequence on the client.
 */
export function useDecideLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: 'APPROVED' | 'REJECTED'; note?: string }) =>
      api.patch(`/leave/${id}`, { status, decisionNote: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['attendance'] })
    },
  })
}

/* -------------------------------------------------------------- transport */

export function useTransportRoutes() {
  return useQuery({
    queryKey: ['transport', 'routes'],
    queryFn: () => api.get<T.TransportRoute[]>('/transport/routes').then((r) => r.data),
  })
}

/* -------------------------------------------------------------- timetable */

/** Personal weekly grid for the signed-in staff member (`mine=1`). */
export function useMyTimetable() {
  return useQuery({
    queryKey: ['timetable', 'mine'],
    queryFn: () => api.get<T.TimetableGrid>('/timetable', { mine: 1 }).then((r) => r.data),
  })
}

/* ------------------------------------------------------------------- exams */

export function useExams() {
  return useQuery({
    queryKey: ['exams'],
    queryFn: () => api.get<T.ExamRow[]>('/exams', { pageSize: 50 }).then((r) => r.data),
  })
}

export function useExamAttendanceDesk(examId: string, examDate?: string) {
  return useQuery({
    queryKey: ['exams', examId, 'attendance', examDate ?? 'default'],
    queryFn: () =>
      api
        .get<T.ExamAttendanceDesk>(`/exams/${examId}/attendance`, {
          examDate: examDate || undefined,
        })
        .then((r) => r.data),
    enabled: !!examId,
  })
}

export function useScanExamAttendance(examId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { examDate: string; barcode: string }) =>
      api
        .post<T.ExamScanResult>(`/exams/${examId}/attendance`, { examId, ...input })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams', examId, 'attendance'] })
    },
  })
}

export function useMarkExamAttendance(examId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { examDate: string; studentId: string; status: 'PRESENT' | 'ABSENT' }) =>
      api.post(`/exams/${examId}/attendance`, { examId, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams', examId, 'attendance'] })
    },
  })
}

export function useExamMarksSetup(examId: string) {
  return useQuery({
    queryKey: ['exams', examId, 'marks', 'setup'],
    queryFn: () => api.get<T.ExamMarksSetup>(`/exams/${examId}/marks`).then((r) => r.data),
    enabled: !!examId,
  })
}

export function useMarksRoster(examId: string, examSubjectId: string) {
  return useQuery({
    queryKey: ['exams', examId, 'marks', examSubjectId],
    queryFn: () =>
      api
        .get<T.MarksRoster>(`/exams/${examId}/marks`, { examSubjectId })
        .then((r) => r.data),
    enabled: !!examId && !!examSubjectId,
  })
}

export function useSaveMarks(examId: string, examSubjectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: {
      studentId: string
      marksObtained: number | null
      isAbsent: boolean
      remarks?: string | null
    }[]) =>
      api.put(`/exams/${examId}/marks`, { examSubjectId, rows }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams', examId, 'marks'] })
    },
  })
}

/* ---------------------------------------------------------- fee collection */

export function useStudentInvoices(studentId: string) {
  return useQuery({
    queryKey: ['finance', 'invoices', studentId],
    queryFn: () =>
      api
        .get<{ invoices: T.InvoiceRow[] }>('/finance/invoices', {
          studentId,
          pageSize: 50,
        })
        .then((r) => r.data.invoices),
    enabled: !!studentId,
  })
}

export function useCollectPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      studentId: string
      amount: number
      mode: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'CARD' | 'UPI' | 'NET_BANKING'
      reference?: string
      notes?: string
      paidOn?: string
      invoiceIds?: string[]
      idempotencyKey: string
    }) => api.post<T.CollectResult>('/finance/collect', input).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fees'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['student'] })
    },
  })
}

export function useReceipt(paymentId: string) {
  return useQuery({
    queryKey: ['finance', 'receipt', paymentId],
    queryFn: () => api.get<T.PaymentReceipt>(`/finance/payments/${paymentId}`).then((r) => r.data),
    enabled: !!paymentId,
  })
}

/* --------------------------------------------------------------- homework */

export function useTeachableSubjects() {
  return useQuery({
    queryKey: ['homework', 'subjects'],
    queryFn: () => api.get<T.TeachableSubject[]>('/homework/subjects').then((r) => r.data),
  })
}

export function useHomeworkDetail(id: string) {
  return useQuery({
    queryKey: ['homework', id],
    queryFn: () => api.get<T.HomeworkDetail>(`/homework/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCreateHomework() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      classSubjectId: string
      sectionId?: string
      title: string
      instructions?: string
      assignedOn: string
      dueOn: string
      maxScore?: number
      isPublished?: boolean
    }) => api.post<T.Homework>('/homework', input).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['homework'] }),
  })
}

export function useUpdateHomework(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<{
      title: string
      instructions: string
      assignedOn: string
      dueOn: string
      maxScore: number
      isPublished: boolean
      sectionId: string
    }>) => api.patch(`/homework/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['homework'] })
      qc.invalidateQueries({ queryKey: ['homework', id] })
    },
  })
}

export function useReviewSubmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      submissionId: string
      status: 'REVIEWED' | 'REDO'
      score?: number
      teacherComment?: string
    }) =>
      api.patch(`/homework/submissions/${input.submissionId}`, {
        status: input.status,
        score: input.score,
        teacherComment: input.teacherComment,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['homework'] }),
  })
}

/* ------------------------------------------------------------------ leave */

export function useLeaveTypes(appliesTo: 'STAFF' | 'STUDENT' = 'STAFF') {
  return useQuery({
    queryKey: ['leave', 'types', appliesTo],
    queryFn: () =>
      api.get<T.LeaveType[]>('/leave/types', { appliesTo }).then((r) => r.data),
  })
}

export function useApplyLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      applicantType: 'STAFF' | 'STUDENT'
      studentId?: string
      leaveTypeId?: string
      fromDate: string
      toDate: string
      reason: string
    }) => api.post('/leave', input).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/* ----------------------------------------------------------- AI evaluation */

export function useEvaluationJobs(enabled = true) {
  return useQuery({
    queryKey: ['evaluation', 'jobs'],
    queryFn: () => api.get<T.EvaluationJobRow[]>('/evaluation/jobs').then((r) => r.data),
    enabled,
  })
}

export function useEvaluationJob(jobId: string) {
  return useQuery({
    queryKey: ['evaluation', 'job', jobId],
    queryFn: () => api.get<T.EvaluationJobDetail>(`/evaluation/jobs/${jobId}`).then((r) => r.data),
    enabled: !!jobId,
  })
}

export function useReviewEvaluatedAnswer(jobId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      answerId: string
      reviewStatus: 'APPROVED' | 'OVERRIDDEN' | 'FLAGGED'
      teacherMarks?: number
      teacherFeedback?: string
    }) =>
      api
        .post(`/evaluation/answers/${input.answerId}/review`, {
          reviewStatus: input.reviewStatus,
          teacherMarks: input.teacherMarks,
          teacherFeedback: input.teacherFeedback,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluation', 'job', jobId] })
      qc.invalidateQueries({ queryKey: ['evaluation', 'jobs'] })
    },
  })
}

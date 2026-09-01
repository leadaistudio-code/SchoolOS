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

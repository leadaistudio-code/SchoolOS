/** Public Academy URLs on academy.mycampusview.com (no `/academy` prefix). */

export const academyHomePath = '/'
export const academyCoursesHash = '/#courses'
export const academyJoinPath = '/join'
export const academyTermsPath = '/terms'

export function academyCoursePath(courseId: string) {
  return `/courses/${courseId}`
}

export function academyJoinWithNext(next: string) {
  return `/join?next=${encodeURIComponent(next)}`
}

export function academyCataloguePath(query?: { q?: string; category?: string }) {
  const params = new URLSearchParams()
  if (query?.q) params.set('q', query.q)
  if (query?.category) params.set('category', query.category)
  const s = params.toString()
  return `${s ? `/?${s}` : '/'}#courses`
}

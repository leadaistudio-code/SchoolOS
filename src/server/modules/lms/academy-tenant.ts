import { env } from '@/lib/env'

/** The platform-run school public learners join. Its own module so the LMS can ask without loading checkout code. */
export function academySlug() {
  return env().ACADEMY_SLUG.toLowerCase()
}

export function isAcademy(tenant: { slug: string } | null | undefined) {
  return !!tenant && tenant.slug === academySlug()
}

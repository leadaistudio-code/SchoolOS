import Link from 'next/link'
import { Award, MonitorPlay, Video } from 'lucide-react'
import { academyCatalogue, academyVisitor, requireAcademyHost, formatRupees } from '@/server/modules/lms/academy'
import { CourseCard } from '@/components/lms/course-card'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchInput } from '@/components/ui/input'
import { LMS_CATEGORIES } from '@/lib/lms/options'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Robotics & AI courses' }

const PROMISES = [
  { icon: MonitorPlay, title: 'Learn at your pace', text: 'Video lessons, notes, code and quizzes you can take any time.' },
  { icon: Video, title: 'Live online classes', text: 'Instructor-led sessions on Zoom or Google Meet, with recordings.' },
  { icon: Award, title: 'Earn a certificate', text: 'Finish a course and get a certificate anyone can verify online.' },
]

export default async function AcademyHomePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const tenant = await requireAcademyHost()
  const { q, category } = await searchParams
  const [courses, visitor] = await Promise.all([
    academyCatalogue(tenant.id, { q, category }),
    academyVisitor(tenant),
  ])
  const filterHref = (value?: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (value) params.set('category', value)
    const s = params.toString()
    return s ? `/academy?${s}` : '/academy'
  }

  return (
    <div>
      <section className="bg-[var(--brand-50)] border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <p className="text-sm font-semibold text-[var(--brand-600)]">Robotics · AI · Coding</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold text-ink max-w-2xl text-balance">
            Build robots and smart machines, from your first circuit to working AI.
          </h1>
          <p className="mt-3 text-lg text-ink-muted max-w-2xl">
            Hands-on courses for school students and anyone curious about technology.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3 max-w-4xl">
            {PROMISES.map((p) => (
              <div key={p.title} className="flex gap-3">
                <span className="size-10 shrink-0 rounded-[var(--radius)] bg-surface border border-line grid place-items-center text-[var(--brand-600)]">
                  <p.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-medium text-ink">{p.title}</p>
                  <p className="text-sm text-ink-muted">{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-ink">Courses</h2>
          <form action="/academy" className="w-full sm:w-72">
            {category ? <input type="hidden" name="category" value={category} /> : null}
            <SearchInput name="q" defaultValue={q ?? ''} placeholder="Search courses" aria-label="Search courses" />
          </form>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Filter by topic">
          {[{ value: '', label: 'All' }, ...LMS_CATEGORIES].map((c) => (
            <Link
              key={c.value || 'all'}
              href={filterHref(c.value || undefined)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                (category ?? '') === c.value
                  ? 'border-[var(--brand-500)] bg-[var(--brand-500)] text-[var(--brand-contrast)]'
                  : 'border-line bg-surface text-ink-muted hover:text-ink',
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>

        {courses.length === 0 ? (
          <Card>
            <EmptyState
              title={q || category ? 'No courses match' : 'Courses are on their way'}
              description={q || category ? 'Try another search or topic.' : 'New courses are being prepared. Check back soon.'}
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => {
              const owned = visitor?.owned.has(c.id)
              return (
                <CourseCard
                  key={c.id}
                  href={`/academy/courses/${c.id}`}
                  title={c.title}
                  subtitle={c.subtitle}
                  category={c.category}
                  level={c.level}
                  gradeFrom={c.gradeFrom}
                  gradeTo={c.gradeTo}
                  lessons={c.lessons}
                  minutes={c.minutes}
                  badge={
                    owned ? (
                      <Badge tone="success">Enrolled</Badge>
                    ) : (
                      <Badge tone={c.priceMinor === 0 ? 'success' : 'brand'}>{c.priceMinor === 0 ? 'Free' : formatRupees(c.priceMinor)}</Badge>
                    )
                  }
                  footer={c.learners >= 10 ? `${c.learners} learners` : undefined}
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

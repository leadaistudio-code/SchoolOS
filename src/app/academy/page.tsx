import Link from 'next/link'
import { ArrowUpRight, Search } from 'lucide-react'
import { academyCatalogue, academyVisitor, requireAcademyHost, formatRupees } from '@/server/modules/lms/academy'
import { AcademyHero } from '@/components/academy/hero'
import { CourseRows } from '@/components/academy/course-rows'
import { TrackSteps, type TrackStep } from '@/components/academy/track-steps'
import { SubjectField } from '@/components/academy/subject-field'
import { ACADEMY_ART } from '@/components/academy/art'
import { EditorialHeading } from '@/components/site/motion/editorial-heading'
import { Doodle } from '@/components/site/motion/doodle'
import { LMS_CATEGORIES } from '@/lib/lms/options'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Robotics & AI courses' }

const STEPS: TrackStep[] = [
  {
    title: 'Watch a step, then build it.',
    body: 'Lessons are short videos with the notes and the wiring written underneath. Pause, build that step on your desk, and carry on when it works. The course stays in your account, so you can go back as often as you need.',
    image: ACADEMY_ART.kit,
  },
  {
    title: 'Write the code, check yourself.',
    body: 'Code lessons give you the program to copy and change. Quizzes mark themselves and tell you why an answer is wrong, so a mistake teaches you something instead of just costing marks.',
    image: ACADEMY_ART.coding,
  },
  {
    title: 'Ask a person when you are stuck.',
    body: 'Some courses run live classes online, with the recording kept for anyone who missed it. Projects you hand in are reviewed by an instructor, who can send them back with notes.',
    image: ACADEMY_ART.live,
  },
  {
    title: 'Finish, and it is on record.',
    body: 'Complete every lesson and the certificate is issued straight away. Each one carries a code, so a school or a parent can check it is genuine in a few seconds.',
    image: ACADEMY_ART.certificate,
  },
]

export default async function AcademyHomePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const tenant = await requireAcademyHost()
  const { q, category } = await searchParams
  const filtered = !!(q || category)
  const [all, visitor] = await Promise.all([academyCatalogue(tenant.id), academyVisitor(tenant)])
  const courses = filtered ? await academyCatalogue(tenant.id, { q, category }) : all

  const counts = new Map<string, number>()
  for (const c of all) counts.set(c.category, (counts.get(c.category) ?? 0) + 1)
  const subjects = LMS_CATEGORIES.filter((c) => c.value !== 'OTHER').map((c) => ({
    value: c.value,
    label: c.label,
    count: counts.get(c.value) ?? 0,
  }))
  const tabs = [{ value: '', label: 'All', count: all.length }, ...subjects.filter((s) => s.count > 0)]

  const free = all.find((c) => c.priceMinor === 0 && !visitor?.owned.has(c.id))
  const primary = visitor
    ? { href: '/my/learning', label: 'Go to my learning' }
    : free
      ? { href: `/academy/courses/${free.id}`, label: 'Start the free course' }
      : { href: '/academy/join', label: 'Create a free account' }

  const filterHref = (value?: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (value) params.set('category', value)
    const s = params.toString()
    return `${s ? `/academy?${s}` : '/academy'}#courses`
  }

  return (
    <>
      <AcademyHero courseCount={all.length} primary={primary} />

      <section id="courses" className="scroll-mt-16 bg-white px-[var(--gutter)] py-24 sm:py-32">
        <div className="mx-auto max-w-[78rem]">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="relative w-fit">
              <EditorialHeading lines={[{ text: 'Courses', soft: 'you can' }, { soft: 'start', text: 'today.', softFirst: true }]} />
              <Doodle
                name="underline"
                color="var(--ed-amber)"
                className="absolute -bottom-3 right-0 h-5 w-[48%] sm:h-6"
                delay={400}
              />
            </div>
            <form action="/academy#courses" className="relative w-full lg:w-80" role="search">
              {category ? <input type="hidden" name="category" value={category} /> : null}
              <Search className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" aria-hidden />
              <input
                name="q"
                defaultValue={q ?? ''}
                placeholder="Search by topic or project"
                aria-label="Search courses"
                className="h-12 w-full border-0 border-b border-[var(--rule-strong)] bg-transparent pl-7 text-[16px] text-[var(--ed-ink)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--ed-ink)]"
              />
            </form>
          </div>

          {tabs.length > 2 || filtered ? (
            <nav aria-label="Filter by subject" className="mt-14 flex flex-wrap gap-x-7 gap-y-3 text-[15px]">
              {tabs.map((t) => {
                const active = (category ?? '') === t.value
                return (
                  <Link
                    key={t.value || 'all'}
                    href={filterHref(t.value || undefined)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'border-b pb-1 transition-colors',
                      active
                        ? 'border-[var(--ed-ink)] font-medium text-[var(--ed-ink)]'
                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--ed-ink)]',
                    )}
                  >
                    {t.label}
                    <span className="ml-1.5 text-[13px] tabular-nums text-[var(--text-subtle)]">{t.count}</span>
                  </Link>
                )
              })}
            </nav>
          ) : null}

          <div className="mt-10">
            {courses.length === 0 ? (
              <div className="border-y border-[var(--rule)] py-16">
                <p className="ed-display text-[clamp(1.5rem,2.4vw,2rem)]">
                  {filtered ? 'Nothing matches that yet.' : 'The first courses are being recorded.'}
                </p>
                <p className="mt-3 max-w-[48ch] text-[16px] text-[var(--text-muted)]">
                  {filtered
                    ? 'Try a shorter search, or look through every course instead.'
                    : 'Create a free account and they will be waiting in your list when they open.'}
                </p>
                {filtered ? (
                  <Link href="/academy#courses" className="ed-link mt-6 text-[15px] text-[var(--ed-ink)]">
                    Show every course
                    <ArrowUpRight className="size-[1em]" aria-hidden />
                  </Link>
                ) : null}
              </div>
            ) : (
              <CourseRows
                courses={courses.map((c) => ({
                  ...c,
                  price: c.priceMinor === 0 ? 'Free' : formatRupees(c.priceMinor),
                  owned: visitor?.owned.has(c.id) ?? false,
                }))}
              />
            )}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--rule)] bg-[var(--page)] px-[var(--gutter)] py-24 sm:py-32">
        <div className="mx-auto max-w-[78rem]">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:items-end">
            <EditorialHeading lines={[{ text: 'How a course', soft: 'actually' }, { text: 'works.' }]} />
            <p className="max-w-[44ch] text-[17px] leading-[1.6] text-[var(--text-muted)]">
              The same four things in every course, in the same order. You always know what the next step
              is and who to ask when it goes wrong.
            </p>
          </div>
          <div className="mt-20">
            <TrackSteps steps={STEPS} />
          </div>
        </div>
      </section>

      <section className="ed-black-ground overflow-hidden px-[var(--gutter)] py-24 sm:py-32">
        <div className="on-ed-black mx-auto max-w-[70rem] text-center">
          <EditorialHeading
            align="center"
            className="mx-auto max-w-[16ch]"
            lines={[{ text: 'Pick what', soft: 'you want' }, { soft: 'to', text: 'build next.', softFirst: true }]}
          />
          <p className="mx-auto mt-8 max-w-[46ch] text-[16px] leading-[1.6] text-[var(--ed-on-black-soft)]">
            Start wherever you like: every course begins from the basics. The number beside a subject is how
            many of its courses are open today.
          </p>
          <div className="mt-16">
            <SubjectField subjects={subjects} />
          </div>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            <Link href={primary.href} className="ed-link text-[18px] text-white">
              {primary.label}
              <ArrowUpRight className="size-[1em]" aria-hidden />
            </Link>
            {!visitor ? (
              <Link href="/login?next=/my/learning" className="ed-link text-[16px] text-[var(--ed-on-black-soft)] hover:text-white">
                I already have an account
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </>
  )
}

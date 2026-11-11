import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import {
  academyCourse,
  academyVisitor,
  formatRupees,
  paymentMode,
  requireAcademyHost,
} from '@/server/modules/lms/academy'
import { Notice } from '@/components/ui/states'
import { LessonText } from '@/components/lms/lesson-text'
import { KindIcon } from '@/components/lms/kind-icon'
import { courseArt, formatDuration } from '@/components/academy/art'
import { gradeRange, lessonKind, lmsCategory, lmsLevelLabel } from '@/lib/lms/options'
import { BuyButton } from '../../buy-button'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireAcademyHost()
  const { id } = await params
  const course = await academyCourse(tenant.id, id)
  return { title: course?.title ?? 'Course', description: course?.subtitle ?? undefined }
}

const PILL =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[15.5px] font-medium transition-transform duration-300 hover:scale-[1.015]'

export default async function AcademyCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireAcademyHost()
  const { id } = await params
  const [course, visitor] = await Promise.all([academyCourse(tenant.id, id), academyVisitor(tenant)])
  if (!course) notFound()

  const lessons = course.modules.flatMap((m) => m.lessons)
  const minutes = lessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0)
  const category = lmsCategory(course.category)
  const grades = gradeRange(course.gradeFrom, course.gradeTo)
  const owned = visitor?.owned.has(course.id) ?? false
  const free = course.priceMinor === 0
  const here = `/academy/courses/${course.id}`
  const art = courseArt(course.category)
  const kinds = new Set(lessons.map((l) => l.kind))

  const facts = [
    { label: 'Lessons', value: `${lessons.length} in ${course.modules.length} part${course.modules.length === 1 ? '' : 's'}` },
    minutes ? { label: 'Lesson time', value: formatDuration(minutes)! } : null,
    { label: 'Level', value: lmsLevelLabel(course.level) },
    grades ? { label: 'Suits', value: grades } : null,
  ].filter((f): f is { label: string; value: string } => !!f)

  const includes = [
    kinds.has('VIDEO') ? 'Video lessons with notes' : null,
    kinds.has('CODE') ? 'Code you can copy and change' : null,
    kinds.has('QUIZ') ? 'Quizzes that explain each answer' : null,
    kinds.has('PROJECT') ? 'Projects reviewed by an instructor' : null,
    course.hasLiveClasses ? 'Live online classes, with recordings' : null,
    'A certificate anyone can verify',
  ].filter((s): s is string => !!s)

  return (
    <>
      <section className="border-b border-[var(--rule)] bg-white px-[var(--gutter)] pb-16 pt-10 sm:pb-20 sm:pt-14">
        <div className="mx-auto max-w-[78rem]">
          <Link
            href="/academy#courses"
            className="inline-flex items-center gap-1.5 text-[14px] text-[var(--text-muted)] transition-colors hover:text-[var(--ed-ink)]"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> All courses
          </Link>

          <div className="mt-10 grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
            <div className="reveal">
              <p className="text-[14px] font-medium text-[var(--text-muted)]">
                <span className="mr-2 inline-block size-2 rounded-full align-middle" style={{ background: category.colour }} />
                {category.label}
              </p>
              <h1 className="ed-display mt-5 text-[clamp(2.4rem,5.2vw,4.4rem)]">{course.title}</h1>
              {course.subtitle ? (
                <p className="mt-6 max-w-[44ch] text-[clamp(1.05rem,1.4vw,1.25rem)] leading-[1.55] text-[var(--text-muted)]">
                  {course.subtitle}
                </p>
              ) : null}
              <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-[var(--rule)] pt-6 sm:grid-cols-4">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt className="text-[13px] text-[var(--text-subtle)]">{f.label}</dt>
                    <dd className="mt-1 text-[15.5px] font-medium text-[var(--ed-ink)]">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <Image
              src={art.src}
              alt={art.alt}
              width={1024}
              height={768}
              priority
              sizes="(min-width: 1024px) 480px, 100vw"
              className="reveal aspect-[4/3] w-full rounded-xl border border-[var(--rule)] bg-[var(--page)] object-cover"
            />
          </div>
        </div>
      </section>

      <div className="bg-white px-[var(--gutter)] py-16 sm:py-20">
        <div className="mx-auto grid max-w-[78rem] gap-14 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-20">
          <div className="order-2 space-y-16 lg:order-1">
            {course.outcomes.length ? (
              <section data-reveal>
                <h2 className="ed-display text-[clamp(1.6rem,2.6vw,2.2rem)]">What you will be able to do</h2>
                <ol className="mt-8 grid gap-x-10 sm:grid-cols-2">
                  {course.outcomes.map((o, i) => (
                    <li key={o} className="flex gap-4 border-t border-[var(--rule)] py-4 text-[16px] leading-[1.5] text-[var(--ed-ink)]">
                      <span className="w-6 shrink-0 pt-px text-[13px] tabular-nums text-[var(--text-subtle)]">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {o}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {course.description ? (
              <section data-reveal>
                <h2 className="ed-display text-[clamp(1.6rem,2.6vw,2.2rem)]">About the course</h2>
                <LessonText
                  text={course.description}
                  className="mt-6 max-w-[64ch] text-[16.5px] leading-[1.7] text-[color:var(--text-muted)]"
                />
              </section>
            ) : null}

            <section data-reveal>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="ed-display text-[clamp(1.6rem,2.6vw,2.2rem)]">What is inside</h2>
                <p className="text-[14px] text-[var(--text-subtle)]">
                  {lessons.length} lessons{minutes ? ` · ${formatDuration(minutes)}` : ''}
                </p>
              </div>
              <div className="mt-8 space-y-10">
                {course.modules.map((m, mi) => (
                  <div key={m.id}>
                    <h3 className="flex items-baseline gap-3 text-[18px] font-semibold">
                      <span className="text-[13px] font-medium tabular-nums text-[var(--text-subtle)]">Part {mi + 1}</span>
                      {m.title}
                    </h3>
                    <ul className="mt-3 border-b border-[var(--rule)]">
                      {m.lessons.map((l) => (
                        <li key={l.id} className="flex items-center gap-4 border-t border-[var(--rule)] py-3.5 text-[15.5px]">
                          <KindIcon kind={l.kind} className="text-[var(--text-subtle)]" />
                          <span className="min-w-0 flex-1 text-[var(--ed-ink)]">{l.title}</span>
                          <span className="whitespace-nowrap text-[13.5px] text-[var(--text-subtle)]">
                            {lessonKind(l.kind).label}
                            {l.durationMinutes ? ` · ${l.durationMinutes} min` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="order-1 self-start lg:sticky lg:top-24 lg:order-2">
            <div className="rounded-2xl border border-[var(--rule)] bg-white p-7">
              <p className="text-[13px] text-[var(--text-subtle)]">{owned ? 'In your account' : free ? 'Price' : 'One payment'}</p>
              <p className="mt-1 text-[2.6rem] font-semibold leading-none tracking-[-0.03em] text-[var(--ed-ink)] tabular-nums">
                {owned ? 'Enrolled' : free ? 'Free' : formatRupees(course.priceMinor)}
              </p>

              <ul className="mt-7 space-y-2.5 border-t border-[var(--rule)] pt-6 text-[15px] text-[var(--text-muted)]">
                {includes.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden className="mt-[0.6em] h-px w-3 shrink-0 bg-[var(--ed-amber)]" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-8 space-y-3">
                {owned ? (
                  <Link href={`/my/learning/${course.id}`} className={`${PILL} bg-[var(--ed-ink)] text-white`}>
                    Go to the course <ArrowRight className="size-4" aria-hidden />
                  </Link>
                ) : visitor?.isLearner ? (
                  paymentMode() === 'off' && !free ? (
                    <Notice tone="warning">Online payments open soon. Please check back shortly.</Notice>
                  ) : (
                    <BuyButton
                      courseId={course.id}
                      label={free ? 'Enrol for free' : `Buy for ${formatRupees(course.priceMinor)}`}
                      simulated={paymentMode() === 'simulated'}
                      className="h-12 rounded-full text-[15.5px]"
                    />
                  )
                ) : visitor ? (
                  <Notice tone="info">This account is not a learner account. Sign in with your Academy account to enrol.</Notice>
                ) : (
                  <>
                    <Link href={`/academy/join?next=${encodeURIComponent(here)}`} className={`${PILL} bg-[var(--ed-ink)] text-white`}>
                      {free ? 'Join free to start' : 'Create an account to buy'}
                    </Link>
                    <Link
                      href={`/login?next=${encodeURIComponent(here)}`}
                      className={`${PILL} border border-[var(--rule-strong)] text-[var(--ed-ink)] hover:border-[var(--ed-ink)]`}
                    >
                      I already have an account
                    </Link>
                  </>
                )}
              </div>

              {!free && !owned ? (
                <p className="mt-5 text-[13px] leading-[1.55] text-[var(--text-subtle)]">
                  Pay with UPI, card, net banking or a wallet. Changed your mind? See the{' '}
                  <Link href="/academy/terms" className="underline underline-offset-2 hover:text-[var(--ed-ink)]">
                    refund policy
                  </Link>
                  .
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { gradeRange, lmsCategory, lmsLevelLabel } from '@/lib/lms/options'
import { courseArt, formatDuration } from './art'

export type CourseRow = {
  id: string
  title: string
  subtitle: string | null
  category: string
  level: string
  gradeFrom: number | null
  gradeTo: number | null
  lessons: number
  minutes: number
  price: string
  owned: boolean
  learners: number
}

/**
 * The catalogue as a run of rows rather than a grid of tiles: a course is
 * something to read about before it is something to click, and a row gives
 * the title the width to be read at display size.
 */
export function CourseRows({ courses }: { courses: CourseRow[] }) {
  return (
    <ol className="border-b border-[var(--rule)]" data-reveal-stagger>
      {courses.map((c) => {
        const art = courseArt(c.category)
        const facts = [
          `${c.lessons} lesson${c.lessons === 1 ? '' : 's'}`,
          formatDuration(c.minutes),
          gradeRange(c.gradeFrom, c.gradeTo),
          c.learners >= 10 ? `${c.learners} learners` : null,
        ].filter(Boolean)
        return (
          <li key={c.id} data-reveal className="border-t border-[var(--rule)]">
            <Link
              href={`/academy/courses/${c.id}`}
              className="group grid items-center gap-6 py-8 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-10 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto] lg:py-10"
            >
              <div className="overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--page)]">
                <Image
                  src={art.src}
                  alt={art.alt}
                  width={1024}
                  height={768}
                  sizes="(min-width: 1024px) 272px, (min-width: 640px) 240px, 100vw"
                  className="aspect-[4/3] w-full object-cover transition-transform duration-700 ease-[var(--ed-ease)] group-hover:scale-[1.04]"
                />
              </div>

              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-[var(--ed-ink-soft)]">
                  {lmsCategory(c.category).label}
                  <span className="mx-1.5 text-[var(--rule-strong)]">/</span>
                  {lmsLevelLabel(c.level)}
                </p>
                <h3 className="ed-display mt-3 text-[clamp(1.6rem,2.6vw,2.25rem)] !leading-[1.05]">
                  {c.title}
                </h3>
                {c.subtitle ? (
                  <p className="mt-3 max-w-[52ch] text-[16px] leading-[1.55] text-[var(--text-muted)]">{c.subtitle}</p>
                ) : null}
                <p className="mt-4 text-[14px] text-[var(--text-subtle)]">{facts.join('  ·  ')}</p>
              </div>

              <div className="flex items-center justify-between gap-6 sm:col-start-2 lg:col-start-auto lg:flex-col lg:items-end lg:justify-center lg:self-stretch">
                <span className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--ed-ink)] tabular-nums">
                  {c.owned ? 'Enrolled' : c.price}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[var(--ed-ink)]">
                  <span className="border-b border-current pb-0.5">{c.owned ? 'Continue' : 'View course'}</span>
                  <ArrowUpRight
                    className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </div>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

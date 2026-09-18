import * as React from 'react'
import Link from 'next/link'
import {
  BadgeIndianRupee,
  BookOpen,
  BriefcaseBusiness,
  BusFront,
  CalendarCheck,
  ChartNoAxesCombined,
  ClipboardCheck,
  Globe2,
  GraduationCap,
  LayoutGrid,
  Library,
  MessageSquareText,
  Package,
  ShieldCheck,
  Trophy,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type Crumb = { label: string; href?: string }

type HeaderPresentation = {
  icon: LucideIcon
  iconClassName: string
  washClassName: string
}

const HEADER_PRESENTATIONS: Array<{
  keywords: string[]
  presentation: HeaderPresentation
}> = [
  {
    keywords: ['fee', 'finance', 'invoice', 'payment', 'receipt', 'concession', 'discount', 'expense'],
    presentation: {
      icon: BadgeIndianRupee,
      iconClassName: 'bg-info text-white',
      washClassName: 'bg-info-bg',
    },
  },
  {
    keywords: ['attendance', 'leave'],
    presentation: {
      icon: CalendarCheck,
      iconClassName: 'bg-success text-white',
      washClassName: 'bg-success-bg',
    },
  },
  {
    keywords: ['exam', 'assessment', 'result', 'grade', 'report card', 'certificate', 'question'],
    presentation: {
      icon: ClipboardCheck,
      iconClassName: 'bg-warning text-white',
      washClassName: 'bg-warning-bg',
    },
  },
  {
    keywords: ['academic', 'class', 'subject', 'curriculum', 'syllabus', 'timetable', 'homework', 'classwork'],
    presentation: {
      icon: GraduationCap,
      iconClassName: 'bg-[var(--product-500)] text-white',
      washClassName: 'bg-[var(--product-50)]',
    },
  },
  {
    keywords: ['student', 'parent', 'guardian'],
    presentation: {
      icon: UsersRound,
      iconClassName: 'bg-[var(--chart-students)] text-white',
      washClassName: 'bg-[var(--product-50)]',
    },
  },
  {
    keywords: ['staff', 'teacher', 'faculty', 'payroll', 'appraisal'],
    presentation: {
      icon: BriefcaseBusiness,
      iconClassName: 'bg-[var(--chart-staff)] text-white',
      washClassName: 'bg-warning-bg',
    },
  },
  {
    keywords: ['admission', 'visitor', 'front office'],
    presentation: {
      icon: UserPlus,
      iconClassName: 'bg-[var(--chart-admissions)] text-white',
      washClassName: 'bg-[var(--product-50)]',
    },
  },
  {
    keywords: ['transport', 'bus', 'route', 'tracking'],
    presentation: {
      icon: BusFront,
      iconClassName: 'bg-[var(--chart-transport)] text-white',
      washClassName: 'bg-info-bg',
    },
  },
  {
    keywords: ['notice', 'message', 'communication', 'feedback', 'event'],
    presentation: {
      icon: MessageSquareText,
      iconClassName: 'bg-[var(--chart-parents)] text-white',
      washClassName: 'bg-success-bg',
    },
  },
  {
    keywords: ['report', 'analytics', 'score', 'roi', 'insight'],
    presentation: {
      icon: ChartNoAxesCombined,
      iconClassName: 'bg-info text-white',
      washClassName: 'bg-info-bg',
    },
  },
  {
    keywords: ['library', 'book', 'loan'],
    presentation: {
      icon: Library,
      iconClassName: 'bg-success text-white',
      washClassName: 'bg-success-bg',
    },
  },
  {
    keywords: ['inventory', 'stock', 'asset'],
    presentation: {
      icon: Package,
      iconClassName: 'bg-warning text-white',
      washClassName: 'bg-warning-bg',
    },
  },
  {
    keywords: ['sport', 'house', 'competition'],
    presentation: {
      icon: Trophy,
      iconClassName: 'bg-[var(--chart-staff)] text-white',
      washClassName: 'bg-warning-bg',
    },
  },
  {
    keywords: ['website', 'page', 'domain'],
    presentation: {
      icon: Globe2,
      iconClassName: 'bg-info text-white',
      washClassName: 'bg-info-bg',
    },
  },
  {
    keywords: ['account', 'password', 'security', 'permission', 'role', 'audit'],
    presentation: {
      icon: ShieldCheck,
      iconClassName: 'bg-success text-white',
      washClassName: 'bg-success-bg',
    },
  },
  {
    keywords: ['lesson', 'learning'],
    presentation: {
      icon: BookOpen,
      iconClassName: 'bg-[var(--product-500)] text-white',
      washClassName: 'bg-[var(--product-50)]',
    },
  },
]

const DEFAULT_PRESENTATION: HeaderPresentation = {
  icon: LayoutGrid,
  iconClassName: 'bg-[var(--product-500)] text-white',
  washClassName: 'bg-[var(--product-50)]',
}

function headerPresentation(title: string, breadcrumbs?: Crumb[]): HeaderPresentation {
  const context = `${breadcrumbs?.map((crumb) => crumb.label).join(' ') ?? ''} ${title}`.toLowerCase()
  return (
    HEADER_PRESENTATIONS.find(({ keywords }) =>
      keywords.some((keyword) => context.includes(keyword)),
    )?.presentation ?? DEFAULT_PRESENTATION
  )
}

/**
 * Page header.
 *
 * Title, one line of context that carries real information (counts, dates,
 * identifiers — not a description of what the page is for), and the primary
 * action. Breadcrumbs appear only where a page sits inside a record or a
 * multi-level module.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  media,
  className,
}: {
  title: string
  /**
   * One line of factual context — counts, session, identifiers, dates. Not a
   * description of what the page does.
   */
  description?: React.ReactNode
  breadcrumbs?: Crumb[]
  actions?: React.ReactNode
  /**
   * A visual sitting to the left of the title — a record's avatar, say. Optional
   * so every existing header is unchanged; where present it stays on every tab.
   */
  media?: React.ReactNode
  className?: string
}) {
  const presentation = headerPresentation(title, breadcrumbs)
  const HeaderIcon = presentation.icon
  const headerMedia = media ?? (
    <div
      className={cn(
        'grid size-11 place-items-center rounded-[var(--radius)] shadow-sm',
        presentation.iconClassName,
      )}
      aria-hidden
    >
      <HeaderIcon className="size-6" />
    </div>
  )

  return (
    <div
      className={cn(
        'mb-4 rounded-[var(--radius-lg)] px-3 py-3 sm:px-4',
        presentation.washClassName,
        className,
      )}
    >
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-1.5">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
            {breadcrumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <span aria-hidden>/</span> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0">{headerMedia}</div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-ink truncate">{title}</h1>
            {description ? <p className="text-sm text-ink-muted mt-0.5">{description}</p> : null}
          </div>
        </div>
        {actions ? (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>
    </div>
  )
}

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Illustration set.
 *
 * Drawn as inline SVG rather than shipped as images. Three reasons, in order:
 * nothing here can 404 or arrive after the layout has settled, each scene
 * costs about a kilobyte instead of a network round trip, and the colours are
 * expressed as theme tokens so a scene that reads well on white does not turn
 * into a bright rectangle in dark mode.
 *
 * All of these are decoration. They carry no information that is not also in
 * the text beside them, so they are hidden from assistive technology.
 */

/** Sidebar footer: a school with a bus pulling away. Wide and short. */
export function SchoolScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 64" className={cn('block', className)} aria-hidden preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="ill-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--product-500)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--product-500)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="240" height="64" fill="url(#ill-sky)" />

      {/* Ground */}
      <path d="M0 54h240v10H0z" fill="var(--product-500)" opacity="0.22" />
      <path d="M0 54h240" stroke="var(--product-500)" strokeOpacity="0.4" strokeWidth="1" />

      {/* Trees */}
      <g fill="var(--chart-attendance)" opacity="0.55">
        <circle cx="26" cy="43" r="8" />
        <circle cx="214" cy="45" r="6" />
      </g>
      <g stroke="var(--chart-attendance)" strokeOpacity="0.7" strokeWidth="1.5">
        <path d="M26 50v4M214 51v3" />
      </g>

      {/* School building */}
      <g>
        <path d="M96 54V32l24-12 24 12v22z" fill="var(--sidebar-ill-ink)" opacity="0.9" />
        <path d="M120 20 96 32h48z" fill="var(--product-500)" />
        <rect x="114" y="42" width="12" height="12" rx="1" fill="var(--product-500)" opacity="0.85" />
        <g fill="var(--product-500)" opacity="0.5">
          <rect x="102" y="36" width="7" height="6" rx="1" />
          <rect x="131" y="36" width="7" height="6" rx="1" />
        </g>
        <path d="M120 20v-6" stroke="var(--sidebar-ill-ink)" strokeWidth="1.2" opacity="0.7" />
        <path d="M120 14h7l-2.5 3 2.5 3h-7z" fill="var(--chart-overdue)" opacity="0.9" />
      </g>

      {/* Bus */}
      <g transform="translate(158 36)">
        <rect width="34" height="16" rx="4" fill="var(--chart-staff)" />
        <rect x="3" y="3" width="9" height="6" rx="1.5" fill="var(--sidebar-bg-deep)" opacity="0.55" />
        <rect x="15" y="3" width="9" height="6" rx="1.5" fill="var(--sidebar-bg-deep)" opacity="0.55" />
        <circle cx="9" cy="17" r="2.6" fill="var(--sidebar-ill-ink)" opacity="0.85" />
        <circle cx="26" cy="17" r="2.6" fill="var(--sidebar-ill-ink)" opacity="0.85" />
      </g>

      {/* Path markings */}
      <g stroke="var(--sidebar-ill-ink)" strokeOpacity="0.25" strokeWidth="2" strokeLinecap="round">
        <path d="M46 59h10M64 59h10M82 59h10" />
      </g>
    </svg>
  )
}

/** Welcome banner: two pupils, books and a paper plane. */
export function StudentsScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 150" className={cn('block', className)} aria-hidden>
      {/* Pupil, left */}
      <g transform="translate(58 30)">
        <path d="M6 74c0-16 8-26 22-26s22 10 22 26z" fill="var(--chart-students)" />
        <rect x="14" y="40" width="36" height="16" rx="6" fill="var(--chart-students)" opacity="0.7" />
        <circle cx="28" cy="24" r="15" fill="var(--chart-staff)" opacity="0.85" />
        <path d="M13 22c0-9 7-15 15-15s15 6 15 15c0-4-6-6-15-6s-15 2-15 6z" fill="var(--text)" opacity="0.75" />
        <g fill="var(--text)" opacity="0.7">
          <circle cx="23" cy="24" r="1.6" />
          <circle cx="34" cy="24" r="1.6" />
        </g>
        <path d="M24 30q4 3 8 0" stroke="var(--text)" strokeOpacity="0.6" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {/* Backpack strap */}
        <path d="M18 46v26M40 46v26" stroke="var(--chart-admissions)" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      </g>

      {/* Pupil, right, waving */}
      <g transform="translate(132 38)">
        <path d="M4 66c0-14 7-23 20-23s20 9 20 23z" fill="var(--chart-transport)" />
        <circle cx="24" cy="22" r="13.5" fill="var(--chart-staff)" opacity="0.75" />
        <path d="M10 21c0-8 6-14 14-14s14 6 14 14c-2-5-7-7-14-7s-12 2-14 7z" fill="var(--text)" opacity="0.7" />
        <g fill="var(--text)" opacity="0.7">
          <circle cx="20" cy="22" r="1.5" />
          <circle cx="29" cy="22" r="1.5" />
        </g>
        <path d="M20 27q4 3 8 0" stroke="var(--text)" strokeOpacity="0.6" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        {/* Raised arm */}
        <path d="M42 48 54 32" stroke="var(--chart-transport)" strokeWidth="6" strokeLinecap="round" />
        <circle cx="56" cy="29" r="4.5" fill="var(--chart-staff)" opacity="0.85" />
        {/* Books under the other arm */}
        <g transform="translate(-8 44)">
          <rect width="18" height="5" rx="1.5" fill="var(--chart-overdue)" />
          <rect y="6" width="18" height="5" rx="1.5" fill="var(--chart-fees)" />
          <rect y="12" width="18" height="5" rx="1.5" fill="var(--chart-attendance)" />
        </g>
      </g>

      {/* Paper plane */}
      <g transform="translate(196 24)" opacity="0.9">
        <path d="M0 8 22 0l-7 20-4-8z" fill="var(--product-500)" />
        <path d="M11 12 22 0l-7 20z" fill="var(--product-700)" opacity="0.7" />
      </g>
      <path
        d="M4 40q26 -18 52 -4"
        stroke="var(--product-500)"
        strokeOpacity="0.3"
        strokeWidth="1.5"
        strokeDasharray="3 5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Graduation cap */}
      <g transform="translate(20 84)" opacity="0.85">
        <path d="M0 6 16 0l16 6-16 6z" fill="var(--chart-admissions)" />
        <path d="M6 9v7c0 2 20 2 20 0V9l-10 4z" fill="var(--chart-admissions)" opacity="0.7" />
      </g>

      {/* Ground shadow */}
      <ellipse cx="130" cy="132" rx="96" ry="8" fill="var(--text)" opacity="0.05" />
    </svg>
  )
}

/** Admissions banner: an application form with a pencil and a spark. */
export function AdmissionsScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn('block', className)} aria-hidden>
      <circle cx="80" cy="60" r="46" fill="#fff" opacity="0.12" />

      {/* Form */}
      <g transform="translate(44 20)">
        <rect width="62" height="80" rx="7" fill="#fff" />
        <rect x="10" y="12" width="30" height="5" rx="2.5" fill="#60a5fa" />
        <g fill="#93c5fd">
          <rect x="10" y="26" width="42" height="4" rx="2" />
          <rect x="10" y="36" width="34" height="4" rx="2" />
          <rect x="10" y="46" width="40" height="4" rx="2" />
          <rect x="10" y="56" width="24" height="4" rx="2" />
        </g>
        <rect x="10" y="66" width="26" height="8" rx="4" fill="#34d399" />
      </g>

      {/* Pencil */}
      <g transform="rotate(38 118 62)">
        <rect x="108" y="30" width="9" height="42" rx="2" fill="#fbbf24" />
        <path d="M108 72h9l-4.5 9z" fill="#1e293b" opacity="0.75" />
        <rect x="108" y="30" width="9" height="7" rx="2" fill="#fb7185" />
      </g>

      {/* Approval tick */}
      <g transform="translate(96 74)">
        <circle r="14" cx="14" cy="14" fill="#10b981" />
        <path d="M8 14.5 12.5 19 21 10" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

/** Students banner art: two pupils on a light plate for coloured heroes. */
export function StudentsBannerScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn('block', className)} aria-hidden>
      <circle cx="80" cy="60" r="46" fill="#fff" opacity="0.12" />
      <g transform="translate(38 28)">
        <path d="M8 62c0-14 7-22 20-22s20 8 20 22z" fill="#fff" opacity="0.95" />
        <circle cx="28" cy="22" r="13" fill="#fde68a" />
        <path d="M15 20c0-8 6-13 13-13s13 5 13 13c0-4-5-6-13-6s-13 2-13 6z" fill="#1e293b" opacity="0.7" />
        <path d="M18 40v20M38 40v20" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g transform="translate(88 34)">
        <path d="M4 56c0-12 6-20 18-20s18 8 18 20z" fill="#fff" opacity="0.9" />
        <circle cx="22" cy="20" r="11.5" fill="#fde68a" />
        <path d="M11 19c0-7 5-12 11-12s11 5 11 12c-2-4-6-6-11-6s-10 2-11 6z" fill="#1e293b" opacity="0.7" />
        <path d="M38 40 48 28" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        <circle cx="50" cy="26" r="4" fill="#fde68a" />
      </g>
      <g transform="translate(118 22)">
        <path d="M0 6 16 0l-5 14-3-6z" fill="#fff" opacity="0.95" />
      </g>
    </svg>
  )
}

/** Parents banner art: guardian + child silhouette for coloured heroes. */
export function ParentsBannerScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn('block', className)} aria-hidden>
      <circle cx="80" cy="60" r="46" fill="#fff" opacity="0.12" />
      {/* Adult */}
      <g transform="translate(48 22)">
        <path d="M10 70c0-18 10-30 26-30s26 12 26 30z" fill="#fff" opacity="0.95" />
        <circle cx="36" cy="24" r="15" fill="#fde68a" />
        <path d="M21 22c0-9 7-15 15-15s15 6 15 15c0-4-6-7-15-7s-15 3-15 7z" fill="#1e293b" opacity="0.7" />
      </g>
      {/* Child */}
      <g transform="translate(96 48)">
        <path d="M4 44c0-11 6-18 16-18s16 7 16 18z" fill="#fff" opacity="0.9" />
        <circle cx="20" cy="16" r="11" fill="#fde68a" />
        <path d="M9 15c0-7 5-12 11-12s11 5 11 12c-2-4-6-6-11-6s-10 2-11 6z" fill="#1e293b" opacity="0.7" />
      </g>
      {/* Heart badge */}
      <g transform="translate(108 78)">
        <circle r="13" cx="13" cy="13" fill="#f43f5e" />
        <path
          d="M13 20c-4-3.2-7-5.6-7-8.4A3.6 3.6 0 0 1 13 9.2 3.6 3.6 0 0 1 20 11.6C20 14.4 17 16.8 13 20z"
          fill="#fff"
        />
      </g>
    </svg>
  )
}

/** Empty-state art: an open calendar with nothing on it. */
export function EmptyCalendarScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 96" className={cn('block', className)} aria-hidden>
      <rect x="16" y="18" width="88" height="66" rx="8" fill="var(--surface-2)" stroke="var(--border-strong)" />
      <path d="M16 34h88" stroke="var(--border-strong)" />
      <rect x="16" y="18" width="88" height="16" rx="8" fill="var(--product-500)" opacity="0.18" />
      <g stroke="var(--border-strong)" strokeWidth="3" strokeLinecap="round">
        <path d="M38 12v10M82 12v10" />
      </g>
      <g fill="var(--border)">
        <rect x="28" y="44" width="14" height="10" rx="3" />
        <rect x="50" y="44" width="14" height="10" rx="3" />
        <rect x="72" y="44" width="14" height="10" rx="3" />
        <rect x="28" y="60" width="14" height="10" rx="3" />
        <rect x="50" y="60" width="14" height="10" rx="3" />
        <rect x="72" y="60" width="14" height="10" rx="3" />
      </g>
    </svg>
  )
}

/** Empty-state art: a signpost, used where a module is not built yet. */
export function UnderConstructionScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 110" className={cn('block', className)} aria-hidden>
      <ellipse cx="70" cy="98" rx="46" ry="7" fill="var(--text)" opacity="0.06" />
      <path d="M68 30h5v66h-5z" fill="var(--border-strong)" />

      <g transform="translate(20 30)">
        <rect width="70" height="20" rx="5" fill="var(--product-500)" opacity="0.9" />
        <g fill="#fff" opacity="0.75">
          <rect x="10" y="8" width="34" height="4" rx="2" />
        </g>
      </g>
      <g transform="translate(50 58)">
        <rect width="62" height="18" rx="5" fill="var(--chart-staff)" opacity="0.9" />
        <g fill="#fff" opacity="0.8">
          <rect x="10" y="7" width="26" height="4" rx="2" />
        </g>
      </g>

      {/* Spark, to keep the tone forward-looking rather than broken */}
      <g stroke="var(--chart-attendance)" strokeWidth="2.5" strokeLinecap="round" opacity="0.8">
        <path d="M112 22v8M108 26h8M26 14v6M23 17h6" />
      </g>
    </svg>
  )
}

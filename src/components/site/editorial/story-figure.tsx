import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The figure at the head of a case study.
 *
 * The reference sets photography here. This site has none, and the case
 * studies these sit on are marked `sample: true` — so a photograph of a school
 * would be a picture of a school that is not a customer, attached to an
 * implementation that has not happened, which is exactly the one dishonest
 * element the rest of the page is careful to avoid. Drawn instead: what the
 * card is actually about is the SHAPE of the school — one building, a campus,
 * a group of campuses — and a drawing can say that where a stock photograph of
 * a corridor cannot.
 *
 * Consistent with `public/images/README.md`: every visual on the site is either
 * the live product or inline SVG. These are the second kind, so they cost no
 * request, no layout shift and no licence.
 *
 * All three are drawn on the same 400x300 field, on the same ground line, at
 * the same stroke weight, and all mass is kept above y=200 — the lower third
 * belongs to the school's name, which is set over the top of this.
 */

const STROKE = 2.5

/** One building: the single-site day school. */
function DaySchool() {
  return (
    <>
      <rect x="110" y="110" width="180" height="90" rx="3" className="fill-[var(--ed-sky)]/10" />
      <path d="M100 110 200 62 300 110" className="stroke-[var(--ed-sky)]" />
      <path d="M110 110v90h180v-90" />
      <path d="M200 62V32" className="stroke-[var(--ed-sky)]" />
      <path d="M200 35l30 8-30 9z" className="fill-[var(--ed-sky)] stroke-[var(--ed-sky)]" />
      {/* Door, centred, because a single building has one way in. */}
      <path d="M186 200v-38h28v38" />
      {/* Two either side of the door. Evenly spaced by 38 so none of them
          overlaps its neighbour — 26 wide leaves a 12 gap. */}
      {[128, 166, 224, 262].map((x) => (
        <rect key={x} x={x} y="126" width="26" height="22" rx="2" />
      ))}
      <circle cx="66" cy="172" r="21" className="stroke-[var(--ed-mint)]" />
      <path d="M66 193v7" className="stroke-[var(--ed-mint)]" />
      <circle cx="338" cy="180" r="15" className="stroke-[var(--ed-mint)]" />
      <path d="M338 195v5" className="stroke-[var(--ed-mint)]" />
    </>
  )
}

/** A campus with a tower, and the globe that makes it international. */
function InternationalSchool() {
  return (
    <>
      <rect x="182" y="92" width="80" height="108" rx="3" className="fill-[var(--ed-sky)]/10" />
      <path d="M62 200v-58h108v58" />
      <path d="M182 200V92h80v108" />
      <path d="M272 200v-44h74v44" />
      {[76, 116].map((x) => (
        <rect key={x} x={x} y="156" width="28" height="20" rx="2" />
      ))}
      {[196, 232].map((x) =>
        [110, 144].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="26" height="20" rx="2" />),
      )}
      {[286, 318].map((x) => (
        <rect key={x} x={x} y="168" width="22" height="18" rx="2" />
      ))}
      {/* The globe sits above the tower rather than beside it, so the eye
          reads campus first and reach second. */}
      <circle cx="222" cy="52" r="26" className="stroke-[var(--ed-sky)]" />
      <ellipse cx="222" cy="52" rx="10.5" ry="26" className="stroke-[var(--ed-sky)]" />
      <path d="M196 52h52M200 39h44M200 65h44" className="stroke-[var(--ed-sky)]" />
    </>
  )
}

/** Three buildings and the line between them: the group. */
function CampusGroup() {
  return (
    <>
      <rect x="48" y="150" width="86" height="50" rx="3" className="fill-[var(--ed-amber)]/12" />
      <rect x="157" y="122" width="86" height="78" rx="3" className="fill-[var(--ed-amber)]/12" />
      <rect x="266" y="158" width="86" height="42" rx="3" className="fill-[var(--ed-amber)]/12" />
      <path d="M48 200v-50h86v50M157 200v-78h86v78M266 200v-42h86v42" />
      {[62, 98].map((x) => (
        <rect key={x} x={x} y="164" width="24" height="18" rx="2" />
      ))}
      {[171, 207].map((x) =>
        [136, 168].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="24" height="18" rx="2" />),
      )}
      {[280, 316].map((x) => (
        <rect key={x} x={x} y="170" width="24" height="18" rx="2" />
      ))}
      {/*
        The line is the point of this one. Three campuses on one database is
        the claim, so the connection is drawn as a single unbroken stroke
        across all three rather than as two separate links.
      */}
      <path d="M91 128Q145 88 200 96Q255 104 309 134" className="stroke-[var(--ed-rose)]" />
      {[
        [91, 128],
        [200, 96],
        [309, 134],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="6.5" className="fill-[var(--ed-rose)] stroke-[var(--ed-rose)]" />
      ))}
    </>
  )
}

const FIGURES = [DaySchool, InternationalSchool, CampusGroup]

export function StoryFigure({ index, className }: { index: number; className?: string }) {
  const Figure = FIGURES[index % FIGURES.length] ?? DaySchool

  return (
    <svg
      viewBox="0 0 400 300"
      fill="none"
      aria-hidden
      preserveAspectRatio="xMidYMax meet"
      className={cn('h-full w-full', className)}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      // The default for anything that does not name its own colour. Set here
      // rather than per element so a figure cannot end up half-toned.
      stroke="color-mix(in srgb, var(--ed-ink) 42%, transparent)"
    >
      <Figure />
      {/* The ground the three of them stand on. */}
      <path d="M24 200h352" stroke="color-mix(in srgb, var(--ed-ink) 22%, transparent)" />
    </svg>
  )
}
